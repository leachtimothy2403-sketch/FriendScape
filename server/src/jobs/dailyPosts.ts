import cron from 'node-cron';
import db from '../db';
import {
  generateDailyPosts as generateDailyPostsAI,
  buildMemoryBrief,
} from '../services/ai.service';
import { toChildType, toFriendType, toMemoryType } from '../utils/db-mappers';

cron.schedule('0 8 * * *', async () => {
  console.log('[posts] 🌅 Starting daily post generation…');

  try {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    // All children who have at least one active friend
    const childIds = await db('child_friends')
      .distinct('child_id')
      .pluck('child_id') as string[];

    let generated = 0;

    for (const childId of childIds) {
      try {
        // Skip if already generated today
        const existing = await db('posts')
          .where({ child_id: childId, author_type: 'ai' })
          .where('created_at', '>=', startOfDay)
          .first();
        if (existing) continue;

        const childRow = await db('children').where({ id: childId }).first();
        if (!childRow) continue;

        const friendRows = await db('child_friends')
          .join('ai_friends', 'ai_friends.id', 'child_friends.friend_id')
          .where({ 'child_friends.child_id': childId, 'ai_friends.is_teacher': false })
          .select('ai_friends.*');

        if (friendRows.length === 0) continue;

        const memoryRows = await db('child_memories').where({ child_id: childId });
        const memoryBrief = memoryRows.length > 0
          ? buildMemoryBrief(toMemoryType(memoryRows[0]))
          : null;

        const child   = toChildType(childRow);
        const friends = (friendRows as Record<string, unknown>[]).map(toFriendType);
        const lang    = (childRow.language as string) || 'en';

        const result = await generateDailyPostsAI(friends, child, memoryBrief, lang);

        if (result.error || result.posts.length === 0) continue;

        const friendByName = new Map(friends.map(f => [f.name.toLowerCase(), f.id]));

        await Promise.all(
          result.posts.map(post => {
            const authorId = friendByName.get(post.friendName.toLowerCase()) ?? post.friendId;
            return db('posts').insert({
              child_id:    childId,
              author_id:   authorId,
              author_type: 'ai',
              content:     post.text,
              scene_emojis: post.sceneEmojis,
              mood:        post.mood,
            });
          }),
        );

        console.log(`[posts] ✅ ${child.name}: ${result.posts.length} posts generated`);
        generated++;
      } catch (childErr) {
        console.error(`[posts] ❌ Failed for child ${childId}:`, childErr);
      }
    }

    console.log(`[posts] 🌅 Generated daily posts for ${generated} children`);
  } catch (err) {
    console.error('[posts] ❌ Daily post scheduler failed:', err);
  }
});

console.log('[posts] 🌅 Daily posts job scheduled');
