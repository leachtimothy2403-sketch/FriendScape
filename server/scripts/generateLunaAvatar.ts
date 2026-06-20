import * as dotenv from 'dotenv';
dotenv.config();

import db from '../src/db';
import { generateLunaPortrait } from '../src/services/avatar.service';

async function run() {
  console.log('\nMs. Luna Avatar Generator\n' + '='.repeat(40));

  const row = await db('ai_friends').where({ name: 'Ms. Luna', is_teacher: true }).first();

  if (!row) {
    console.error('Ms. Luna not found in ai_friends.');
    process.exit(1);
  }

  if (row.avatar_url) {
    console.log(`Ms. Luna already has an avatar: ${row.avatar_url}`);
    process.exit(0);
  }

  try {
    const url = await generateLunaPortrait();
    await db('ai_friends').where({ id: row.id }).update({ avatar_url: url });
    console.log(`  ✓ Ms. Luna avatar saved: ${url}`);
  } catch (err) {
    console.error('  ✗ Ms. Luna avatar generation failed:', err);
    process.exit(1);
  }

  console.log('\n' + '='.repeat(40));
  process.exit(0);
}

run().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
