import * as dotenv from 'dotenv';
dotenv.config();

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import db from '../src/db';
import { generateSpeech } from '../src/services/audio.service';
import { connectRedis } from '../src/services/redis.service';

// Duplicated byte-for-byte from app/components/AudioPlayer.tsx — server and app
// are separate TS projects so this can't be imported, only kept in sync by hand.
function nameToCharacterId(name: string): string {
  return name
    .toLowerCase()
    .replace(/\./g, '')
    .replace(/\s+(.)/g, (_, c: string) => c.toUpperCase());
}

// Mirrors the private buildCacheKey() in src/services/audio.service.ts — used only
// to check ahead of time whether an item is already cached, for accurate skip counts.
function buildCacheKey(characterId: string, language: string, text: string): string {
  const hash = crypto.createHash('md5').update(text).digest('hex').slice(0, 12);
  return `${characterId}_${language}_${hash}`;
}

const AUDIO_DIR = path.join(__dirname, '../public/audio');

function isCached(cacheKey: string): boolean {
  return fs.existsSync(path.join(AUDIO_DIR, `${cacheKey}.wav`));
}

type Lang = 'en' | 'fr';

interface AudioItem {
  label: string;
  text: string;
  characterId: string;
  lang: Lang;
  cacheKeyOverride?: string;
}

const MASCOT_IDS = ['pixel', 'finn', 'miga', 'sage'] as const;
type MascotId = typeof MASCOT_IDS[number];

// ─── app/app/onboarding/mascot.tsx — MASCOT_DATA bubbles (characterId={mascot.id}) ───
const MASCOT_BUBBLES: Record<MascotId, { en: string; fr: string }> = {
  pixel: {
    en: "Hi!! I'm Pixel! I love games and gadgets and I always know how to fix things. Pick me! 🤖⚡",
    fr: "Salut !! Je suis Pixel ! J'adore les jeux et les gadgets et je sais toujours comment réparer les choses. Choisis-moi ! 🤖⚡",
  },
  finn: {
    en: "Heeey!! I'm Finn the fox! I know a million jokes and always have big ideas! 🦊😄",
    fr: "Hééé !! Je suis Finn le renard ! Je connais un million de blagues et j'ai toujours de grandes idées ! 🦊😄",
  },
  miga: {
    en: "Hiii!! I'm Miga!! I'm a friendly dragon and I will always have your back! 🐉✨",
    fr: "Coucou !! Je suis Miga !! Je suis un petit dragon magique et je serai toujours là pour toi ! 🐉✨",
  },
  sage: {
    en: "Hoooo there! I'm Sage. A wise owl who knows something about almost everything! 🦉📚",
    fr: "Houuu ! Je suis Sage. Un hibou sage qui sait quelque chose sur presque tout ! 🦉📚",
  },
};

// ─── app/app/onboarding/mascot.tsx — intro phase text, always narrated by "miga" ───
const INTRO_TEXTS: { en: string; fr: string }[] = [
  {
    en: "Hi! Before you meet your friends on Migo, you need a special guide — someone who will always be there for you, celebrate your wins, and keep you safe. That guide is called your mascot! 🌟 In a moment you'll meet Miga, Pixel, Finn and Sage — they're all amazing, so take your time choosing!",
    fr: "Salut ! Avant de rencontrer tes amis sur Migo, tu as besoin d'un guide spécial — quelqu'un qui sera toujours là pour toi, qui célèbrera tes victoires et qui te gardera en sécurité. Ce guide s'appelle ton mascotte ! 🌟 Dans un instant tu vas rencontrer Miga, Pixel, Finn et Sage — ils sont tous géniaux, prends ton temps pour choisir !",
  },
  {
    en: "I'm Miga! I'm a friendly dragon and I will ALWAYS have your back on Migo. I celebrate every win, help when things go wrong, and I will never ever go away — you're stuck with me! 💜 But peek below — you might also love Pixel, Finn or Sage!",
    fr: "Je suis Miga ! Je suis un petit dragon magique et je serai TOUJOURS là pour toi ! Je célèbre chaque victoire, j'aide quand ça va pas, et je ne partirai jamais — tu es coincé(e) avec moi ! 💜 Mais regarde en bas — tu pourrais aussi aimer Pixel, Finn ou Sage !",
  },
];

// ─── app/constants/tourSteps.ts — TOUR_STEPS (index = the `currentStep` used in the messageId) ───
const TOUR_STEPS: { id: string; text: string; textFr: string }[] = [
  { id: 'friends_row',   text: "These are your friends! Tap one to chat with them 💬",
    textFr: "Voici tes amis ! Appuie sur l'un d'eux pour lui écrire 💬" },
  { id: 'audio_button',  text: "Tap the speaker button 🔊 on any post to hear it read aloud!",
    textFr: "Appuie sur le bouton haut-parleur 🔊 sur un post pour l'entendre lire à voix haute !" },
  { id: 'post_button',   text: "Share your news here — your friends will see it! ✏️",
    textFr: "Partage tes nouvelles ici — tes amis pourront les voir ! ✏️" },
  { id: 'friend_post',   text: "See what your friends are up to! React or reply to their posts 😊",
    textFr: "Vois ce que font tes amis ! Réagis ou réponds à leurs messages 😊" },
  { id: 'discover_tab',  text: "Discover new friends here — your world is getting bigger! 🌍",
    textFr: "Découvre de nouveaux amis ici — ton monde s'agrandit ! 🌍" },
  { id: 'badges_tab',    text: "Collect badges as you use Migo — can you get them all? 🏅",
    textFr: "Collectionne des badges en utilisant Migo — tu peux tous les avoir ? 🏅" },
  { id: 'me_tab',        text: "This is your profile — it's all about you! 😊",
    textFr: "C'est ton profil — c'est tout toi ! 😊" },
  { id: 'dm_hint',       text: "Tap a friend's bubble to send them a message — or share your first post to let your friends know what you're up to! 💜",
    textFr: "Appuie sur la bulle d'un ami pour lui envoyer un message — ou partage ton premier post pour dire à tes amis ce que tu fais ! 💜" },
];

// ─── app/app/onboarding/role.tsx — mascotHappyPicked (characterId={mascotId}) ───
const MASCOT_GENDER: Record<MascotId, 'boy' | 'girl'> = {
  pixel: 'boy', finn: 'boy', miga: 'girl', sage: 'girl',
};
const MASCOT_HAPPY_PICKED: Record<'boy' | 'girl', { en: string; fr: string }> = {
  boy: {
    en: "I'm so happy you picked me! Ask a parent to read about my role in Migo with you! 🎉",
    fr: "Je suis tellement content que tu m'aies choisi ! Demande à un parent de lire mon rôle dans Migo avec toi !",
  },
  girl: {
    en: "I'm so happy you picked me! Ask a parent to read about my role in Migo with you! 🎉",
    fr: "Je suis tellement contente que tu m'aies choisie ! Demande à un parent de lire mon rôle dans Migo avec toi !",
  },
};

// ─── app/app/onboarding/interests.tsx — mascotSpeech (characterId={mascotId || 'miga'}) ───
const INTERESTS_MASCOT_SPEECH: { en: string; fr: string } = {
  en: "Now the fun part!! Tap everything you love — this helps me find your perfect friends! Pick as many as you want! 🎉",
  fr: "Maintenant l'amusement ! Appuie sur tout ce que tu aimes — ça m'aide à trouver tes amis parfaits ! Choisis autant que tu veux ! 🎉",
};

// ─── app/app/onboarding/personality.tsx — migaBubble / migaBubble_girl (characterId={mascotId || 'miga'}) ───
const PERSONALITY_MIGA_BUBBLE: Record<'default' | 'girl', { en: string; fr: string }> = {
  default: {
    en: "Now I want to get to know the REAL you! These help me find friends who truly get you 🌟",
    fr: "Maintenant je veux apprendre à connaître le VRAI toi ! Ça m'aide à trouver des amis qui te comprennent vraiment 🌟",
  },
  girl: {
    en: "Now I want to get to know the REAL you! These help me find friends who truly get you 🌟",
    fr: "Maintenant je veux apprendre à connaître la VRAIE toi ! Ça m'aide à trouver des amis qui te comprennent vraiment 🌟",
  },
};

function buildItems(): AudioItem[] {
  const items: AudioItem[] = [];
  const langs: Lang[] = ['en', 'fr'];

  // 1. Mascot intro bubbles
  for (const mascotId of MASCOT_IDS) {
    for (const lang of langs) {
      items.push({
        label: `mascot bubble: ${mascotId} (${lang})`,
        text: MASCOT_BUBBLES[mascotId][lang],
        characterId: mascotId,
        lang,
      });
    }
  }

  // 2. Mascot-screen intro text (always narrated by "miga")
  INTRO_TEXTS.forEach((phase, i) => {
    for (const lang of langs) {
      items.push({
        label: `mascot intro phase${i + 1} (${lang})`,
        text: phase[lang],
        characterId: 'miga',
        lang,
      });
    }
  });

  // 3. Onboarding tour steps — one per mascot × language, keyed by messageId
  TOUR_STEPS.forEach((step, stepIndex) => {
    for (const mascotId of MASCOT_IDS) {
      for (const lang of langs) {
        const text = lang === 'fr' ? step.textFr : step.text;
        const messageId = `tour_${stepIndex}_${step.id}`;
        items.push({
          label: `tour step ${stepIndex} (${step.id}) — ${mascotId} (${lang})`,
          text,
          characterId: mascotId,
          lang,
          cacheKeyOverride: `${mascotId.toLowerCase()}_${lang}_msg_${messageId}`,
        });
      }
    }
  });

  // 4a. role.tsx — mascotHappyPicked
  for (const mascotId of MASCOT_IDS) {
    const gender = MASCOT_GENDER[mascotId];
    for (const lang of langs) {
      items.push({
        label: `role mascotHappyPicked: ${mascotId}/${gender} (${lang})`,
        text: MASCOT_HAPPY_PICKED[gender][lang],
        characterId: mascotId,
        lang,
      });
    }
  }

  // 4b. interests.tsx — mascotSpeech
  for (const mascotId of MASCOT_IDS) {
    for (const lang of langs) {
      items.push({
        label: `interests mascotSpeech: ${mascotId} (${lang})`,
        text: INTERESTS_MASCOT_SPEECH[lang],
        characterId: mascotId,
        lang,
      });
    }
  }

  // 4c. personality.tsx — migaBubble / migaBubble_girl
  for (const mascotId of MASCOT_IDS) {
    for (const variant of ['default', 'girl'] as const) {
      for (const lang of langs) {
        items.push({
          label: `personality migaBubble(${variant}): ${mascotId} (${lang})`,
          text: PERSONALITY_MIGA_BUBBLE[variant][lang],
          characterId: mascotId,
          lang,
        });
      }
    }
  }

  return items;
}

// 5. Friend self-intro line — dm/[friendId].tsx, one per ai_friends row × language
async function buildFriendIntroItems(): Promise<AudioItem[]> {
  const rows: { name: string }[] = await db('ai_friends').select('name');
  const items: AudioItem[] = [];
  for (const row of rows) {
    const characterId = nameToCharacterId(row.name);
    items.push({
      label: `friend intro: ${row.name} (en)`,
      text: `Hi, I'm ${row.name}!`,
      characterId,
      lang: 'en',
    });
    items.push({
      label: `friend intro: ${row.name} (fr)`,
      text: `Salut, je suis ${row.name} !`,
      characterId,
      lang: 'fr',
    });
  }
  return items;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Gemini TTS quota on this project is 10 requests/minute — space out live generations
// and back off on 429s so a full run completes instead of dying partway through.
const THROTTLE_MS = 6800;

// A rate-limit error's retryDelay may be a few seconds (per-minute throttle, worth
// waiting out) or hours (daily quota exhausted, not worth waiting out mid-run).
const DAILY_QUOTA_THRESHOLD_SECONDS = 60;

class DailyQuotaExceededError extends Error {}

function retryDelaySeconds(err: unknown): number | null {
  const msg = err instanceof Error ? err.message : String(err);
  // The Gemini SDK's error message is a JSON blob nested inside another JSON blob, so
  // quotes around "retryDelay" appear backslash-escaped — match on digits, not punctuation.
  const m = msg.match(/retryDelay[^\d]*(\d+(?:\.\d+)?)s/);
  return m ? parseFloat(m[1]) : null;
}

function isRateLimitError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /429|RESOURCE_EXHAUSTED/.test(msg);
}

async function generateWithRetry(item: AudioItem, maxAttempts = 3): Promise<void> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await generateSpeech(item.text, item.characterId, item.lang, item.cacheKeyOverride);
      return;
    } catch (err) {
      if (!isRateLimitError(err)) throw err;
      const delay = retryDelaySeconds(err);
      if (delay !== null && delay > DAILY_QUOTA_THRESHOLD_SECONDS) {
        throw new DailyQuotaExceededError(`daily quota exhausted — resets in ~${Math.round(delay / 60)} min`);
      }
      if (attempt === maxAttempts) throw err;
      const waitMs = Math.ceil((delay ?? 20) * 1000) + 2000;
      console.warn(`  ⏳ rate-limited (attempt ${attempt}/${maxAttempts}), waiting ${(waitMs / 1000).toFixed(1)}s — ${item.label}`);
      await sleep(waitMs);
    }
  }
}

async function run() {
  console.log('\nStatic Audio Pre-generator\n' + '='.repeat(40));

  await connectRedis();

  const items = buildItems();
  items.push(...(await buildFriendIntroItems()));

  console.log(`Found ${items.length} static audio item(s) to warm.\n`);

  let generated = 0;
  let skipped   = 0;
  let failed    = 0;

  for (const item of items) {
    const expectedKey = item.cacheKeyOverride ?? buildCacheKey(item.characterId, item.lang, item.text);
    const wasCached = isCached(expectedKey);

    try {
      if (!wasCached) await sleep(THROTTLE_MS);
      await generateWithRetry(item);
      if (wasCached) {
        skipped++;
        console.log(`  · skip  ${item.label}`);
      } else {
        generated++;
        console.log(`  ✓ gen   ${item.label}`);
      }
    } catch (err) {
      failed++;
      if (err instanceof DailyQuotaExceededError) {
        const remaining = items.length - (generated + skipped + failed);
        console.error(`  ✗ fail  ${item.label} — ${err.message}`);
        console.error(`\n⚠️  Gemini TTS daily quota exhausted — stopping early with ${remaining} item(s) not yet attempted.`);
        console.error('   Re-run this script later (already-cached items are skipped automatically).\n');
        break;
      }
      console.error(`  ✗ fail  ${item.label} —`, err);
    }
  }

  console.log('\n' + '='.repeat(40));
  console.log(`Done. ${generated} generated, ${skipped} already cached (skipped), ${failed} failed.\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
