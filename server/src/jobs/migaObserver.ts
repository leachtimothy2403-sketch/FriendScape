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

        // Check for badge trigger (encouraging_messages)
        if (analysis.badge_trigger === 'encouraging_messages') {
          const count = await db('messages')
            .join('conversations', 'conversations.id', 'messages.conversation_id')
            .where('conversations.child_id', childId)
            .where('messages.sender_type', 'child')
            .whereRaw(
              "messages.content ILIKE ANY(ARRAY['%good%','%great%','%amazing%','%love%','%awesome%','%proud%','%bien%','%super%','%g\\u00e9nial%','%bravo%','%incroyable%'])",
            )
            .count('messages.id as count')
            .first() as { count: string } | undefined;

          const val = Number(count?.count ?? 0);

          // Award badge if threshold met and not yet earned
          const badge = await db('badge_definitions')
            .where({ trigger_type: 'encouraging_messages' })
            .first() as { id: string; xp_required: number | null; lumi_message: string | null; lumi_message_fr: string | null } | undefined;

          if (badge && (badge.xp_required === null || val >= badge.xp_required)) {
            const already = await db('child_badges')
              .where({ child_id: childId, badge_id: badge.id })
              .first();

            if (!already) {
              await db('child_badges')
                .insert({ child_id: childId, badge_id: badge.id })
                .onConflict(['child_id', 'badge_id']).ignore();

              const migaMsg = lang === 'fr'
                ? (badge.lumi_message_fr ?? badge.lumi_message)
                : badge.lumi_message;

              if (migaMsg) {
                await sendMigaDM(childId, migaMsg).catch(() => {});
              }
            }
          }
        }

        processed++;
      } catch (childErr) {
        console.error(`[miga] ❌ Failed for child ${childId}:`, childErr);
      }
    }

    console.log(`[miga] 👁️ Processed ${processed} / ${activeChildIds.length} children`);
  } catch (err) {
    console.error('[miga] ❌ Observer failed:', err);
  }
});

console.log('[miga] 👁️ Digital literacy observer scheduled');
