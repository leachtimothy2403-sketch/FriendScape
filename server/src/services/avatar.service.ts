import { fal } from '@fal-ai/client';
import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import crypto from 'crypto';
import db from '../db';

fal.config({ credentials: process.env.FAL_API_KEY ?? '' });

const AVATAR_DIR = path.join(__dirname, '../../public/avatars');

export async function downloadAndSave(falUrl: string): Promise<string> {
  fs.mkdirSync(AVATAR_DIR, { recursive: true });
  const hash     = crypto.createHash('md5').update(falUrl).digest('hex').slice(0, 16);
  const filename = `avatar_${hash}.jpg`;
  const filepath = path.join(AVATAR_DIR, filename);
  const localUrl = `${process.env.BASE_URL || 'http://localhost:3001'}/avatars/${filename}`;

  if (fs.existsSync(filepath)) return localUrl;

  return new Promise((resolve, reject) => {
    const protocol = falUrl.startsWith('https') ? https : http;
    const file = fs.createWriteStream(filepath);
    protocol.get(falUrl, (res) => {
      res.pipe(file);
      file.on('finish', () => {
        file.close();
        console.log(`[avatar] saved locally: ${filename}`);
        resolve(localUrl);
      });
    }).on('error', (err) => {
      fs.unlink(filepath, () => {});
      reject(err);
    });
  });
}

export async function generateFriendPortrait(
  name: string,
  age: number,
  gender: string,
  personality: string[],
  language: string,
): Promise<string> {
  const genderWord = gender === 'girl' || gender === 'female' ? 'girl' : 'boy';
  const styleWord = language === 'fr' ? 'French' : 'Western';
  const prompt = `Pixar cartoon portrait of a ${age} year old ${genderWord} child, ${personality.slice(0, 2).join(', ')} personality, ${styleWord} children's app style, young kid face, round cheeks, big eyes, friendly smile, plain light background, centered, vibrant colors, high quality illustration`;

  const result = await fal.subscribe('fal-ai/flux/schnell', {
    input: {
      prompt,
      negative_prompt: 'adult, teenager, mature face, realistic photo, old, wrinkles, text, watermark',
      image_size: 'square',
      num_inference_steps: 4,
      num_images: 1,
    } as never,
    pollInterval: 500,
  });
  const r = result as unknown as { data: { images: Array<{ url: string }> } };
  const url = r.data?.images?.[0]?.url;
  if (!url) throw new Error('No image in fal friend portrait response');
  console.log(`[avatar] friend portrait URL for ${name}:`, url);
  return await downloadAndSave(url);
}

export async function generateAdultFriendPortrait(
  name: string,
  gender: string,
  personality: string[],
  language: string,
): Promise<string> {
  const genderWord = gender === 'female' || gender === 'girl' ? 'woman' : 'man';
  const styleWord = language === 'fr' ? 'French' : 'Western';
  const prompt = `Pixar cartoon portrait of a friendly young adult ${genderWord}, ${personality.slice(0, 2).join(', ')} personality, ${styleWord} children's app style, warm approachable face, friendly smile, plain light background, centered, vibrant colors, high quality illustration, appropriate for a kids' app`;

  const result = await fal.subscribe('fal-ai/flux/schnell', {
    input: {
      prompt,
      negative_prompt: 'child, kid, teenager, scary, dark, realistic photo, old, elderly, text, watermark',
      image_size: 'square',
      num_inference_steps: 4,
      num_images: 1,
    } as never,
    pollInterval: 500,
  });
  const r = result as unknown as { data: { images: Array<{ url: string }> } };
  const url = r.data?.images?.[0]?.url;
  if (!url) throw new Error('No image in fal adult friend portrait response');
  console.log(`[avatar] adult friend portrait URL for ${name}:`, url);
  return await downloadAndSave(url);
}

export async function generateLunaPortrait(): Promise<string> {
  const prompt = `Pixar cartoon portrait of a warm kind woman in her 60s, grey or silver hair, wearing glasses, gentle teacher-like smile, soft kind eyes, children's app style, plain light background, centered, vibrant colors, high quality illustration, appropriate for a kids' educational app`;

  const result = await fal.subscribe('fal-ai/flux/schnell', {
    input: {
      prompt,
      negative_prompt: 'child, kid, teenager, young adult, scary, dark, realistic photo, text, watermark',
      image_size: 'square',
      num_inference_steps: 4,
      num_images: 1,
    } as never,
    pollInterval: 500,
  });
  const r = result as unknown as { data: { images: Array<{ url: string }> } };
  const url = r.data?.images?.[0]?.url;
  if (!url) throw new Error('No image in fal Luna portrait response');
  console.log('[avatar] Luna portrait URL:', url);
  return await downloadAndSave(url);
}

export async function generatePostImage(
  postText: string,
  friendName: string,
  friendAge: number,
  sceneEmojis: string,
  friendAvatarUrl: string,
  isAdult: boolean = false,
): Promise<string> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const characterDescription = isAdult
    ? `an adult named ${friendName}`
    : `a ${friendAge}-year-old child named ${friendName}`;

  const exampleLine = isAdult
    ? `A cheerful young adult with tousled hair building a birdhouse in a sunny garden, wooden planks and hammer nearby, Pixar cartoon style, children's illustration, vibrant colors, safe for kids`
    : `A cheerful 10-year-old boy with brown hair building a birdhouse in a sunny garden, wooden planks and hammer nearby, Pixar cartoon style, children's illustration, vibrant colors, safe for kids`;

  const promptRes = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 150,
    messages: [{
      role: 'user',
      content: `You generate image prompts for a children's social app.
${characterDescription} posted: "${postText}"
Scene emojis hint: ${sceneEmojis}

Write a single image generation prompt (max 50 words) that:
1. Describes ${friendName} as a cartoon ${isAdult ? 'adult' : 'child'} character in the scene
2. Includes the specific activity/setting from the post
3. Never depicts a phone, computer, tablet, TV, screen, book page, sign, or any other object with
   readable text/writing on it — image models render fake garbled text, so describe the physical
   activity itself instead (e.g. "surfing" not "texting a friend about surfing")
4. Ends with: "Pixar cartoon style, children's illustration, vibrant colors, safe for kids"

Example: "${exampleLine}"

Return ONLY the prompt, no explanation`,
    }],
  });

  const rawScenePrompt = promptRes.content[0].type === 'text'
    ? promptRes.content[0].text.trim()
    : `${friendName} in a fun scene, Pixar cartoon style, children's illustration, vibrant colors`;

  // Deterministic reinforcement — don't rely solely on Claude Haiku having kept the age
  // descriptor in its 50-word prompt. fal's flux/schnell skews adult-looking without an
  // explicit, unambiguous age cue in the final string sent to it.
  const ageReinforcement = isAdult ? 'young adult' : `young ${friendAge}-year-old child`;
  const scenePrompt = `${rawScenePrompt}, ${friendName} depicted as a ${ageReinforcement}`;

  const MAX_ATTEMPTS = 3;
  let lastErr: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const result = await fal.subscribe('fal-ai/flux/schnell', {
        input: {
          prompt: scenePrompt,
          negative_prompt: `text, words, letters, writing, screen, phone, computer, tablet, television, UI, app interface, screenshot, watermark, blurry, distorted, realistic photo, ${isAdult ? 'child, kid, teenager, young adult' : 'adult, grown-up, mature, elderly'}`,
          image_size: 'square_hd',
          num_inference_steps: 4,
          num_images: 1,
        } as never,
        pollInterval: 500,
      });

      const r = result as unknown as {
        data: { images: Array<{ url: string }>; has_nsfw_concepts?: boolean[] };
      };
      const url = r.data?.images?.[0]?.url;
      if (!url) throw new Error('No image in fal post image response');
      if (r.data?.has_nsfw_concepts?.[0]) {
        // fal returns a real URL even when the image was content-flagged (typically a blacked-out
        // placeholder) — treat that the same as a failed generation rather than saving a black image.
        // Likely a false positive (child-depicting prompts get extra-cautious filtering) — worth a retry.
        throw new Error('fal flagged the generated post image as NSFW — retrying');
      }
      console.log(`[avatar] post image URL for ${friendName} (attempt ${attempt}):`, url);
      return await downloadAndSave(url);
    } catch (err) {
      lastErr = err;
      console.warn(`[avatar] post image attempt ${attempt}/${MAX_ATTEMPTS} failed for ${friendName}:`, err);
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error('Post image generation failed after retries');
}

export async function cartoonifyPhoto(base64DataUri: string): Promise<string> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const visionRes = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 150,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: 'image/jpeg',
            data: base64DataUri.replace(/^data:image\/\w+;base64,/, ''),
          },
        },
        {
          type: 'text',
          text: 'Describe this person for a cartoon avatar. Return ONLY a comma-separated trait list under 25 words. Include ONLY what you can clearly see: hair color, hair length (short/medium/long), hair style, eye color, skin tone. Only mention glasses if they are very clearly and obviously visible. Example output: long straight brown hair, brown eyes, light skin tone',
        },
      ],
    }],
  });

  const traits = visionRes.content[0].type === 'text'
    ? visionRes.content[0].text.trim()
    : 'brown hair, brown eyes, light skin tone';

  console.log('[avatar] extracted traits:', traits);

  const prompt = `Pixar cartoon portrait of a smiling child with ${traits}, young kid face, round cheeks, big expressive eyes, friendly happy smile, plain light background, centered, vibrant colors, high quality illustration, children's app style`;

  const result = await fal.subscribe('fal-ai/flux/schnell', {
    input: {
      prompt,
      negative_prompt: 'glasses, spectacles, adult, teenager, realistic photo, old, wrinkles, text, watermark, sad, angry',
      image_size: 'square_hd',
      num_inference_steps: 4,
      num_images: 1,
    } as never,
    pollInterval: 500,
  });

  const r = result as unknown as { data: { images: Array<{ url: string }> } };
  const url = r.data?.images?.[0]?.url;
  if (!url) throw new Error('No image in fal response');
  console.log('[avatar] cartoon URL:', url);
  return await downloadAndSave(url);
}

export async function cartoonifyScenePhoto(
  base64DataUri: string,
  mediaType: string,
): Promise<{ cartoonUrl: string; sceneDescription: string } | null> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const visionRes = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 200,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: mediaType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
            data: base64DataUri.replace(/^data:image\/\w+;base64,/, ''),
          },
        },
        {
          type: 'text',
          text: `You are a content moderator for a children's app.
Look at this photo and respond with EXACTLY one of:
- REJECTED if you can see any human face, person, or body part
- A short scene description (max 30 words) describing only objects, animals, food, places, or activities — NO people

Examples of valid descriptions:
"a birthday cake with candles on a table"
"a dog playing in a sunny garden"
"colorful drawings and art supplies spread on a desk"
"a view of mountains and trees"

Respond with only REJECTED or the description. Nothing else.`,
        },
      ],
    }],
  });

  const description = visionRes.content[0].type === 'text'
    ? visionRes.content[0].text.trim()
    : 'REJECTED';

  if (description === 'REJECTED' || description.toUpperCase().startsWith('REJECTED')) {
    console.log('[avatar] scene photo rejected — contains people');
    return null;
  }

  console.log('[avatar] scene description:', description);

  const prompt = `Pixar-style cartoon illustration closely depicting: ${description}. Match the specific animals, objects and setting described. Vibrant warm colors, children's book illustration style, friendly and cute, detailed and faithful to the scene, high quality`;

  const result = await fal.subscribe('fal-ai/flux/schnell', {
    input: {
      prompt,
      negative_prompt: 'person, people, face, human, realistic photo, dark, scary, text, watermark, generic, unrelated',
      image_size: 'square_hd',
      num_inference_steps: 8,
      num_images: 1,
    } as never,
    pollInterval: 500,
  });

  const r = result as unknown as { data: { images: Array<{ url: string }> } };
  const url = r.data?.images?.[0]?.url;
  if (!url) throw new Error('No image in fal scene response');
  const localUrl = await downloadAndSave(url);
  console.log('[avatar] scene cartoon URL:', url, '→ local:', localUrl);
  return { cartoonUrl: localUrl, sceneDescription: description };
}

const MASCOT_PROMPTS: Record<string, string> = {
  miga: 'Pixar cartoon portrait of an adorable small friendly dragon with sparkly purple and gold scales, big warm expressive eyes, small cute wings, warm happy smile, plain light background, centered, children\'s illustration style, vibrant colors',
  pixel: 'Pixar cartoon portrait of a friendly small robot with big round glowing blue eyes, silver and blue body, warm happy smile, small antenna, plain light background, centered, children\'s illustration style, vibrant colors',
  finn: 'Pixar cartoon portrait of a clever friendly fox cub with bright amber eyes, fluffy orange fur, white chest, playful smile, plain light background, centered, children\'s illustration style, vibrant colors',
  sage: 'Pixar cartoon portrait of a wise friendly owl with large warm golden eyes, soft brown and cream feathers, gentle kind smile, plain light background, centered, children\'s illustration style, vibrant colors',
};

export async function generateMascotAvatar(mascotId: string): Promise<string> {
  const prompt = MASCOT_PROMPTS[mascotId];
  if (!prompt) throw new Error(`Unknown mascot: ${mascotId}`);

  const result = await fal.subscribe('fal-ai/flux/schnell', {
    input: {
      prompt,
      negative_prompt: 'realistic, photo, adult, scary, dark, text, watermark',
      image_size: 'square_hd',
      num_inference_steps: 4,
      num_images: 1,
    } as never,
    pollInterval: 500,
  });

  const r = result as unknown as { data: { images: Array<{ url: string }> } };
  const url = r.data?.images?.[0]?.url;
  if (!url) throw new Error('No image in fal mascot response');
  console.log(`[avatar] mascot ${mascotId} URL:`, url);
  return await downloadAndSave(url);
}

// ── Content image library (reusable illustrative images for chat replies) ────
//
// A friend (e.g. Jules explaining a compass) can ask to show a simple picture.
// Rather than generating one live every single time — slow, costly, and prone
// to the same reliability issues we've already hit with post images — this
// checks a growing library first, only generating (and saving for next time)
// when nothing close enough already exists.

function normalizeTopicTag(topic: string): string {
  return topic.trim().toLowerCase();
}

async function findContentImage(topic: string): Promise<string | null> {
  const normalized = normalizeTopicTag(topic);
  const row = await db('content_images')
    .whereRaw(
      `EXISTS (SELECT 1 FROM unnest(tags) t WHERE t ILIKE '%' || ? || '%' OR ? ILIKE '%' || t || '%')`,
      [normalized, normalized],
    )
    .select('image_url')
    .first() as { image_url: string } | undefined;
  return row?.image_url ?? null;
}

async function generateContentImage(topic: string, language: 'en' | 'fr'): Promise<string> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const promptRes = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 100,
    messages: [{
      role: 'user',
      content: `Write a single image generation prompt (max 40 words) for a simple, clear educational
illustration of: "${topic}". It should look like a colorful children's textbook diagram — clean,
labeled if relevant (e.g. compass directions), easy to understand at a glance, no clutter.
End with: "Pixar cartoon style, children's educational illustration, vibrant colors, safe for kids".
Return ONLY the prompt, no explanation.`,
    }],
  });

  const scenePrompt = promptRes.content[0].type === 'text'
    ? promptRes.content[0].text.trim()
    : `A simple, clear educational illustration of ${topic}, Pixar cartoon style, children's educational illustration, vibrant colors`;

  const MAX_ATTEMPTS = 3;
  let lastErr: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const result = await fal.subscribe('fal-ai/flux/schnell', {
        input: {
          prompt: scenePrompt,
          negative_prompt: 'text errors, garbled text, watermark, blurry, distorted, realistic photo, scary, dark, adult, clutter',
          image_size: 'square_hd',
          num_inference_steps: 4,
          num_images: 1,
        } as never,
        pollInterval: 500,
      });

      const r = result as unknown as {
        data: { images: Array<{ url: string }>; has_nsfw_concepts?: boolean[] };
      };
      const url = r.data?.images?.[0]?.url;
      if (!url) throw new Error('No image in fal content-image response');
      if (r.data?.has_nsfw_concepts?.[0]) {
        throw new Error('fal flagged the generated content image as NSFW — retrying');
      }

      const savedUrl = await downloadAndSave(url);

      const description = `${topic} — ${scenePrompt}`;
      await db('content_images').insert({
        tags:            [normalizeTopicTag(topic)],
        description_en:  language === 'en' ? description : topic,
        description_fr:  language === 'fr' ? description : topic,
        image_url:       savedUrl,
        category:        null,
      }).catch((err: unknown) => console.warn('[content-image] failed to save to library:', err));

      return savedUrl;
    } catch (err) {
      lastErr = err;
      console.warn(`[content-image] attempt ${attempt}/${MAX_ATTEMPTS} failed for "${topic}":`, err);
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error('Content image generation failed after retries');
}

// Public entry point: look up the library first, generate (and cache) only if needed.
// Returns null on any failure rather than throwing — a missing illustration should
// never break the chat reply itself.
export async function resolveContentImage(topic: string, language: 'en' | 'fr'): Promise<string | null> {
  try {
    const existing = await findContentImage(topic);
    if (existing) return existing;
    return await generateContentImage(topic, language);
  } catch (err) {
    console.error(`[content-image] resolveContentImage failed for "${topic}":`, err);
    return null;
  }
}