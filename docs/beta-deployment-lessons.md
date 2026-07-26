# Beta Deployment Lessons — myMigo

Issues discovered while standing up the isolated beta environment (`api-test.mymigo.fr` / `mymigo_beta`) alongside the existing dev/production backend (`api-dev.mymigo.fr` / `mymigo_dev`). Kept for reference when building out the real production environment, or spinning up any future isolated environment.

## 1. Build-time env vars can silently go stale

**What happened:** Every build (including one built well after the beta backend was fully working) shipped with `EXPO_PUBLIC_API_URL` baked in as the *old* value, even though `eas.json`'s profile correctly declared `"environment": "preview"` and EAS's hosted variable for that environment was — at the time we checked — correctly set to the new value.

**Root cause:** EAS bakes `EXPO_PUBLIC_*` variables into the JS bundle at the moment a build runs, using whatever the hosted environment variable was *at that time*. A build made before the variable was corrected keeps the old value forever — updating the variable afterward does not retroactively fix already-built artifacts. There is no warning anywhere that a specific build is "stale" relative to the current variable value.

**How we actually found it:** Every indirect check (build log's "Environment variables" summary, `eas env:list --environment <name>`, Caddy config, DNS, TLS certificate/SNI, port/PID binding) came back correct and still didn't explain the wrong behavior. The only fully conclusive test was extracting the actual build artifact (`.aab`/`.ipa`, which are just zip files) and grepping the compiled JS bundle directly for the literal URL strings:

```powershell
Copy-Item mybuild.aab mybuild.zip
Expand-Archive mybuild.zip -DestinationPath mybuild_extracted
Select-String -Path "mybuild_extracted\base\assets\index.android.bundle" -Pattern "api-dev\.mymigo\.fr","api-test\.mymigo\.fr"
```

Even though production RN bundles are Hermes bytecode (binary), literal string constants like URLs remain readable in the bytecode's string table, so this grep works reliably.

**For production:** Whenever an environment variable is changed on EAS, treat every existing build as suspect until a *new* build is made and its artifact is grepped directly. Don't trust the build log's variable listing as proof of what's actually embedded — it reflects EAS's resolution at build time, but a misdiagnosis of "the log says X" without checking the actual bundle wasted significant time here.

## 2. `eas build` and `eas submit` are two separate steps

Building an app on EAS does not automatically upload it to App Store Connect or Google Play. A completed build can sit indefinitely as an EAS artifact without ever reaching TestFlight/Play Console if `eas submit` is never run. If a build "isn't showing up" on the store side, check whether it was ever submitted before assuming something is broken.

## 3. Shared Redis between environments

**What happened:** Both `mymigo-dev` and `mymigo-beta` had `REDIS_URL=redis://127.0.0.1:6379` in their respective `.env` files — the exact same Redis instance and logical database (db 0). Cached data, online-status tracking, rate limiting, etc. were being read/written by both environments into the same keyspace without anyone intending that.

**Fix:** Give each environment its own logical Redis database via the URL's path segment:
```
REDIS_URL=redis://127.0.0.1:6379/1
```
(db 0 = dev, db 1 = beta, etc.) No second Redis instance needed.

**For production:** Explicitly assign and document a distinct Redis DB index (or a fully separate Redis instance) per environment from day one. This is easy to miss because both processes start up and log "✅ Redis connected" successfully — nothing about a shared keyspace throws an error.

## 4. Static assets (avatars, audio) live per-checkout, not in the database alone

Generated images (`server/public/avatars/*.jpg`) and generated audio (`server/public/audio/*.wav`) are stored on local disk relative to each server checkout, referenced from the database by URL/filename. A fresh environment's database migrations/seeds do **not** bring these files along — a brand new environment starts with zero cached avatars and zero cached audio, even though the DB rows referencing them may already exist (star friends, mascots) or will be generated fresh (per-child friends).

**Migration approach used (avatars):**
- `mascot_avatars.id` is a stable text key (`miga`/`pixel`/`finn`/`sage`) — direct row copy works.
- `ai_friends.id` is a random UUID that differs per database, but `ai_friends.name` is stable for the fixed "star friends" — migrate `avatar_url` by matching on `name`, not `id`.
- Physical files: `robocopy` the whole `public/avatars` folder across; harmless to bring over "extra" files from generated per-child content.
- After copying DB rows, bulk-replace the old environment's domain in the migrated URLs (`REPLACE(avatar_url, 'api-dev.mymigo.fr', 'api-test.mymigo.fr')`) so images resolve against the new environment's own static file server instead of silently depending on the old one staying up.

**Migration approach used (audio):** Cache keys are a pure hash of `characterId + language + text` with no environment-specific component, so the entire `public/audio` folder can be `robocopy`'d across directly — no DB involvement needed. This covers all genuinely *static/shared* narration (onboarding, mascot bubbles, tour steps, star friend intros). It intentionally does **not** cover per-child generated friends with unique names — those aren't meant to be pre-shared, and will generate live on first use in any environment, same as production always does.

**For production:** Before opening any new environment to real users, proactively run `npm run audio:pregenerate` (or migrate from an existing environment) rather than letting the first wave of onboarding users hit live Gemini TTS generation for shared content. Gemini TTS on this project is rate-limited to 10 requests/minute — several concurrent new users during a launch could exhaust that quota and cause audio failures mid-onboarding if the static cache isn't warm first.

## 5. Onboarding child-creation was not idempotent

**What happened:** A single onboarding attempt could create two `children` rows (and two full sets of generated AI friends) instead of one.

**Root cause:** `createChildFromOnboarding` (`server/src/controllers/children.controller.ts`) unconditionally inserted a new child row on every call. The only duplicate-guard in the function checked for existing friends keyed on the *newly-created* child's own id — which is always fresh, so it could never actually catch a repeat call. On the client (`app/onboarding/allset.tsx`), a module-level flag only prevented React's double-mount within the same JS session; if the app was backgrounded long enough during the slow "creating your friends" step that iOS suspended/killed the in-flight request, the client would see a failure (even though the server may have already committed the child) and either auto-retry on remount or via a user-tapped Retry button — creating a second full record under the same enrollment.

**Fix applied:** Added an idempotency check keyed on the enrollment row's `child_device_id` (already stamped after first success) — if already set, look up and return the existing child + friends instead of creating new ones.

**For production:** Any onboarding/creation flow reachable from a mobile client should assume the network request can be interrupted mid-flight (backgrounding, connectivity loss, timeout) and that the client may retry. Idempotency needs to live on the server, keyed on something stable that exists *before* the object being created (an enrollment id, a client-generated idempotency token, etc.) — not on the id of the row the request is trying to create.

**Still open (lower priority):** the client still briefly shows an error screen if backgrounded mid-request even though data is now safe from duplication. Making the request itself resilient to backgrounding (e.g. a background task, or checking server state on relaunch before retrying) would improve the UX but wasn't required to fix the data integrity issue.

## 6. PM2 on Windows can leave unkillable "zombie" processes

Twice during this work, a PM2-managed Node process became completely unresponsive — not just to `pm2 restart`, but to `taskkill /F` and even PowerShell's `Stop-Process -Force` (one returned "operation returned because the timeout period expired"). `pm2 ping` still responded normally in these cases, meaning the PM2 daemon itself was fine — only the individual child process was wedged at the OS level. The only reliable fix both times was a full VPS restart via the hosting provider's KVM console.

**Suspected contributing factors (not fully confirmed):**
- Running the server via `ts-node` directly (`ts-node -r dotenv/config src/index.ts`) rather than a compiled build — heavier memory footprint, recompiles on every restart.
- Windows lacks POSIX signal semantics, so PM2/Node's process termination on Windows is generally less reliable than on Linux, especially after a crash.
- Frequent crash/restart cycles increase the chance of Windows leaving a socket in a half-closed state that later can't be cleanly reclaimed.

**Mitigations to adopt for production, before it becomes a beta-testing outage:**
- Run compiled JS (`node dist/index.js`, matching `package.json`'s own `start` script) instead of `ts-node` for anything beta-facing or beyond.
- Add `max_memory_restart` to each app's `ecosystem.config.js` entry so PM2 proactively restarts a process before memory growth destabilizes the box, rather than discovering it via a hang.
- If it recurs, capture Task Manager memory/CPU and Windows Event Viewer (System log) at the time of the hang *before* rebooting — this would let us actually confirm memory exhaustion vs. a Redis/Postgres connection issue vs. something at the hypervisor level, which we were never able to pin down for certain here.

## 7. Server-side VPS git checkouts can have stray local changes blocking `git pull`

A VPS checkout unrelated to the file in question (`app/eas.json`, irrelevant to running the server) had uncommitted local changes that blocked `git pull` with a merge-conflict-style error. Always `git status`/`git diff` on a server checkout before pulling — on a server checkout, any local changes are almost always either accidental or leftover from manual debugging, and safe to discard (`git checkout -- <file>`) rather than merge.

## 8. TTS is not actually streamed to the client, despite the naming

`generateSpeechStream` sounds like it delivers audio progressively, but it fully buffers Gemini's entire response server-side (collecting all PCM chunks, converting to a complete WAV, writing to disk) before returning anything — then just 302-redirects to the finished file. The client always waits for the *entire* line to finish generating before any audio plays, in every environment. Not a bug, just worth knowing if snappier perceived audio latency becomes a priority for production — true progressive playback would be a real architecture change, not a config fix.

## 9. General principle that paid off repeatedly

Don't trust a tool's *summary* of state as proof of the actual state — verify the artifact directly. This applied to: EAS's build-log environment variable listing (didn't match the actual compiled bundle), PM2's built-in `axm_monitor` request-rate metric (asymmetric between processes, ended up proving nothing), and "already correct, no changes needed" type claims generally. The decisive test was almost always the most direct one available (grep the actual bundle, compare DB row counts before/after an action, diff the actual `.env` files) rather than a higher-level status report about them.
