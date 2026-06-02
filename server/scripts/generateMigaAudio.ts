import fs from 'fs';
import path from 'path';
import https from 'https';

const API_KEY  = process.env.ELEVENLABS_API_KEY ?? '';
const VOICE_ID = 'XB0fDUnXU5powFXDhCwa'; // Charlotte
const MODEL_ID = 'eleven_multilingual_v2';
const OUT_DIR  = path.resolve(__dirname, '../../app/assets/audio');

const FILES: Array<{ filename: string; text: string }> = [
  {
    filename: 'miga_intro.mp3',
    text: "Hi! Before you meet your friends on Migo, you need a special guide — someone who will always be there for you, celebrate your wins, and keep you safe. That guide is called your mascot!",
  },
  {
    filename: 'miga_selected.mp3',
    text: "Hiiii!! I'm Miga!! I'm a sparkly little fairy and I will ALWAYS have your back on Migo! So happy you picked me!",
  },
  {
    filename: 'miga_hear.mp3',
    text: "Hi!! I'm Miga! I'm a sparkly fairy and I will always be there for you on Migo!",
  },
  {
    filename: 'miga_intro_fr.mp3',
    text: "Salut ! Avant de rencontrer tes amis sur Migo, tu as besoin d'un guide spécial — quelqu'un qui sera toujours là pour toi, qui célèbrera tes victoires et qui te gardera en sécurité. Ce guide s'appelle ton mascotte !",
  },
  {
    filename: 'miga_selected_fr.mp3',
    text: "Hiii !! Je suis Miga !! Je suis une petite fée pétillante et je serai TOUJOURS là pour toi ! Tellement contente que tu m'aies choisie !",
  },
  {
    filename: 'miga_hear_fr.mp3',
    text: "Coucou !! Je m'appelle Miga !! Je suis une fée magique et je serai toujours là pour toi sur Migo !",
  },
];

function generateOne(filename: string, text: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      text,
      model_id: MODEL_ID,
      voice_settings: { stability: 0.45, similarity_boost: 0.75 },
    });

    const options: https.RequestOptions = {
      hostname: 'api.elevenlabs.io',
      path:     `/v1/text-to-speech/${VOICE_ID}`,
      method:   'POST',
      headers: {
        'xi-api-key':   API_KEY,
        'Content-Type': 'application/json',
        'Accept':       'audio/mpeg',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      if (res.statusCode !== 200) {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          reject(new Error(`ElevenLabs ${res.statusCode}: ${Buffer.concat(chunks).toString()}`));
        });
        return;
      }

      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        const outPath = path.join(OUT_DIR, filename);
        fs.writeFileSync(outPath, buffer);
        console.log(`  ✓ ${filename} (${(buffer.length / 1024).toFixed(1)} KB)`);
        resolve();
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  if (!API_KEY) {
    console.error('ELEVENLABS_API_KEY is not set in .env');
    process.exit(1);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  console.log(`Output: ${OUT_DIR}\n`);

  for (const { filename, text } of FILES) {
    process.stdout.write(`Generating ${filename}... `);
    try {
      await generateOne(filename, text);
    } catch (err) {
      console.error(`\n  ✗ Failed: ${filename}`, (err as Error).message);
      process.exit(1);
    }
  }

  console.log('\n✅ All 6 files generated.');
}

void main();
