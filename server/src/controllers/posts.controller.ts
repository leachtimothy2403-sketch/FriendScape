import { Response } from 'express';
import db from '../db';
import { AuthRequest } from '../middleware/auth';
import {
  generateDailyPosts as generateDailyPostsAI,
  buildMemoryBrief,
} from '../services/ai.service';
import { toChildType, toFriendType, toMemoryType } from '../utils/db-mappers';

// ─── POST /posts/generate-daily ──────────────────────────────────────────────
export async function generateDailyPosts(req: AuthRequest, res: Response) {
  const childId = req.childId;
  if (!childId) {
    res.status(401).json({ error: 'Child authentication required' });
    return;
  }

  try {
    // Return early if already generated today
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const existing = await db('posts')
      .where({ child_id: childId, author_type: 'ai' })
      .where('created_at', '>=', startOfDay)
      .first();
    if (existing) {
      res.json({ message: 'Already generated today', generated: false });
      return;
    }

    const childRow = await db('children').where({ id: childId }).first();
    if (!childRow) { res.status(404).json({ error: 'Child not found' }); return; }

    const friendRows = await db('child_friends')
      .join('ai_friends', 'ai_friends.id', 'child_friends.friend_id')
      .where({ 'child_friends.child_id': childId, 'ai_friends.is_teacher': false })
      .select('ai_friends.*');

    if (friendRows.length === 0) {
      res.json({ message: 'No friends yet', posts: [], generated: false });
      return;
    }

    const memoryRows = await db('child_memories').where({ child_id: childId });
    const memoryBrief = memoryRows.length > 0 ? buildMemoryBrief(toMemoryType(memoryRows[0])) : null;

    const child   = toChildType(childRow);
    const friends = friendRows.map(toFriendType);
    const lang    = (childRow.language as string) || 'en';

    console.log(`[posts] 🤖 Calling Claude — generating ${friends.length} daily posts for child ${child.name} (lang=${lang})`);

    const result = await generateDailyPostsAI(friends, child, memoryBrief, lang);

    console.log(`[posts] ✅ ${result.posts.length} posts generated (${result.inputTokens}→${result.outputTokens} tokens)`);

    // Claude generates friendId as a name-slug — resolve back to the real DB UUID by matching on name.
    const friendByName = new Map(friends.map((f) => [f.name.toLowerCase(), f.id]));

    const saved = await Promise.all(
      result.posts.map((post) => {
        const authorId = friendByName.get(post.friendName.toLowerCase()) ?? post.friendId;
        return db('posts')
          .insert({
            child_id:     childId,
            author_id:    authorId,
            author_type:  'ai',
            content:      post.text,
            scene_emojis: post.sceneEmojis,
            mood:         post.mood,
          })
          .returning('*')
          .then((rows: Record<string, unknown>[]) => rows[0]);
      }),
    );

    res.json({ generated: true, posts: saved });
  } catch (err) {
    console.error('[posts] generateDailyPosts error:', err);
    res.status(500).json({ error: 'Failed to generate posts' });
  }
}

// ─── GET /posts/feed ─────────────────────────────────────────────────────────
export async function getFeed(req: AuthRequest, res: Response) {
  const childId = req.childId;
  if (!childId) {
    res.status(401).json({ error: 'Child authentication required' });
    return;
  }

  try {
    const posts = await db('posts')
      .leftJoin('ai_friends', 'ai_friends.id', 'posts.author_id')
      .where('posts.child_id', childId)
      .select(
        'posts.*',
        'ai_friends.name as friend_name',
        'ai_friends.cover_emojis as friend_cover_emojis',
      )
      .orderBy('posts.created_at', 'desc')
      .limit(20);

    const postIds = (posts as { id: string }[]).map((p) => p.id);
    const reactions = postIds.length
      ? await db('post_reactions')
          .whereIn('post_id', postIds)
          .groupBy('post_id', 'emoji')
          .select('post_id', 'emoji', db.raw('count(*)::int as count'))
      : [];

    const reactionMap: Record<string, Record<string, number>> = {};
    for (const r of reactions as { post_id: string; emoji: string; count: number }[]) {
      if (!reactionMap[r.post_id]) reactionMap[r.post_id] = {};
      reactionMap[r.post_id][r.emoji] = r.count;
    }

    const enriched = (posts as Record<string, unknown>[]).map((p) => ({
      ...p,
      reactions: reactionMap[p.id as string] || {},
    }));

    res.json({ posts: enriched });
  } catch (err) {
    console.error('[posts] getFeed error:', err);
    res.status(500).json({ error: 'Failed to fetch feed' });
  }
}

// ─── POST /posts ──────────────────────────────────────────────────────────────
export async function createPost(req: AuthRequest, res: Response) {
  const childId = req.childId;
  if (!childId) { res.status(401).json({ error: 'Child authentication required' }); return; }

  try {
    const { content, mood } = req.body as { content?: string; mood?: string };
    if (!content?.trim()) { res.status(400).json({ error: 'content is required' }); return; }

    const [post] = await db('posts')
      .insert({
        child_id: childId, author_id: childId, author_type: 'child',
        content: content.trim(), mood: mood || null,
      })
      .returning('*');

    res.status(201).json({ post });
  } catch (err) {
    console.error('[posts] createPost error:', err);
    res.status(500).json({ error: 'Failed to create post' });
  }
}

// ─── POST /posts/:postId/react ────────────────────────────────────────────────
export async function reactToPost(req: AuthRequest, res: Response) {
  const childId = req.childId;
  if (!childId) { res.status(401).json({ error: 'Child authentication required' }); return; }

  try {
    const { emoji } = req.body as { emoji?: string };
    if (!emoji) { res.status(400).json({ error: 'emoji is required' }); return; }

    const existing = await db('post_reactions')
      .where({ post_id: req.params.postId, child_id: childId, emoji })
      .first();

    if (existing) {
      await db('post_reactions').where({ post_id: req.params.postId, child_id: childId, emoji }).delete();
    } else {
      await db('post_reactions')
        .insert({ post_id: req.params.postId, child_id: childId, emoji })
        .onConflict(['post_id', 'child_id', 'emoji']).ignore();
    }

    const reactions = await db('post_reactions')
      .where({ post_id: req.params.postId })
      .groupBy('emoji')
      .select('emoji', db.raw('count(*)::int as count'));

    const reactionMap: Record<string, number> = {};
    for (const r of reactions as { emoji: string; count: number }[]) reactionMap[r.emoji] = r.count;

    res.json({ reactions: reactionMap, toggled: !existing });
  } catch (err) {
    console.error('[posts] reactToPost error:', err);
    res.status(500).json({ error: 'Failed to react to post' });
  }
}

// ─── Legacy parent-dashboard endpoints ───────────────────────────────────────
export async function getChildFeed(req: AuthRequest, res: Response) {
  try {
    const posts = await db('posts')
      .where({ child_id: req.params.childId })
      .orderBy('created_at', 'desc').limit(20);
    res.json({ posts });
  } catch { res.status(500).json({ error: 'Failed to fetch feed' }); }
}

export async function deletePost(req: AuthRequest, res: Response) {
  try {
    const post = await db('posts').where({ id: req.params.postId }).first();
    if (!post) { res.status(404).json({ error: 'Post not found' }); return; }
    await db('posts').where({ id: req.params.postId }).delete();
    res.json({ message: 'Post deleted' });
  } catch { res.status(500).json({ error: 'Failed to delete post' }); }
}

export async function likePost(req: AuthRequest, res: Response) {
  try {
    await db('posts').where({ id: req.params.postId }).increment('likes', 1);
    res.json({ message: 'Liked' });
  } catch { res.status(500).json({ error: 'Failed to like post' }); }
}
