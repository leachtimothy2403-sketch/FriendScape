import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { ElevenLabsClient } from 'elevenlabs';
import { Readable } from 'stream';
import { get as redisGet, set as redisSet } from './redis.service';

const elevenlabs = new ElevenLabsClient({
  apiKey: process.env.ELEVENLABS_API_KEY ?? '',
});

const AUDIO_DIR = path.join(__dirname, '../../public/audio');
const BASE_URL  = process.env.BASE_URL ?? `http://localhost:${process.env.PORT ?? 3001}`;

// Voice IDs per character and language.
// EN: ElevenLabs English voices.
// FR: ElevenLabs multilingual voices with native French output.
const VOICE_IDS: Record<'en' | 'fr', Record<string, string>> = {
  en: {
    mia:       'EXAVITQu4vr4xnSDxMaL', // Bella
    jake:      'VR6AewLTigWG4xSOukaG', // Arnold
    zara:      'ThT5KcBeYPX3keUQqHPh', // Dorothy
    coachmike: 'pNInz6obpgDQGcFmaJgB', // Adam
    msluna:    'EXAVITQu4vr4xnSDxMaL', // Bella
    miga:      'ThT5KcBeYPX3keUQqHPh', // Dorothy
    finn:      'VR6AewLTigWG4xSOukaG', // Arnold
    pixel:     'ErXwobaYiN019PkySvjV', // Antoni
    sage:      'pNInz6obpgDQGcFmaJgB', // Adam
  },
  fr: {
    mia:       'Xb7hH8MSUJpSbSDYk0k2', // Alice (multilingual)
    jake:      'onwK4e9ZLuTAKqWW03F9', // Daniel (multilingual)
    zara:      'Xb7hH8MSUJpSbSDYk0k2', // Alice
    coachmike: 'onwK4e9ZLuTAKqWW03F9', // Daniel
    msluna:    'Xb7hH8MSUJpSbSDYk0k2', // Alice
    miga:      'Xb7hH8MSUJpSbSDYk0k2', // Alice
    finn:      'onwK4e9ZLuTAKqWW03F9', // Daniel
    pixel:     'onwK4e9ZLuTAKqWW03F9', // Daniel
    sage:      'onwK4e9ZLuTAKqWW03F9', // Daniel
  },
};

const DEFAULT_VOICE: Record<'en' | 'fr', string> = {
  en: 'EXAVITQu4vr4xnSDxMaL',
  fr: 'Xb7hH8MSUJpSbSDYk0k2',
};

function buildCacheKey(characterId: string, language: string, text: string): string {
  const hash = crypto.createHash('md5').update(text).digest('hex').slice(0, 12);
  return `${characterId}_${language}_${hash}`;
}

async function streamToBuffer(stream: Readable | NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream as AsyncIterable<Buffer | Uint8Array>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export async function generateSpeech(
  text: string,
  characterId: string,
  language: 'en' | 'fr',
  cacheKeyOverride?: string,
): Promise<string> {
  const cacheKey  = cacheKeyOverride ?? buildCacheKey(characterId, language, text);
  const redisKey  = `audio:${cacheKey}`;
  const filePath  = path.join(AUDIO_DIR, `${cacheKey}.mp3`);
  const publicUrl = `/audio/${cacheKey}.mp3`;

  // 1. Redis cache hit
  const cached = await redisGet(redisKey);
  if (cached) return cached;

  // 2. File already exists on disk
  if (fs.existsSync(filePath)) {
    await redisSet(redisKey, publicUrl, 604800);
    return publicUrl;
  }

  // 3. Call ElevenLabs
  const lang = language === 'fr' ? 'fr' : 'en';
  const voiceMap = VOICE_IDS[lang];
  const voiceId  = voiceMap[characterId.toLowerCase()] ?? DEFAULT_VOICE[lang];
  const modelId  = lang === 'fr' ? 'eleven_multilingual_v2' : 'eleven_monolingual_v1';

  const audioStream = await elevenlabs.textToSpeech.convert(voiceId, {
    text,
    model_id: modelId,
    voice_settings: {
      stability:        0.45,
      similarity_boost: 0.75,
      style:            0.3,
      use_speaker_boost: true,
    },
  });

  // 4. Save to disk
  fs.mkdirSync(AUDIO_DIR, { recursive: true });
  const buffer = await streamToBuffer(audioStream as unknown as Readable);
  fs.writeFileSync(filePath, buffer);

  // 5. Cache URL for 7 days
  await redisSet(redisKey, publicUrl, 604800);

  return publicUrl;
}
