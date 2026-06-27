import cron from 'node-cron';
import { v4 as uuidv4 } from 'uuid';
import db from '../db';
import {
  distillMemories,
  buildMemoryBrief,
} from '../services/ai.service';
import { toChildType, toMemoryType } from '../utils/db-mappers';

cron.schedule('0 0 * * *', async () => {
  console.log('[memory] 🌙 Starting nightly memory distillation…');

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Find all conversations that had child messages today
    const active = await db('messages')
      .join('conversations', 'conversations.id', 'messages.conversation_id')
      .where('messages.created_at', '>=', today)
      .where('messages.sender_type', 'child')
      .distinct(
        'conversations.child_id',
        'conversations.friend_id',
        'conversations.id as conv_id',
      )
      .select(
        'conversations.child_id',
        'conversations.friend_id',
        'conversations.id as conv_id',
      );

    // Group by child
    const byChild = new Map<string, { friendId: string; convId: string }[]>();
    for (const row of active as { child_id: string; friend_id: string; conv_id: string }[]) {
      const arr = byChild.get(row.child_id) ?? [];
      arr.push({ friendId: row.friend_id, convId: row.conv_id });
      byChild.set(row.child_id, arr);
    }

    let distilledCount = 0;

    for (const [childId, convos] of byChild.entries()) {
      const childRow = await db('children').where({ id: childId }).first();
      if (!childRow) continue;
      const child = toChildType(childRow);

      for (const { friendId, convId } of convos) {
        try {
          const friendRow = await db('ai_friends').where({ id: friendId }).first();
          if (!friendRow) continue;

          const msgs = await db('messages')
            .where({ conversation_id: convId })
            .where('created_at', '>=', today)
            .orderBy('created_at', 'asc')
            .select('sender_type', 'content');

          if (msgs.length === 0) continue;

          const memoryRow = await db('child_memories')
            .where({ child_id: childId, friend_id: friendId })
            .first();

          const existingMemory = memoryRow
            ? buildMemoryBrief(toMemoryType(memoryRow))
            : null;

          const result = await distillMemories(
            child,
            [{
              friendName: String(friendRow.name),
              messages: (msgs as { sender_type: string; content: string }[]).map(m => ({
                senderType: m.sender_type as 'child' | 'ai',
                content: m.content,
              })),
            }],
            existingMemory,
          );

          if (!result.memory) continue;

          const existingFacts       = ((memoryRow?.facts as string[])               ?? []);
          const existingEmotional   = ((memoryRow?.emotional_history as object[])   ?? []);
          const existingMilestones  = ((memoryRow?.milestones as object[])          ?? []);

          const newEmotional = result.memory.newEmotionalEvents.map(note => ({
            date: new Date().toISOString(),
            mood: 'neutral',
            note,
          }));

          const newMilestones = result.memory.newMilestones.map(title => ({
            id:          uuidv4(),
            title,
            description: title,
            achievedAt:  new Date().toISOString(),
            badgeId:     null,
          }));

          // Merge: new facts from Claude are already deduped against existing context
          const mergedFacts = [
            ...existingFacts,
            ...result.memory.updatedFacts,
            ...result.memory.interestRefinements,
          ];

          await db('child_memories')
            .insert({
              child_id:         childId,
              friend_id:        friendId,
              facts:            JSON.stringify(mergedFacts),
              emotional_history: JSON.stringify([...existingEmotional, ...newEmotional]),
              milestones:       JSON.stringify([...existingMilestones, ...newMilestones]),
              last_updated:     new Date(),
            })
            .onConflict(['child_id', 'friend_id'])
            .merge(['facts', 'emotional_history', 'milestones', 'last_updated']);

          distilledCount++;
          console.log(`[memory] ✅ ${child.name} + ${String(friendRow.name)}: ${result.memory.updatedFacts.length} new facts`);
        } catch (innerErr) {
          console.error(`[memory] ❌ Failed for child ${childId} / friend ${friendId}:`, innerErr);
        }
      }
    }

    console.log(`[memory] ✅ Distilled memories for ${byChild.size} children (${distilledCount} conversations)`);
  } catch (err) {
    console.error('[memory] ❌ Nightly distillation failed:', err);
  }
}, { timezone: 'Europe/Paris' });

console.log('[memory] 🌙 Nightly memory job scheduled (Europe/Paris)');
