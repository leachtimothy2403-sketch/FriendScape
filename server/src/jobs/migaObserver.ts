import cron from 'node-cron';
import db from '../db';
import { analyseDigitalCitizenship } from '../services/ai.service';
import { sendMigaDM } from '../services/migaDM';
import { toChildType } from '../utils/db-mappers';

cron.schedule('0 18 * * 0', async () => {
  console.log('[miga] 👁️ Starting weekly digital citizenship observation…');

  try {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // Children who sent messages this week
    const activeChildIds = await db('messages')
      .join('conversations', 'conversations.id', 'messages.conversation_id')
      .where('messages.sender_type', 'child')
      .where('messages.created_at', '>=', weekAgo)
      .distinct('conversations.child_id')
      .pluck('conversations.child_id') as string[];

    if (activeChildIds.length === 0) {
      console.log('[miga] No active children this week — nothing to do');
      return;
    }

    let processed = 0;

    for (const childId of activeChildIds) {
      try {
        const childRow = await db('children').where({ id: childId }).first();
        if (!childRow) continue;
        const child = toChildType(childRow);

        // Last 50 child messages this week
        const messages = await db('messages')
          .join('conversations', 'conversations.id', 'messages.conversation_id')
          .where('conversations.child_id', childId)
          .where('messages.sender_type', 'child')
          .where('messages.created_at', '>=', weekAgo)
          .orderBy('messages.created_at', 'desc')
          .limit(50)
          .pluck('messages.content') as string[];

        if (messages.length === 0) continue;

        const lang: 'en' | 'fr' = child.language === 'fr' ? 'fr' : 'en';
        const analysis = await analyseDigitalCitizenship(messages, child, lang);

        console.log(`[miga] ${child.name}: type=${analysis.type}`);

        if (analysis.type === 'none' || !analysis.message) continue;

        // Send DM from Miga
        await sendMigaDM(childId, analysis.message);

        // Parent alert if note provided
        if (analysis.parent_note) {
          await db('parent_alerts').insert({
            child_id: childId,
            type:     'digital_literacy',
            message:  analysis.parent_note,
            severity: analysis.type === 'coaching' ? 'warning' : 'info',
          });
        }

        // Note: the "encouraging_messages" badge (Kind Words / Mots Gentils) used to
        // be checked and awarded here, but only once a week and only for children
        // this AI pass happened to flag — meaning it could sit unawarded for days
        // even after the threshold was met, and relied on a fragile keyword match.
        // It's now checked live, right after every child message, via
        // checkBadgesForChild(childId, 'encouraging_messages') in messages.controller.ts,
        // based on a semantic classification Claude returns alongside each reply (see
        // REPLY_JSON_INSTRUCTION in ai.service.ts and the is_encouraging column on
        // messages). Don't re-add an award check here.

        processed++;
      } catch (childErr) {
        console.error(`[miga] ❌ Failed for child ${childId}:`, childErr);
      }
    }

    console.log(`[miga] 👁️ Processed ${processed} / ${activeChildIds.length} children`);
  } catch (err) {
    console.error('[miga] ❌ Observer failed:', err);
  }
}, { timezone: 'Europe/Paris' });

console.log('[miga] 👁️ Digital literacy observer scheduled (Europe/Paris)');
