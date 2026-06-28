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

// Star friend voices — fixed, never change
const STAR_FRIEND_VOICES: Record<string, string> = {
  'zara':                 'Aoede',
  'coach-mike':           'Fenrir',
  'daniel':               'Charon',
  'anne-sophie':          'Leda',
  'juliette':             'Kore',
  'capitaine-coquillage': 'Orus',
  'jules':                'Orus',
  'luna':                 'Schedar',
  'miga':                 'Puck',
};

// Voice pools for generated friends (excludes voices reserved for star friends above)
const FEMALE_VOICE_POOL = ['Zephyr','Callirrhoe','Autonoe','Despina','Erinome','Gacrux','Laomedeia','Achernar','Pulcherrima','Vindemiatrix','Sulafat'];
const MALE_VOICE_POOL   = ['Achird','Zubenelgenubi','Algieba','Alnilam','Enceladus','Iapetus','Umbriel','Algenib','Rasalgethi','Sadachbia','Sadaltager'];

export function assignVoiceToFriend(name: string, gender: string, age: number, personality: string[]): string {
  const seed = `${name}-${gender}-${personality.slice(0, 2).join('-')}`;
  const hash = crypto.createHash('md5').update(seed).digest('hex');
  const index = parseInt(hash.slice(0, 8), 16);
  const pool = gender === 'girl' ? FEMALE_VOICE_POOL : MALE_VOICE_POOL;
  return pool[index % pool.length];
}

async function resolveGeminiVoice(characterId: string): Promise<string> {
  const id = characterId.toLowerCase();
  if (STAR_FRIEND_VOICES[id]) return STAR_FRIEND_VOICES[id];
  try {
    const friend = await db('ai_friends')
      .whereRaw('LOWER(name) = ?', [id])
      .select('gemini_voice_name', 'gender')
      .first();
    if (friend?.gemini_voice_name) return friend.gemini_voice_name;
    if (friend?.gender === 'girl') return FEMALE_VOICE_POOL[0];
    return MALE_VOICE_POOL[0];
  } catch { return MALE_VOICE_POOL[0]; }
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
  const voiceName = await resolveGeminiVoice(characterId);
  console.log(`[voice] ${characterId} → ${voiceName}`);

  const id = characterId.toLowerCase();
  const isTeacher = id.includes('luna');
  const isMascot  = id.includes('miga');
  const isJules   = id.includes('jules');

  const systemInstruction = isTeacher
    ? 'You are a warm, gentle teacher named Ms. Luna speaking kindly and encouragingly to a young child.'
    : isMascot
    ? 'You are Miga, an energetic and playful dragon mascot. Speak with childlike excitement and wonder.'
    : isJules
    ? 'You are Jules, a cool laid-back male teacher in his thirties who surfs. Speak with a warm, calm, confident adult male voice. You are enthusiastic but not excitable — think cool older brother energy, never childlike.'
    : `You are an energetic, friendly 9-year-old child. Speak with a bright, high-pitched, youthful tone. Use natural pacing and innocent excitement. Never sound like an adult.`;

  const audioTags = isTeacher
    ? '[warm] [gentle] '
    : isMascot
    ? '[excited] [high-pitched] '
    : isJules
    ? '[warm] [confident] [relaxed] '
    : '[excited] [high-pitched] ';

  const prompt = `${systemInstruction}\n\n${audioTags}${text}`;

  let audioData: string | undefined;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await gemini.models.generateContent({
        model: 'gemini-3.1-flash-tts-preview',
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
      audioData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (audioData) break;
      console.warn(`[voice] Gemini attempt ${attempt}: no audio data`);
    } catch (err) {
      console.warn(`[voice] Gemini attempt ${attempt} error:`, err);
      if (attempt === 3) throw err;
    }
  }
  if (!audioData) throw new Error('Gemini TTS returned no audio data after 3 attempts');

  const pcmBuffer = Buffer.from(audioData, 'base64');
  const buffer = await pcmToWav(pcmBuffer);

  // 4. Save to disk
  fs.mkdirSync(AUDIO_DIR, { recursive: true });
  fs.writeFileSync(filePath, buffer);

  // 5. Cache URL for 7 days
  await redisSet(redisKey, publicUrl, 604800);

  return publicUrl;
}
