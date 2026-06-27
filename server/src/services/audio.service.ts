import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { ElevenLabsClient } from 'elevenlabs';
import { Readable } from 'stream';
import { get as redisGet, set as redisSet } from './redis.service';
import db from '../db';

const elevenlabs = new ElevenLabsClient({
  apiKey: process.env.ELEVENLABS_API_KEY ?? '',
});

const AUDIO_DIR = path.join(__dirname, '../../public/audio');
const BASE_URL  = process.env.BASE_URL ?? `http://localhost:${process.env.PORT ?? 3001}`;

const VOICE_IDS: Record<'en' | 'fr', Record<string, string>> = {
  en: {
    zara:      'ZLR2VL7jAuie9sowsXqg', // Talia — young female
    mia:       'NCXuWNJQQvNzPsNoESwl', // Mia — young female
    'anne-sophie': 'j3QcmAr55TvFW5CDB0Q3', // Iniga — young female
    juliette:  'IKuPqyuiEnnZFcU4OVzH', // Abby — young female
    luna:      'ZLR2VL7jAuie9sowsXqg', // Talia — warm young female for Ms. Luna
    miga:      'j3QcmAr55TvFW5CDB0Q3', // Iniga — energetic for mascot
    default:   'ZLR2VL7jAuie9sowsXqg', // Talia as default
  },
  fr: {
    zara:          'Yx2a8qp2EqI9c5i8MzBo', // Philippine — young French female
    mia:           'Yx2a8qp2EqI9c5i8MzBo',
    'anne-sophie': 'Yx2a8qp2EqI9c5i8MzBo',
    juliette:      'Yx2a8qp2EqI9c5i8MzBo',
    luna:          'Yx2a8qp2EqI9c5i8MzBo',
    miga:          'Yx2a8qp2EqI9c5i8MzBo',
    jake:          'onwK4e9ZLuTAKqWW03F9', // Daniel — French male
    'coach-mike':  'onwK4e9ZLuTAKqWW03F9',
    hugo:          'onwK4e9ZLuTAKqWW03F9',
    default:       'Yx2a8qp2EqI9c5i8MzBo',
  },
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

export async function transcribeAudio(
  audioBase64: string,
  mimeType: string,
  language?: string,
): Promise<string> {
  const buffer = Buffer.from(audioBase64, 'base64');
  const blob = new Blob([buffer], { type: mimeType });
  const result = await elevenlabs.speechToText.convert({
    file: blob,
    model_id: 'scribe_v1',
    language_code: language === 'fr' ? 'fra' : 'eng',
  });
  return result.text;
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
  const lang    = language === 'fr' ? 'fr' : 'en';
  const voiceId = VOICE_IDS[lang][characterId.toLowerCase()] ?? VOICE_IDS[lang].default;
  const modelId = lang === 'fr' ? 'eleven_multilingual_v2' : 'eleven_monolingual_v1';

  const isTeacher = characterId.toLowerCase().includes('luna');
  const isMascot = characterId.toLowerCase().includes('miga');
  const isMale = ['jake', 'coach-mike', 'hugo', 'nico', 'luca', 'tom', 'daniel'].includes(characterId.toLowerCase());

  const voiceSettings = isTeacher
    ? { stability: 0.55, similarity_boost: 0.80, style: 0.20, speed: 0.95, use_speaker_boost: true }
    : isMascot
    ? { stability: 0.30, similarity_boost: 0.70, style: 0.55, speed: 1.10, use_speaker_boost: true }
    : isMale
    ? { stability: 0.40, similarity_boost: 0.75, style: 0.35, speed: 1.00, use_speaker_boost: true }
    : { stability: 0.35, similarity_boost: 0.75, style: 0.45, speed: 1.05, use_speaker_boost: true };

  const audioStream = await elevenlabs.textToSpeech.convert(voiceId, {
    text,
    model_id: modelId,
    voice_settings: voiceSettings,
  });

  // 4. Save to disk
  fs.mkdirSync(AUDIO_DIR, { recursive: true });
  const buffer = await streamToBuffer(audioStream as unknown as Readable);
  fs.writeFileSync(filePath, buffer);

  // 5. Cache URL for 7 days
  await redisSet(redisKey, publicUrl, 604800);

  return publicUrl;
}
