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
  'sophie':               'Zephyr',
  'luna':                 'Schedar',
  'miga':                 'Puck',
};

// Voice pools for generated friends (excludes voices reserved for star friends above)
const FEMALE_VOICE_POOL = ['Zephyr','Callirrhoe','Autonoe','Despina','Erinome','Gacrux','Laomedeia','Achernar','Pulcherrima','Vindemiatrix','Sulafat'];
const MALE_VOICE_POOL   = ['Achird','Zubenelgenubi','Algieba','Alnilam','Enceladus','Iapetus','Umbriel','Algenib','Rasalgethi','Sadachbia','Sadaltager'];

// ElevenLabs fallback voice IDs — used only when Gemini TTS fails or is quota-limited.
// Reuses the same premade ElevenLabs voices already used elsewhere in the app (see ai.service.ts VOICE map).
const ELEVEN_FALLBACK_FEMALE  = 'EXAVITQu4vr4xnSDxMaL'; // "bella"
const ELEVEN_FALLBACK_MALE    = 'pNInz6obpgDQGcFmaJgB'; // "adam"
const ELEVEN_FALLBACK_DEFAULT = 'onwK4e9ZLuTAKqWW03F9'; // "daniel" — used when no ai_friends row matches (e.g. mascot personas)

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

// Mirrors resolveGeminiVoice's lookup pattern exactly, but resolves each friend's real
// ElevenLabs voice_id (already seeded in ai_friends from before Gemini became primary TTS).
async function resolveElevenLabsVoice(characterId: string): Promise<string> {
  const id = characterId.toLowerCase();
  try {
    const friend = await db('ai_friends')
      .whereRaw('LOWER(name) = ?', [id])
      .select('voice_id', 'gender')
      .first();
    if (friend?.voice_id) return friend.voice_id;
    if (friend?.gender === 'girl' || friend?.gender === 'female') return ELEVEN_FALLBACK_FEMALE;
    if (friend) return ELEVEN_FALLBACK_MALE;
  } catch (err) {
    console.warn('[voice:fallback] ElevenLabs voice lookup failed:', err);
  }
  return ELEVEN_FALLBACK_DEFAULT;
}

// Generates audio via ElevenLabs, saves it as an .mp3 alongside the .wav cache files,
// and caches it under the same redis key used by the Gemini path. Always uses the
// multilingual model regardless of any legacy voice_model column, since myMigo is EN/FR.
async function generateElevenLabsFallback(
  text: string,
  characterId: string,
  cacheKey: string,
): Promise<string> {
  const redisKey     = `audio:${cacheKey}`;
  const mp3Path       = path.join(AUDIO_DIR, `${cacheKey}.mp3`);
  const mp3PublicUrl  = `/audio/${cacheKey}.mp3`;

  const voiceId = await resolveElevenLabsVoice(characterId);
  console.log(`[voice:fallback] ${characterId} → ElevenLabs ${voiceId}`);

  const audioStream = await elevenlabs.textToSpeech.convert(voiceId, {
    text,
    model_id: 'eleven_multilingual_v2',
    output_format: 'mp3_44100_128',
  });

  const chunks: Buffer[] = [];
  for await (const chunk of audioStream as unknown as AsyncIterable<Buffer>) {
    chunks.push(chunk);
  }
  const buffer = Buffer.concat(chunks);

  fs.mkdirSync(AUDIO_DIR, { recursive: true });
  fs.writeFileSync(mp3Path, buffer);
  await redisSet(redisKey, mp3PublicUrl, 604800);

  return mp3PublicUrl;
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
    // Without this, Scribe tags non-speech sounds inline in the transcript
    // (e.g. "(5 second pause)", "(sound of wind)") — fine for general use,
    // but these were leaking straight into the chat input for kids. Defaults
    // to true if omitted.
    tag_audio_events: false,
  } as never);
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
  const mp3Path   = path.join(AUDIO_DIR, `${cacheKey}.mp3`);
  const publicUrl = `/audio/${cacheKey}.wav`;

  // 1. Redis cache hit
  const cached = await redisGet(redisKey);
  if (cached) return cached;

  // 2. File already exists on disk (Gemini .wav or a prior ElevenLabs .mp3 fallback)
  if (fs.existsSync(filePath)) {
    await redisSet(redisKey, publicUrl, 604800);
    return publicUrl;
  }
  if (fs.existsSync(mp3Path)) {
    const mp3Url = `/audio/${cacheKey}.mp3`;
    await redisSet(redisKey, mp3Url, 604800);
    return mp3Url;
  }

  // 3. Call Gemini TTS
  const voiceName = await resolveGeminiVoice(characterId);
  console.log(`[voice] ${characterId} → ${voiceName}`);

  const id = characterId.toLowerCase();
  const isTeacher = id.includes('luna');
  const isMascot  = id.includes('miga');
  const isJules   = id.includes('jules');
  const isSophie  = id.includes('sophie');

  const systemInstruction = isTeacher
    ? 'You are a warm, gentle teacher named Ms. Luna speaking kindly and encouragingly to a young child.'
    : isMascot
    ? 'You are Miga, an energetic and playful dragon mascot. Speak with childlike excitement and wonder.'
    : isJules
    ? 'You are Jules, a cool laid-back male teacher in his thirties who surfs. Speak with a warm, calm, confident adult male voice. You are enthusiastic but not excitable — think cool older brother energy, never childlike.'
    : isSophie
    ? 'You are Sophie, a warm, cool young woman in her early twenties — like a big sister. Speak with a warm, confident, friendly adult female voice. Casual and real, never childlike, never stiff or robotic.'
    : `You are an energetic, friendly 9-year-old child. Speak with a bright, high-pitched, youthful tone. Use natural pacing and innocent excitement. Never sound like an adult.`;

  const audioTags = isTeacher
    ? '[warm] [gentle] '
    : isMascot
    ? '[excited] [high-pitched] '
    : isJules
    ? '[warm] [confident] [relaxed] '
    : isSophie
    ? '[warm] [confident] [casual] '
    : '[excited] [high-pitched] ';

  const prompt = `${systemInstruction}\n\n${audioTags}${text}`;

  const pcmChunks: Buffer[] = [];
  let streamSuccess = false;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const stream = await gemini.models.generateContentStream({
        model: 'gemini-2.5-flash-preview-tts',
        contents: [{ parts: [{ text: prompt }] }],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName },
            },
          },
        } as never,
      });

      for await (const chunk of stream) {
        const candidates = (chunk as unknown as Record<string, unknown>).candidates as Array<Record<string, unknown>> | undefined;
        const parts = (candidates?.[0]?.content as Record<string, unknown>)?.parts as Array<Record<string, unknown>> | undefined;
        const base64 = (parts?.[0]?.inlineData as Record<string, unknown>)?.data as string | undefined;
        if (base64) {
          pcmChunks.push(Buffer.from(base64, 'base64'));
        }
      }

      if (pcmChunks.length > 0) {
        streamSuccess = true;
        break;
      }
      console.warn(`[voice] Gemini stream attempt ${attempt}: no audio chunks`);
    } catch (err) {
      console.warn(`[voice] Gemini stream attempt ${attempt} error:`, err);
      pcmChunks.length = 0;
    }
  }

  if (!streamSuccess || pcmChunks.length === 0) {
    console.warn(`[voice] Gemini TTS exhausted retries for "${characterId}" — falling back to ElevenLabs`);
    return generateElevenLabsFallback(text, characterId, cacheKey);
  }

  const fullPcm = Buffer.concat(pcmChunks);
  const buffer = await pcmToWav(fullPcm);

  // 4. Save to disk
  fs.mkdirSync(AUDIO_DIR, { recursive: true });
  fs.writeFileSync(filePath, buffer);

  // 5. Cache URL for 7 days
  await redisSet(redisKey, publicUrl, 604800);

  return publicUrl;
}

export async function generateSpeechStream(
  text: string,
  characterId: string,
  language: 'en' | 'fr',
  res: import('express').Response,
  cacheKeyOverride?: string,
): Promise<void> {
  try {
    const publicUrl = await generateSpeech(text, characterId, language, cacheKeyOverride);
    res.redirect(302, publicUrl);
  } catch (err) {
    console.error('[voice:stream] error:', err);
    if (!res.headersSent) res.status(500).json({ error: 'Failed to generate audio' });
  }
}
