import * as dotenv from 'dotenv';
dotenv.config();

import db from '../src/db';
import { generateFriendPortrait, generateAdultFriendPortrait } from '../src/services/avatar.service';

const ADULT_STYLE_NAMES = ['Coach Mike', 'Capitaine Coquillage', 'Jules'];

async function run() {
  console.log('\nStar Friend Avatar Generator\n' + '='.repeat(40));
  console.log('Reminder: if you see UNABLE_TO_VERIFY_LEAF_SIGNATURE errors, temporarily disable Avast Web Shield / HTTPS scanning, then re-run this script.\n');

  const rows = await db('ai_friends')
    .where({ is_star_friend: true })
    .whereNull('avatar_url');

  console.log(`Found ${rows.length} star friend(s) without an avatar.\n`);

  let succeeded = 0;
  let failed = 0;

  for (const row of rows) {
    const personality: string[] = row.personality ?? [];
    const language = 'en';

    try {
      let url: string;

      if (ADULT_STYLE_NAMES.includes(row.name)) {
        console.log(`[adult] Generating portrait for ${row.name}...`);
        if (row.name === 'Jules') {
          // Jules-specific prompt — cool adult male teacher, surfer
          const { fal } = await import('@fal-ai/client');
          const result = await fal.subscribe('fal-ai/flux/schnell', {
            input: {
              prompt: 'Pixar cartoon portrait of a cool friendly adult male teacher in his early thirties, tousled sun-bleached hair, warm smile, relaxed confidence, slight tan, casual summer style, children\'s app illustration style, plain warm light background, centered portrait, vibrant friendly colors, high quality',
              negative_prompt: 'child, kid, teenager, scary, dark, realistic photo, elderly, old, text, watermark, female, woman',
              image_size: 'square',
              num_inference_steps: 4,
              num_images: 1,
            } as never,
            pollInterval: 500,
          });
          const r = result as unknown as { data: { images: Array<{ url: string }> } };
          url = r.data?.images?.[0]?.url ?? '';
          if (!url) throw new Error('No image for Jules');
        } else {
          url = await generateAdultFriendPortrait(row.name, row.gender, personality, language);
        }
      } else {
        const age: number = row.age ?? 10;
        console.log(`[child] Generating portrait for ${row.name} (age ${age})...`);
        url = await generateFriendPortrait(row.name, age, row.gender, personality, language);
      }

      await db('ai_friends').where({ id: row.id }).update({ avatar_url: url });
      console.log(`  ✓ ${row.name}: ${url}`);
      succeeded++;
    } catch (err) {
      console.error(`  ✗ ${row.name}: failed —`, err);
      failed++;
    }
  }

  console.log('\n' + '='.repeat(40));
  console.log(`Done. ${succeeded} succeeded, ${failed} failed.\n`);
  process.exit(0);
}

run().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
