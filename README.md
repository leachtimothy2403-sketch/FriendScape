# Migo

> A safe, joyful social world built just for kids — where AI friends help children explore, create, and grow at their own pace.

## What is Migo?

Migo is a children's social platform where kids aged 4–12 can:

- **Chat and share** posts with AI companions tailored to their interests and personality
- **Earn badges** and grow their world by completing learning adventures
- **Express themselves** through text, drawings, stickers, and audio — all safely moderated
- **Build emotional vocabulary** and social skills in a fully age-appropriate environment

Parents stay in control through the **Parent Dashboard** — setting screen time limits, reviewing activity, managing AI friend access, and receiving instant alerts when something needs their attention.

---

## Project Structure

```
/friendscape
  /app          ← React Native Expo app (child-facing)
  /server       ← Node.js / Express API
  /dashboard    ← React web app (parent-facing)
  /shared       ← TypeScript types shared across all three
  .env.example  ← environment variable template
```

---

## Prerequisites

- **Node.js** 20+
- **PostgreSQL** 15+
- **Redis** 7+
- **Expo CLI**: `npm install -g expo-cli`
- An **Anthropic API key** (for AI friends)

---

## Quick Start (Windows)

### 1. Clone and install all dependencies

Open **three separate terminals** (or use Windows Terminal with tabs).

```powershell
# From the /friendscape root:
cd server && npm install
cd ../dashboard && npm install
cd ../app && npm install
cd ../shared && npm install
```

### 2. Set up environment variables

```powershell
Copy-Item .env.example server\.env
```

Edit `server\.env` with your real DATABASE_URL, REDIS_URL, JWT_SECRET, and ANTHROPIC_API_KEY.

### 3. Create the database

```powershell
# In PostgreSQL (psql or pgAdmin):
CREATE DATABASE friendscape;
```

### 4. Run migrations

```powershell
cd server
npm run migrate
```

### 5. Start all three services

**Terminal 1 — API server:**
```powershell
cd server && npm run dev
# → http://localhost:3001
```

**Terminal 2 — Parent dashboard:**
```powershell
cd dashboard && npm run dev
# → http://localhost:3000
```

**Terminal 3 — Mobile app:**
```powershell
cd app
$env:REACT_NATIVE_PACKAGER_HOSTNAME = "192.168.1.15"
npx expo start
```

---

## API Routes

| Method | Path | Description |
|--------|------|-------------|
| POST | `/auth/register` | Create parent account |
| POST | `/auth/login` | Login and receive JWT |
| GET | `/children` | List parent's children |
| POST | `/children` | Create child profile |
| GET | `/friends` | List all AI friends |
| GET | `/posts/feed/:childId` | Child's social feed |
| POST | `/messages/dm/:childId/:friendId` | Send a message |
| GET | `/parent/alerts` | Parent alert inbox |
| GET | `/parent/children/:childId/posts` | Child's recent posts |
| GET | `/parent/children/:childId/messages` | Child's recent messages |
| GET | `/parent/children/:childId/stats` | Child's stats summary |

---

## App Screens

| Screen | Path | Description |
|--------|------|-------------|
| Enrol | `/enroll` | Landing — parent sets up a child |
| Onboarding | `/onboarding/basics` → `/allset` | 9-step child profile wizard |
| Waiting | `/waiting` | Animated loading screen |
| Celebration | `/celebration` | Welcome to Migo! |
| Feed | `/(tabs)/feed` | Social feed |
| Discover | `/(tabs)/discover` | Find new AI friends |
| Badges | `/(tabs)/badges` | Achievements and milestones |
| Profile | `/(tabs)/profile` | Child's own profile |
| DM | `/dm/[friendId]` | Direct chat with an AI friend |

---

## Colour Palette

| Name | Hex |
|------|-----|
| Purple | `#7F77DD` |
| Green | `#5DCAA5` |
| Orange | `#EF9F27` |
| Pink | `#ED93B1` |
| Red | `#D85A30` |
| Background | `#F8F7FF` |

---

## Tech Stack

| Layer | Tech |
|-------|------|
| Mobile | Expo 54, React Native 0.81, Expo Router v6, NativeWind v4 |
| Web | React 18, Vite 5, React Router v6, Tailwind CSS |
| API | Node.js, Express 4, TypeScript, Knex, PostgreSQL |
| Cache | Redis (ioredis) |
| AI | Anthropic SDK (`claude-sonnet-4-6`) |
| Auth | JWT (jsonwebtoken + bcryptjs) |
| Email | Nodemailer |
| TTS | ElevenLabs |

---

## Next Steps

- [ ] Implement JWT refresh token rotation (Redis-backed)
- [ ] Email verification flow
- [ ] Password reset flow
- [ ] Push notifications (Expo Notifications)
- [ ] Weekly report email generation
- [ ] Content moderation pipeline
- [ ] Expo EAS build & OTA updates setup
