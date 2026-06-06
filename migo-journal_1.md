# Migo — Full Development Journal
*Generated from Claude.ai session — June 2026*

## Project Overview
**Migo** (formerly Friendscape) is a children's AI social app for ages 5-12.
- Monorepo: `C:\Users\leach\friendscape\`
- `/app` — React Native, Expo SDK 52
- `/server` — Node.js / Express / PostgreSQL / Redis (port 3001)
- `/dashboard` — React / Vite parent dashboard (port 3000)
- Docker: `friendscape-pg` + `friendscape-redis`
- AI: Anthropic Claude API
- Voice: ElevenLabs
- i18n: react-i18next (en.json + fr.json)
- Target market: France (EN + FR bilingual)

## Key People
- **Tim** — founder/developer
- **Juliette** — Tim's daughter, age 12, shy, EN, cats/TV/theatre (dry run tester)
- **Anne-Sophie** — Tim's other daughter (also tested)
- **Morgan** — nephew, age 11, FR, football/bike/Lego/gaming (brother's visit)
- **Camille** — niece, age 8, FR, princesses/coloring/cheerleading (brother's visit)

## Architecture Decisions
- 9-step onboarding: basics → needs → photo → mascot → role → interests → personality → pack → allset
- 3 custom AI friends generated per child (no star friend auto-assign)
- Star friends (Zara, Coach Mike, Ms. Luna etc) discoverable via Discover tab
- `introMessage` (not `matchReason`) — first-person greeting from friend to child
- Ms. Luna = Mme Luna in French
- `npm run start:local` sets REACT_NATIVE_PACKAGER_HOSTNAME automatically
- 120s timeout on `createFromOnboarding()`
- Auto-kill port 3001 on server start
- Dev reset button on enrol screen (DB + cache)

## Database Tables (21+)
users, children, enrollments, ai_friends, ai_friend_network, child_friends,
child_memories, posts, post_reactions, post_comments, messages, conversations,
parent_alerts, child_badges, badge_definitions, child_sessions, learning_sessions,
onlineStatus cron updates ai_friends.is_online every 5 min

## Key Files
- `server/src/services/ai.service.ts` — all Claude API calls
- `server/src/controllers/children.controller.ts` — onboarding, friend generation
- `server/src/controllers/messages.controller.ts` — typing delays, game handlers
- `app/app/dm/[friendId].tsx` — DM screen, games, typing indicator
- `app/app/onboarding/allset.tsx` — shows 3 friends with introMessage speech bubbles
- `app/store/onboardingStore.ts` — Zustand with platform-aware persistence
- `app/components/Avatar.tsx` — SVG avatar renderer
- `app/components/DevResetButton.tsx` — dev-only DB + cache reset
- `app/types/avatar.ts` — AvatarConfig interface, DEFAULT_AVATAR, palettes
- `shared/types/avatar.ts` — same, for server use

## Features Built
✅ Full 9-step onboarding with personality profiling (5 questions + free text)
✅ AI friend generation — 3 custom friends via Claude API using full child profile
✅ Friend networks + discovery (ai_friend_network table)
✅ Friend of friend — welcome DMs with Redis lock (no duplicates)
✅ Conversation history (last 15 msgs) passed to every Claude call
✅ Child's friend list injected into system prompt (no amnesia)
✅ Reply delays: word-count based curve (0.8s/0.4s/0.2s per word)
✅ Online status per friend (cron every 5 min, personality-weighted)
✅ Typing indicator with "typing..." text
✅ Photo messages to Ms. Luna (compressed to 800px, 2s flat delay)
✅ Rate limit retry logic (3 retries at 15s/30s/45s)
✅ In-app notification banner + browser notifications
✅ DM Games: Rock Paper Scissors, Tic-Tac-Toe, Story Builder (🎮 button)
✅ Feed with daily AI posts + friend comments on child posts
✅ Ms. Luna: grade capture, curriculum search (eduscol.education.fr), Socratic method
✅ Ms. Luna: never gives answers, 4 escalating different explanation approaches
✅ Ms. Luna: photo homework help, disability adaptations
✅ Grade chips UI (CP/CE1/CE2/CM1/CM2/6ème etc) on first Luna interaction
✅ Badges system (10 badges, auto-check after messages/posts/reactions/friends)
✅ Badge recalculate endpoint (POST /api/badges/recalculate)
✅ Graduation track (5 milestones)
✅ Miga digital literacy observer (weekly coaching DMs)
✅ Nightly memory distillation
✅ Screen time tracking (child_sessions)
✅ Parent dashboard (alerts, child detail, mark-as-read)
✅ Safety: crisis detection, mood analysis, parent alerts
✅ Friend check-in after silence (10min dev / 2h prod)
✅ "Already approved" requires email verification (no bypass)
✅ Friend matching: max 1 coach, age-appropriate, no Hugo/Tom/Luca/Camille as starters
✅ Avatar system: SVG renderer (Avatar.tsx), builder UI, profile editor
✅ Avatar database: avatar_config (jsonb) + avatar_background on children
✅ Avatar builder: 5 tabs (Face/Hair/Eyes/Mouth/Extras), live preview, bounce animation
✅ French localisation: 60+ i18n keys, all onboarding screens, tabs, badges, friends
✅ Mme Luna (Ms. Luna in French)
✅ Bio_fr + badge name_fr/description_fr in database
✅ Gender agreement throughout (fort/forte, prêt/prête etc)
✅ Auto-kill port 3001 on server start
✅ Dev reset button (DB + cache) on enrol screen
✅ Post comments from AI friends (60% chance, staggered delays)
✅ Stories row shows ALL friends (not just initial 3)
✅ Keyboard avoidance on all input screens including onboarding
✅ DM bubble height fix for iPad (flexShrink, no flex:1)
✅ Countdown timer removed from typing indicator
✅ Response delays reduced: 3-6s online, 8-12s offline (dev mode)

## In Progress (as of session end)
🔄 Avatar Session 3 (Haiku) — wire Avatar component everywhere in app
   Pending fix: shared/types/avatar import path issue
   Fix: copy to app/types/avatar.ts, update all imports to '@/types/avatar'
   Then run Session 3 Haiku prompt (wire to feed stories, DM, allset, badges)

## Known Issues / Pending
- Luna language inconsistency (sometimes responds in French to English account)
- Rich media posts for demo (predefined images for AI friend posts) — discussed, not built
- Post comments: verify working correctly
- Avatar Session 3 Haiku still needs to run

## Git Log (last commits)
```
217d687 Post dry-run fixes — keyboard, delays, Luna loop...
+ Round 2 fixes — keyboard, 3 custom friends, friend name, badges, Luna math
+ Remove friends selection screen from onboarding - now 9 steps
+ French localisation + logic fixes — 26 issues from testing
+ Avatar system — SVG renderer + DB + API
+ Avatar builder UI + profile editor
```

## Demo Setup
- Brother's visit: Morgan (11, FR) + Camille (8, FR)
- Files: `migo-demo-setup.html` (5-tab interactive setup guide)
- Files: `migo-pitch.html` (EN investor pitch)
- Files: `migo-pitch-fr.html` (FR investor pitch)
- Network: use `ipconfig | findstr "192.168"` for home WiFi IP
- Update `app/.env`: `EXPO_PUBLIC_API_URL=http://[IP]:3001`
- Start sequence: Docker → server → dashboard → app (npm run start:local)

## Start Commands
```powershell
# Docker
docker start friendscape-pg
docker start friendscape-redis

# Server
cd C:\Users\leach\friendscape\server
npm run dev

# Dashboard  
cd C:\Users\leach\friendscape\dashboard
npm run dev

# App
cd C:\Users\leach\friendscape\app
npm run start:local
```

## Claude Code Best Practices (learned)
- Always start prompt with: "Be concise. No narration. Results table only."
- Always ask for file list first and confirm before changes
- Use Haiku for: translations, i18n, find-and-replace, wiring components
- Use Sonnet for: logic bugs, new features, AI prompts, architecture
- Run /compact every 30-40 min in Claude Code
- Exit and restart Claude Code between prompts (fresh context)
- Run parallel sessions for independent Haiku/Sonnet tasks
- Add {timeout: 120000} to createFromOnboarding axios call

## Credentials
- Parent dashboard: leachtimothy2403@gmail.com / password123
- Docker containers: friendscape-pg + friendscape-redis
- Server health: http://localhost:3001/health

## ElevenLabs Voice IDs
- Miga/Charlotte (EN): XB0fDUnXU5powFXDhCwa
- Bella (EN warm/girl): EXAVITQu4vr4xnSDxMaL
- Dorothy (EN energetic): ThT5KcBeYPX3keUQqHPh
- Adam (EN male warm): pNInz6obpgDQGcFmaJgB
- Arnold (EN energetic male): VR6AewLTigWG4xSOukaG
- Antoni (EN thoughtful): ErXwobaYiN019PkySvjV
- Alice (FR female): Xb7hH8MSUJpSbSDYk0k2
- Daniel (FR male): onwK4e9ZLuTAKqWW03F9

