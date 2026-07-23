/**
 * Generates the myMigo beta-video narration as one WAV file per scene, per
 * language — matching video-script.md scene-for-scene, so you can drop each
 * clip under its matching screen-recording segment in your video editor.
 *
 * Reuses the exact Gemini TTS approach already in server/src/services/audio.service.ts
 * (gemini-2.5-flash-preview-tts, PCM -> WAV), just standalone so it doesn't touch
 * any app code — this is a one-off marketing asset, not a server feature.
 *
 * Setup:
 *   cd server
 *   npm install @google/genai wav          (skip if already installed — they are, in server/)
 *
 * Run (uses the same GOOGLE_API_KEY already in server/.env):
 *   cd server
 *   node -r dotenv/config ../generate-narration.js
 *
 * Output: ./narration/fr_scene1.wav ... fr_scene9.wav, en_scene1.wav ... en_scene9.wav
 */

const fs = require('fs');
const path = require('path');
const { PassThrough } = require('stream');
const wav = require('wav');
const { GoogleGenAI } = require('@google/genai');

const gemini = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY ?? '' });
const OUT_DIR = path.join(__dirname, 'narration');

// Pick any prebuilt Gemini voice name — these are the same pools already used
// in audio.service.ts. Zephyr = warm, confident, a bit big-sister — a good fit
// for a parent-facing narrator. Change freely and re-run just this script.
const VOICE_FR = 'Zephyr';
const VOICE_EN = 'Zephyr';

const SCENES_FR = [
  "myMigo, c'est l'application où les enfants apprennent, découvrent, et se font des amis — en toute sécurité.",
  "Chaque enfant a ses propres amis, créés spécialement pour lui. Pas de vrais inconnus, jamais — juste des personnages bienveillants, adaptés à sa personnalité.",
  "Pour l'installer, c'est simple : sur iPhone, un lien TestFlight. Sur Android, un lien d'installation direct. Tout est expliqué pas à pas dans le guide qu'on vous a envoyé.",
  "On commence par ajouter son enfant — juste son prénom et sa date de naissance. Un petit questionnaire sur ses centres d'intérêt permet ensuite à myMigo de créer ses amis IA, rien qu'à lui.",
  "Et voilà — deux ou trois amis, chacun avec sa propre personnalité. On peut leur parler, comme on parlerait à un copain de classe.",
  "Les amis IA publient aussi des petits posts — un peu comme un réseau social, mais pensé uniquement pour les enfants.",
  "Et au fil du temps, des badges récompensent la gentillesse et la curiosité — pas juste le temps passé sur l'écran.",
  "Et pour les parents : une visibilité complète sur les conversations, et des alertes automatiques si quelque chose mérite votre attention. C'est pensé pour rassurer, pas pour surveiller.",
  "Merci infiniment de tester myMigo avec nous. Un souci, une idée ? Un simple message à la mascotte de votre enfant dans l'app, ou à hello@mymigo.fr, et on s'occupe du reste.",
];

const SCENES_EN = [
  "myMigo is the app where kids learn, discover, and make friends — safely.",
  "Every child gets their own friends, created just for them. No real strangers, ever — just kind characters, matched to their personality.",
  "Getting it installed is simple: on iPhone, a TestFlight link. On Android, a direct install link. It's all explained step by step in the guide we sent you.",
  "We start by adding your child — just a first name and date of birth. A short questionnaire about their interests lets myMigo create AI friends made just for them.",
  "And there they are — two or three friends, each with their own personality. Your child can talk to them just like they'd talk to a classmate.",
  "Their AI friends also share little posts — a bit like a social feed, but built entirely for kids.",
  "Over time, badges reward kindness and curiosity — not just time spent on the screen.",
  "And for parents: full visibility into conversations, with automatic alerts if anything needs your attention. It's built to reassure, not to snoop.",
  "Thank you so much for testing myMigo with us. Got a bug or an idea? Just message your child's mascot guide in the app, or email hello@mymigo.fr, and we'll take it from there.",
];

function pcmToWav(pcmBuffer) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const writer = new wav.Writer({ channels: 1, sampleRate: 24000, bitDepth: 16 });
    const passThrough = new PassThrough();
    writer.on('data', (chunk) => chunks.push(chunk));
    writer.on('finish', () => resolve(Buffer.concat(chunks)));
    writer.on('error', reject);
    passThrough.pipe(writer);
    passThrough.end(pcmBuffer);
  });
}

async function generateOne(text, voiceName, systemInstruction) {
  const prompt = `${systemInstruction}\n\n${text}`;
  const pcmChunks = [];

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const stream = await gemini.models.generateContentStream({
        model: 'gemini-2.5-flash-preview-tts',
        contents: [{ parts: [{ text: prompt }] }],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } },
        },
      });

      for await (const chunk of stream) {
        const base64 = chunk?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (base64) pcmChunks.push(Buffer.from(base64, 'base64'));
      }

      if (pcmChunks.length > 0) break;
      console.warn(`  attempt ${attempt}: no audio returned, retrying...`);
    } catch (err) {
      console.warn(`  attempt ${attempt} failed:`, err.message ?? err);
      pcmChunks.length = 0;
    }
  }

  if (pcmChunks.length === 0) throw new Error('No audio generated after 3 attempts');
  return pcmToWav(Buffer.concat(pcmChunks));
}

async function main() {
  if (!process.env.GOOGLE_API_KEY) {
    console.error('GOOGLE_API_KEY is not set. Run this with your server/.env loaded, e.g.:');
    console.error('  cd server && node -r dotenv/config ../generate-narration.js');
    process.exit(1);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });

  const narratorInstruction =
    'You are a warm, friendly narrator for a short explainer video aimed at parents. ' +
    'Speak clearly, warmly, and not too fast — this is being read over a video, not a live conversation.';

  for (const [lang, scenes, voice] of [['fr', SCENES_FR, VOICE_FR], ['en', SCENES_EN, VOICE_EN]]) {
    for (let i = 0; i < scenes.length; i++) {
      const sceneNum = i + 1;
      const outPath = path.join(OUT_DIR, `${lang}_scene${sceneNum}.wav`);
      if (fs.existsSync(outPath)) {
        console.log(`[skip] ${lang}_scene${sceneNum}.wav already exists`);
        continue;
      }
      console.log(`[generating] ${lang}_scene${sceneNum}.wav ...`);
      try {
        const wavBuffer = await generateOne(scenes[i], voice, narratorInstruction);
        fs.writeFileSync(outPath, wavBuffer);
        console.log(`[done] ${outPath}`);
      } catch (err) {
        console.error(`[FAILED] ${lang}_scene${sceneNum}:`, err.message ?? err);
      }
    }
  }

  console.log(`\nAll done. Files are in: ${OUT_DIR}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
