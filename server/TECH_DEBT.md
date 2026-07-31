# Tech debt / follow-ups

## `dist/` output nesting (found 2026-07-31)

**Problem:** `tsc` compiles `server/src/**` into `server/dist/server/src/**` instead of the
expected `server/dist/**`. This is almost certainly because `tsconfig.json`'s `rootDir` is
set one level too high (probably `.` instead of `./src`), so the `server/` segment gets
preserved in the output path.

**Why it matters:** any code that resolves paths relative to `__dirname` (e.g. the static
`public/avatars` and `public/audio` folders used for mascot avatars and pregenerated TTS
audio) ends up pointing at `dist/server/public/...` at runtime — a *different* folder from
the top-level `server/public/...` that's easy to assume is the real one when copying files
by hand. This caused a live bug on beta (2026-07-31): avatar/audio files were copied into
`server/public/avatars` and `server/public/audio`, which looked correct and matched what
existing docs/scripts implied, but the running process was actually serving from
`server/dist/server/public/avatars` and `.../audio`, so nothing showed up until the mismatch
was found and files were copied to the second location too.

**Fix:** correct `rootDir`/`outDir` in `tsconfig.json` so `dist/` mirrors `src/` directly
(i.e. `server/dist/index.js`, not `server/dist/server/src/index.js`). After fixing, update
`package.json`'s `main` and `start` script (`node dist/server/src/index.js` → `node dist/index.js`
or whatever the corrected path is) and re-verify the beta deploy still serves `/avatars` and
`/audio` correctly.

**Not urgent** — doesn't block anything today, but worth doing before the next time static
files need to be copied or synced between environments, to avoid repeating this debugging
session.
