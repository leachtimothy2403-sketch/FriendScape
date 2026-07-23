# myMigo — Session Handover (July 2026)

This covers what changed in this specific session. General project context (stack, environment quirks, how Tim and Claude work together) lives in the standing project instructions — this is just the current state and what's left to do.

## ⚠️ Immediate next step: nothing from this session is committed or deployed yet

Everything below is sitting as uncommitted local changes plus two migrations already run **locally only**. Before anything else:
1. `git add -A && git commit` (commit message already drafted — see "Commit message" section below)
2. `git push`
3. On the VPS: `git pull`, then `npx knex --knexfile src/db/knexfile.ts migrate:latest` (from `server/`), then `pm2 restart mymigo-dev`
4. Since `app/` also changed (see below), a new iOS build is needed: `eas build --platform ios --profile preview`, then `eas submit --platform ios --profile preview --latest`, then assign the new build to the external testing group in App Store Connect (submits it for Beta App Review automatically)

Both `npx tsc --noEmit` (server/ and app/) and both new migrations have already been run and verified locally — just not pushed/deployed anywhere yet.

---

## What was fixed this session

**Three AI-generated post-image bugs** (Chloé rendering as an adult, Inès getting a black/flagged image, Jules getting a garbled-fake-text image):
- `avatar.service.ts`: `negative_prompt` now conditional on `isAdult` (was unconditionally excluding "adult," which would've broken real adult characters like Sophie/Jules); added a deterministic age-descriptor appended directly to the final scene prompt sent to fal, since relying on Claude Haiku alone to preserve age wasn't reliable; retry loop + NSFW-flag check already existed, kept.
- `dailyPosts.ts`: fixed the star-friend pass treating a null age as "adult" (regular per-child pass already handled this correctly).
- **Real root cause of Chloé's null age**: not seed drift — the "friend of a friend" mini-character generator (`generateFriendNetwork`'s `'new'` branch in `children.controller.ts`) never set an `age` field at all on insert. Fixed by adding `age: ageNum`. Live row already patched via a one-off `UPDATE` using the actual child's own age.

**Legacy seed data removed**: the old seeded "network friends" system (Mia/Jake as hub characters, Léa/Tom/Chloé/Hugo/Nico/Camille/Luca/Sofia as fixed side-characters) predated the current design where every non-star friend is uniquely generated per child. Removed from `01_ai_friends.ts`, gutted `03_friend_networks.ts` to a no-op. 10 unused legacy rows + 5 orphaned duplicate rows (from a separate name-collision bug, see next) already deleted from the live DB.

**Name generation reliability**: `generateFriendNetwork` (the "mini-character" generator) had no name-collision guard at all, unlike the primary friend generator — this caused real orphaned duplicate "Léa"/"Camille" rows. Fixed: extracted a shared `RESERVED_FRIEND_NAMES` constant (the 9 real current star/teacher characters) used by both generators, and replaced the tiny 3-4 name examples in both prompts with a 20-name-per-gender/language pool plus an explicit "don't default to the same names" instruction (LLMs strongly gravitate toward literal examples shown in a prompt — this was the actual cause of repeat names, not bad luck).

**Six smaller bug fixes** (from screenshots Tim provided):
- Date-of-birth picker showing garbled month codes (`M01` instead of real month names) — added explicit `locale` prop to both DateTimePicker instances in `app/app/parent-add-child.tsx`. Best-supported fix (known library quirk), not 100% confirmed as root cause — worth checking after the next build whether it was already happening on the very first child too.
- Picture-only posts auto-filled the caption with the AI-generated scene description — now stays blank; a separate `commentContext` variable still passes the description internally so friends' auto-comments on the post have something to react to (`posts.controller.ts`).
- Voice transcription included non-speech tags like "(sound of wind)" — added `tag_audio_events: false` to the ElevenLabs call (`audio.service.ts`), confirmed via their API docs as the exact flag (defaults to true).
- Mic recording required a manual tap to send after transcribing — now auto-sends immediately (`app/app/dm/[friendId].tsx`).
- Jules gave away vocabulary terms too fast instead of guiding — added a rule to his `personality_prompt` requiring one more guiding question when an answer is correct but doesn't use the target term yet. Seed file updated **and** live DB row already patched via a one-off `UPDATE` (confirmed done).
- A `tsc` error from `negative_prompt` not existing on fal's TS types — fixed with `as never`, matching the existing pattern already used elsewhere in the codebase.

**Badge system reworked — semantic classification instead of keyword matching**:
- `generateFriendReply` and `generateJulesReply` (`ai.service.ts`) now return structured JSON (`{reply, childMessageWasEncouraging, childMessageWasComforting, imageTopic}`) instead of plain text, via a shared `REPLY_JSON_INSTRUCTION` + `parseStructuredReply()` helper (falls back to raw text if JSON parsing ever fails, so this can never break the actual chat). Same Claude call as before — no added API cost.
- `encouraging_messages` badge (Mots Gentils) now counts a stored `is_encouraging` flag instead of an ILIKE keyword list. The old list had a real bug (a JS unicode-escape for "génial" that Postgres treated as 6 literal characters, never matching anything) and couldn't handle negation ("ce n'est pas génial").
- `kind_words` badge (Cœur Généreux) now checks `childMessageWasComforting`, which Claude judges against actual conversation history, replacing two separate fragile keyword lists.
- Removed the now-redundant weekly badge-award logic from `migaObserver.ts` (kept its digital-citizenship coaching-DM logic).
- **Scope decision, not yet acted on**: Sophie (`generateSophieReply`) and Ms. Luna (`generateTutorReply`) are NOT covered by this classification — Sophie has a meaningfully different reply architecture (separate meta-analysis call), and teachers were already excluded from kind_words historically. Net effect: messages to Sophie no longer count toward Mots Gentils, whereas the old blanket keyword match used to include her. Revisit if this matters.

**New: content image library** — a friend can now attach a simple illustrative image to a chat reply (e.g. Jules showing a compass). New `content_images` table (tags, descriptions, url). `resolveContentImage()` in `avatar.service.ts` checks the library by tag first; only generates (via the same Claude-Haiku-prompt + fal.ai + retry/NSFW-check pipeline already used for posts) and caches a new one if nothing matches — so the first request for a topic takes a few seconds, every later request for that topic is instant. Wired into `messages.controller.ts` (`image_url` column on `messages`) and rendered client-side in `app/app/dm/[friendId].tsx`'s message bubble.

**Two new migrations** (already run locally, not yet on VPS):
- `20240601_047_add_classification_and_image_to_messages.ts` — `is_encouraging`, `is_comforting`, `is_bad_day_moment` (booleans), `image_url` (nullable text) on `messages`.
- `20240601_048_create_content_images.ts` — new `content_images` table.

---

## Commit message (drafted, ready to use)

```
Semantic badge classification, content image library, and a batch of bug fixes

Bug fixes:
- Date-of-birth picker: add explicit locale prop — fixes garbled month
  labels (iOS DateTimePicker falls back to raw codes without one)
- Picture-only posts: leave the caption blank instead of auto-filling
  the generated scene description; friends' auto-comments still use
  the description internally so they have something to react to
- Voice transcription: set tag_audio_events: false on the ElevenLabs
  call — stops "(sound of wind)"-style non-speech tags leaking into
  the chat input
- Mic recording: auto-send the message immediately after stopping,
  instead of requiring a separate tap
- Jules: added a rule requiring one more guiding question before
  supplying a vocabulary term the child hasn't used yet, even when
  their answer is already correct

Badge system — replaced keyword matching with semantic classification:
- generateFriendReply and generateJulesReply now return structured
  JSON {reply, childMessageWasEncouraging, childMessageWasComforting,
  imageTopic} instead of plain text — same Claude call, no added cost
- encouraging_messages (Mots Gentils) is now a stored is_encouraging
  flag set from that classification, replacing an ILIKE keyword list
  that had a real bug (a JS unicode-escape for "génial" never actually
  matched anything) and couldn't handle negation ("ce n'est pas génial")
- kind_words (Cœur Généreux) now checks childMessageWasComforting,
  which Claude judges against real conversation history, replacing two
  separate fragile keyword lists
- Removed the now-redundant weekly award logic from migaObserver.ts
  (badges are checked live per-message now, not once a week)
- Note: Sophie and Ms. Luna conversations are not covered by this
  classification (different reply architecture / already excluded) —
  messages to them no longer count toward these two badges, whereas
  the old blanket keyword match did

Content image library:
- New content_images table (tags, descriptions, url) — a friend's
  reply can include an imageTopic; server checks the library by tag
  first, generates + caches one via the existing post-image pipeline
  (Claude Haiku prompt + fal.ai + retry/NSFW-check) only if nothing
  matches yet
- Wired into chat messages (image_url column) and rendered in the DM
  screen's message bubble

Also: removed legacy seeded "network friends" system (Mia/Jake hub
characters + 8 fixed side-characters) from 01_ai_friends.ts and
03_friend_networks.ts — superseded by per-child friend generation;
corresponding unused/orphaned DB rows already cleaned up. Added a
shared RESERVED_FRIEND_NAMES list + wider name pool to reduce
generated-friend name collisions (was causing duplicate "Léa" rows).

Migrations: 20240601_047 (messages: is_encouraging, is_comforting,
is_bad_day_moment, image_url), 20240601_048 (content_images table)
```

---

## Marketing materials (separate from app code, not deployed)

Built this session in `friendscape/marketing/`:
- `beta-guide.html` — bilingual EN/FR, self-contained, single-file beta tester guide (install instructions for iOS TestFlight + Android sideload, onboarding walkthrough, feature overview, safety reassurance, feedback contact). **Has two placeholders still needing real values before publishing**: the TestFlight link and the Android install link/QR. Contact email is already set to `hello@mymigo.fr`. Not yet deployed — Tim believes mymigo.fr runs on Vercel but wasn't fully certain; no existing marketing/landing folder was found in this repo, so the plan is to drop this single file into whatever hosting already exists.
- `video-script.md` — 9-scene bilingual (FR/EN) walkthrough script, ~100-110 seconds, identical scene numbers across both languages so the same screen-recording footage can be reused for both language versions.
- `generate-narration.js` (also copied into `server/generate-narration.js` — **that's the one to actually run**, since Node's `require()` resolution needs it inside `server/` to find `wav`/`@google/genai` in `server/node_modules`) — standalone Gemini TTS script, generates one WAV per scene per language into a `narration/` folder using the existing `GOOGLE_API_KEY`. Default voice is "Zephyr" for both languages (easy to change at the top of the file). **Gotcha**: the script skips any scene file that already exists — if scene 9 was generated before a wording fix (the closing line was corrected to not name a specific mascot, and to add the `hello@mymigo.fr` email), delete `fr_scene9.wav`/`en_scene9.wav` before re-running so the corrected line actually gets used. Not yet confirmed run successfully end-to-end by Tim.

Tim is recording the app screen himself; recommended vertical (9:16) format, Clipchamp or CapCut for assembly, reuse the same footage for both language exports by swapping the narration audio folder.

---

## Deferred / explicitly not done this session

- Extending semantic classification to Sophie's and Ms. Luna's reply paths (flagged as a scope decision above, not started).
- Real Postgres-backed integration tests (discussed in detail — test DB, migration-aware Jest bootstrap, truncate-based isolation, ~15-20 tests for auth/onboarding/add-friend) — Tim said hold off given everything else queued.
- Everything from before this session that was still open as of the last handover: Android Play Store internal testing setup, interim privacy policy draft, confirming RDP restriction + off-VPS backup copy + encryption-at-rest for the DPIA, and the "introduce a friend" QR-code feature (intentionally deferred to post-beta).
