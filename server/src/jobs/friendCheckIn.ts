import cron from 'node-cron';
import db from '../db';
import { generateFriendReply, buildMemoryBrief } from '../services/ai.service';
import { toChildType, toFriendType, toMemoryType } from '../utils/db-mappers';

const isDev = process.env.NODE_ENV === 'development';

// In dev: check in after 10 minutes of silence; prod: 2 hours
const SILENCE_THRESHOLD_MS = isDev ? 10 * 60 * 1000 : 2 * 60 * 60 * 1000;
// Don't send another check-in within 4 hours
const CHECKIN_COOLDOWN_MS  = 4 * 60 * 60 * 1000;

async function runCheckIns(): Promise<void> {
  const now     = new Date();
  const cutoff  = new Date(now.getTime() - SILENCE_THRESHOLD_MS);
  const cooloff = new Date(now.getTime() - CHECKIN_COOLDOWN_MS);

  // Find conversations where the last message was from the child and is old enough
  const candidates = await db('conversations as c')
    .join('messages as m', function () {
      this.on('m.conversation_id', '=', 'c.id')
        .andOn('m.created_at', '=',
          db.raw('(select max(created_at) from messages where conversation_id = c.id)'),
        );
    })
    .where('m.sender_type', 'child')
    .where('m.created_at', '<', cutoff)
    .select('c.id as conv_id', 'c.child_id', 'c.friend_id', 'm.created_at as last_msg_at') as Array<{
      conv_id: string;
      child_id: string;
      friend_id: string;
      last_msg_at: string;
    }>;

  for (const conv of candidates) {
    try {
      // Cooldown — skip if friend already sent a check-in recently
      const recentCheckin = await db('messages')
        .where({ conversation_id: conv.conv_id, sender_type: 'ai' })
        .where('created_at', '>', cooloff)
        .first();

      if (recentCheckin) continue;

      const [childRow, friendRow, memoryRow] = await Promise.all([
        db('children').where({ id: conv.child_id }).first(),
        db('ai_friends').where({ id: conv.friend_id }).first(),
        db('child_memories').where({ child_id: conv.child_id, friend_id: conv.friend_id }).first(),
      ]);

      if (!childRow || !friendRow) continue;

      const child  = toChildType(childRow);
      const friend = toFriendType(friendRow);
      const memoryBrief = memoryRow ? buildMemoryBrief(toMemoryType(memoryRow)) : null;
      const lang = (childRow.language as string) || 'en';

      const recentMessages = await db('messages')
        .where({ conversation_id: conv.conv_id })
        .orderBy('created_at', 'asc')
        .limit(10)
        .select('content', 'sender_type') as Array<{ content: string; sender_type: string }>;

      console.log(`[checkin] 💬 ${friend.name} checking in with ${child.name}`);

      const reply = await generateFriendReply(
        friend,
        child,
        '[check-in]',
        memoryBrief,
        lang,
        recentMessages,
        '',
        true,
      );

      await db('messages').insert({
        conversation_id: conv.conv_id,
        sender_id:       conv.friend_id,
        sender_type:     'ai',
        content:         reply.text,
        created_at:      new Date(),
      });

      console.log(`[checkin] ✅ Sent: "${reply.text.slice(0, 60)}"`);
    } catch (err) {
      console.error('[checkin] ❌ Check-in failed for conv', conv.conv_id, err);
    }
  }
}

cron.schedule('*/30 * * * *', () => {
  runCheckIns().catch((err: unknown) =>
    console.error('[checkin] ❌ Job failed:', err),
  );
});

console.log('[checkin] 💬 Friend check-in job scheduled');
