import { fal } from '@fal-ai/client';
import Anthropic from '@anthropic-ai/sdk';

fal.config({ credentials: process.env.FAL_API_KEY ?? '' });

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
  return url;
}

export async function generatePostImage(
  postText: string,
  friendName: string,
  friendAge: number,
  sceneEmojis: string,
  friendAvatarUrl: string,
): Promise<string> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const promptRes = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 150,
    messages: [{
      role: 'user',
      content: `You generate image prompts for a children's social app.
A ${friendAge}-year-old child named ${friendName} posted: "${postText}"
Scene emojis hint: ${sceneEmojis}

Write a single image generation prompt (max 50 words) that:
1. Describes ${friendName} as a cartoon child character in the scene
2. Includes the specific activity/setting from the post
3. Ends with: "Pixar cartoon style, children's illustration, vibrant colors, safe for kids"

Example: "A cheerful 10-year-old boy with brown hair building a birdhouse in a sunny garden, wooden planks and hammer nearby, Pixar cartoon style, children's illustration, vibrant colors, safe for kids"

Return ONLY the prompt, no explanation`,
    }],
  });

  const scenePrompt = promptRes.content[0].type === 'text'
    ? promptRes.content[0].text.trim()
    : `${friendName} in a fun scene, Pixar cartoon style, children's illustration, vibrant colors`;

  const result = await fal.subscribe('fal-ai/flux/schnell', {
    input: {
      prompt: scenePrompt,
      image_size: 'square_hd',
      num_inference_steps: 4,
      num_images: 1,
    },
    pollInterval: 500,
  });

  const r = result as unknown as { data: { images: Array<{ url: string }> } };
  const url = r.data?.images?.[0]?.url;
  if (!url) throw new Error('No image in fal post image response');
  console.log(`[avatar] post image URL for ${friendName}:`, url);
  return url;
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
  return url;
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
  return url;
}