import * as dotenv from 'dotenv';
dotenv.config();

import db from '../src/db';
import { generateMascotAvatar } from '../src/services/avatar.service';

const MASCOT_IDS = ['miga', 'pixel', 'finn', 'sage'];

async function run() {
  console.log('\nMascot Avatar Generator\n' + '='.repeat(40));
  console.log('Reminder: if you see UNABLE_TO_VERIFY_LEAF_SIGNATURE errors, temporarily disable Avast Web Shield / HTTPS scanning, then re-run this script.\n');

  let succeeded = 0;
  let failed = 0;

  for (const mascotId of MASCOT_IDS) {
    try {
      console.log(`Generating portrait for ${mascotId}...`);
      const url = await generateMascotAvatar(mascotId);

      // Upsert: insert if new, update avatar_url + created_at if it already exists
      await db('mascot_avatars')
        .insert({ id: mascotId, avatar_url: url })
        .onConflict('id')
        .merge({ avatar_url: url, created_at: db.fn.now() });

      console.log(`  ✓ ${mascotId}: ${url}`);
      succeeded++;
    } catch (err) {
      console.error(`  ✗ ${mascotId}: failed —`, err);
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
