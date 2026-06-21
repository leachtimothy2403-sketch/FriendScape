import cron from 'node-cron';
import db from '../db';
import {
  generateDailyPosts as generateDailyPostsAI,
  generatePostComment,
  buildMemoryBrief,
} from '../services/ai.service';
import { generatePostImage } from '../services/avatar.service';
import { toChildType, toFriendType, toMemoryType } from '../utils/db-mappers';

export async function runDailyPostsJob() {
  console.log('[posts] 🌅 Starting daily post generation…');

  try {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    // ─── PASS 1: Star friend posts (shared, generated once per star friend) ───

    const starFriendRows = await db('ai_friends')
      .where({ is_star_friend: true, is_teacher: false })
      .select('ai_friends.*') as Record<string, unknown>[];

    for (const starFriendRow of starFriendRows) {
      try {
        const starFriendId = String(starFriendRow.id);

        // Skip if shared post already exists today
        const existingShared = await db('posts')
          .where({ author_id: starFriendId, author_type: 'ai', child_id: null })
          .where('created_at', '>=', startOfDay)
          .first();
        if (existingShared) {
          console.log(`[posts] ⏭️ Skipping ${starFriendRow.name} — shared post already exists today`);
          continue;
        }

        // Find a representative child who has this star friend
        const repRow = await db('child_friends')
          .join('children', 'children.id', 'child_friends.child_id')
          .where({ 'child_friends.friend_id': starFriendId })
          .select('children.*')
          .first();
        if (!repRow) {
          console.log(`[posts] ⏭️ Skipping ${starFriendRow.name} — no child has added this friend yet`);
          continue;
        }

        const repChild = toChildType(repRow);
        const repLang  = (repRow.language as string) || 'en';

        const repMemoryRow = await db('child_memories')
          .where({ child_id: repRow.id, friend_id: starFriendId })
          .first();
        const repMemoryBrief = repMemoryRow ? buildMemoryBrief(toMemoryType(repMemoryRow)) : null;

        const starFriend = toFriendType(starFriendRow);
        const result = await generateDailyPostsAI([starFriend], repChild, null, repLang, true);

        if (result.error || result.posts.length === 0) {
          console.log(`[posts] ⏭️ Skipping ${starFriendRow.name} — AI generation returned no posts (error: ${result.error ?? 'none'})`);
          continue;
        }

        const post = result.posts[0];
        const friendAge = (starFriendRow.age as number) ?? 10;
        const avatarUrl = starFriendRow.avatar_url ? String(starFriendRow.avatar_url) : null;

        let imageUrl: string | null = null;
        if (avatarUrl) {
          try {
            imageUrl = await generatePostImage(post.text, post.friendName, friendAge, post.sceneEmojis, avatarUrl);
          } catch (err) {
            console.warn('[avatar] star post image failed:', err);
          }
        }

        const [insertedPost] = await db('posts').insert({
          child_id:     null,
          author_id:    starFriendId,
          author_type:  'ai',
          content:      post.text,
          scene_emojis: post.sceneEmojis,
          mood:         post.mood,
          image_url:    imageUrl,
        }).returning('id');

        const postId = typeof insertedPost === 'object' ? String((insertedPost as Record<string, unknown>).id) : String(insertedPost);
        console.log(`[posts] ⭐ Star post generated for ${String(starFriendRow.name)}, id=${postId}`);

        // Generate a private per-child comment from one of that child's own friends
        const allChildrenWithStar = await db('child_friends')
          .join('children', 'children.id', 'child_friends.child_id')
          .where({ 'child_friends.friend_id': starFriendId })
          .select('children.*') as Record<string, unknown>[];

        for (const childRow of allChildrenWithStar) {
          try {
            const childId  = String(childRow.id);
            const childLang = (childRow.language as string) || 'en';

            // Pick a random non-teacher, non-star friend for this child (excluding the star friend itself)
            const eligibleFriends = await db('child_friends')
              .join('ai_friends', 'ai_friends.id', 'child_friends.friend_id')
              .where({ 'child_friends.child_id': childId, 'ai_friends.is_teacher': false, 'ai_friends.is_star_friend': false })
              .select('ai_friends.*') as Record<string, unknown>[];

            if (eligibleFriends.length === 0) continue;

            const reactorRow = eligibleFriends[Math.floor(Math.random() * eligibleFriends.length)];
            const reactor    = toFriendType(reactorRow);
            const child      = toChildType(childRow);

            const memoryRow   = await db('child_memories').where({ child_id: childId, friend_id: String(reactorRow.id) }).first();
            const memoryBrief = memoryRow ? buildMemoryBrief(toMemoryType(memoryRow)) : null;

            const comment = await generatePostComment(reactor, child, post.text, memoryBrief, childLang, starFriend.name);

            await db('post_comments').insert({
              post_id:     postId,
              author_id:   String(reactorRow.id),
              author_type: 'ai',
              content:     comment.text,
              child_id:    childId,
            });

            console.log(`[posts] 💬 Star comment for child ${childId} from ${reactor.name}`);
          } catch (commentErr) {
            console.error(`[posts] ❌ Star comment failed for child ${String(childRow.id)}:`, commentErr);
          }
        }
      } catch (starErr) {
        console.error(`[posts] ❌ Star post failed for ${String(starFriendRow.id)}:`, starErr);
      }
    }

    // ─── PASS 2: Regular (non-star) friend posts — per child ─────────────────

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
          .where({ 'child_friends.child_id': childId, 'ai_friends.is_teacher': false, 'ai_friends.is_star_friend': false })
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

        for (const post of result.posts) {
          const authorId  = friendByName.get(post.friendName.toLowerCase()) ?? post.friendId;
          const friendRow = (friendRows as Record<string, unknown>[]).find(
            (f) => String(f.name ?? '').toLowerCase() === post.friendName.toLowerCase(),
          );
          const friendAge = (friendRow?.age as number) ?? 10;
          const avatarUrl = friendRow?.avatar_url ? String(friendRow.avatar_url) : null;

          let imageUrl: string | null = null;
          if (avatarUrl) {
            try {
              imageUrl = await generatePostImage(post.text, post.friendName, friendAge, post.sceneEmojis, avatarUrl);
            } catch (err) {
              console.warn('[avatar] post image failed:', err);
            }
          }

          await db('posts').insert({
            child_id:    childId,
            author_id:   authorId,
            author_type: 'ai',
            content:     post.text,
            scene_emojis: post.sceneEmojis,
            mood:        post.mood,
            image_url:   imageUrl,
          });
        }

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
}

cron.schedule('0 8 * * *', runDailyPostsJob);

console.log('[posts] 🌅 Daily posts job scheduled');
