import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { ElevenLabsClient } from 'elevenlabs';
import { Readable, PassThrough } from 'stream';
import wav from 'wav';
import { GoogleGenAI } from '@google/genai';
import { get as redisGet, set as redisSet } from './redis.service';
import db from '../db';

const elevenlabs = new ElevenLabsClient({
  apiKey: process.env.ELEVENLABS_API_KEY ?? '',
});

const gemini = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY ?? '' });

const AUDIO_DIR = path.join(__dirname, '../../public/audio');
const BASE_URL  = process.env.BASE_URL ?? `http://localhost:${process.env.PORT ?? 3001}`;

const GEMINI_VOICE_IDS: Record<string, string> = {
  // Star friends
  'zara':                'Aoede',
  'coach-mike':          'Fenrir',
  'daniel':              'Charon',
  'anne-sophie':         'Leda',
  'juliette':            'Kore',
  'capitaine-coquillage': 'Orus',
  // Teachers / mascot
  'luna':                'Schedar',
  'miga':                'Puck',
  // Defaults by gender (used for generated friends)
  'default_female':      'Vindemiatrix',
  'default_male':        'Algieba',
  'default':             'Zephyr',
};

function getGeminiVoice(characterId: string): string {
  const id = characterId.toLowerCase();
  if (GEMINI_VOICE_IDS[id]) return GEMINI_VOICE_IDS[id];
  return GEMINI_VOICE_IDS['default'];
}

function pcmToWav(pcmBuffer: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const writer = new wav.Writer({ channels: 1, sampleRate: 24000, bitDepth: 16 });
    const passThrough = new PassThrough();
    writer.on('data', (chunk: Buffer) => chunks.push(chunk));
    writer.on('finish', () => resolve(Buffer.concat(chunks)));
    writer.on('error', reject);
    passThrough.pipe(writer);
    passThrough.end(pcmBuffer);
  });
}

function buildCacheKey(characterId: string, language: string, text: string): string {
  const hash = crypto.createHash('md5').update(text).digest('hex').slice(0, 12);
  return `${characterId}_${language}_${hash}`;
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
  const filePath  = path.join(AUDIO_DIR, `${cacheKey}.wav`);
  const publicUrl = `/audio/${cacheKey}.wav`;

  // 1. Redis cache hit
  const cached = await redisGet(redisKey);
  if (cached) return cached;

  // 2. File already exists on disk
  if (fs.existsSync(filePath)) {
    await redisSet(redisKey, publicUrl, 604800);
    return publicUrl;
  }

  // 3. Call Gemini TTS
  const voiceName = getGeminiVoice(characterId);
  const styleInstruction = characterId.toLowerCase().includes('luna')
    ? 'Speak warmly and gently, like a caring teacher. '
    : characterId.toLowerCase().includes('miga')
    ? 'Speak in an excited, playful way, full of energy. '
    : characterId.toLowerCase().includes('coach')
    ? 'Speak enthusiastically and encouragingly. '
    : 'Speak in a friendly, warm way appropriate for talking to a child. ';

  const prompt = `${styleInstruction}${text}`;

  const response = await gemini.models.generateContent({
    model: 'gemini-2.5-flash-preview-tts',
    contents: [{ parts: [{ text: prompt }] }],
    config: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName },
        },
      },
    },
  });

  const audioData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!audioData) throw new Error('Gemini TTS returned no audio data');

  const pcmBuffer = Buffer.from(audioData, 'base64');
  const buffer = await pcmToWav(pcmBuffer);

  // 4. Save to disk
  fs.mkdirSync(AUDIO_DIR, { recursive: true });
  fs.writeFileSync(filePath, buffer);

  // 5. Cache URL for 7 days
  await redisSet(redisKey, publicUrl, 604800);

  return publicUrl;
}
