import { Request, Response } from 'express';
import db from '../db';
import { AuthRequest } from '../middleware/auth';
import {
  generateDailyPosts as generateDailyPostsAI,
  generatePostComment,
  buildMemoryBrief,
} from '../services/ai.service';
import { toChildType, toFriendType, toMemoryType } from '../utils/db-mappers';
import { generatePostImage, cartoonifyScenePhoto } from '../services/avatar.service';
import { checkBadgesForChild } from './badges.controller';
import { runDailyPostsJob } from '../jobs/dailyPosts';

function firstEmoji(str: string | null | undefined): string {
  if (!str) return '🌟';
  return [...str][0] ?? '🌟';
}

// ─── POST /posts/dev-trigger-daily (dev only) ────────────────────────────────
export async function devTriggerDailyPosts(req: Request, res: Response) {
  if (process.env.NODE_ENV !== 'development') {
    res.status(403).json({ error: 'This endpoint is only available in development' });
    return;
  }
  res.json({ success: true, message: 'Daily post job triggered' });
  setImmediate(async () => {
    try {
      await runDailyPostsJob();
      console.log('[posts] ✅ Manual trigger of daily post job complete');
    } catch (err) {
      console.error('[posts] ❌ Manual trigger of daily post job failed:', err);
    }
  });
}

// ─── POST /posts/generate-daily ──────────────────────────────────────────────
export async function generateDailyPosts(req: AuthRequest, res: Response) {
  const childId = req.childId;
  if (!childId) {
    res.status(401).json({ error: 'Child authentication required' });
    return;
  }

  try {
    const force = req.query.force === 'true';

    // Return early if already generated today (skip guard when force=true)
    if (!force) {
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

    const saved: Record<string, unknown>[] = [];
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

      const [insertedPost] = await db('posts')
        .insert({
          child_id:     childId,
          author_id:    authorId,
          author_type:  'ai',
          content:      post.text,
          scene_emojis: post.sceneEmojis,
          mood:         post.mood,
          image_url:    imageUrl,
        })
        .returning('*');

      saved.push(insertedPost as Record<string, unknown>);
      console.log(`[posts] ✅ Post saved for ${post.friendName}`);
    }

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
      .where((qb) => {
        qb.where('posts.child_id', childId)
          .orWhere((qb2) => {
            qb2.whereNull('posts.child_id')
              .whereExists(function () {
                this.select('*').from('child_friends')
                  .whereRaw('child_friends.friend_id = posts.author_id')
                  .andWhere('child_friends.child_id', childId);
              });
          });
      })
      .select(
        'posts.*',
        'posts.image_url',
        'ai_friends.name as friend_name',
        'ai_friends.cover_emojis as friend_cover_emojis',
        'ai_friends.avatar_url as friend_avatar_url',
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

    // Fetch comments for all posts
    const commentRows = postIds.length
      ? await db('post_comments as pc')
          .leftJoin('ai_friends as af', 'af.id', 'pc.author_id')
          .leftJoin('children as ch', 'ch.id', 'pc.author_id')
          .whereIn('pc.post_id', postIds)
          .select(
            'pc.post_id', 'pc.content', 'pc.author_type',
            'pc.created_at as comment_at',
            db.raw("COALESCE(af.name, ch.name) as author_name"),
            db.raw("COALESCE(af.cover_emojis, '😊') as author_emojis"),
            'af.avatar_url as author_avatar_url',
          )
          .orderBy('pc.created_at', 'asc')
      : [];

    const commentsMap: Record<string, Array<{ authorName: string; authorEmoji: string; authorAvatarUrl: string | null; content: string; createdAt: string }>> = {};
    for (const c of commentRows as Record<string, unknown>[]) {
      const pid = c.post_id as string;
      if (!commentsMap[pid]) commentsMap[pid] = [];
      commentsMap[pid].push({
        authorName:     String(c.author_name ?? ''),
        authorEmoji:    firstEmoji(c.author_emojis ? String(c.author_emojis) : null),
        authorAvatarUrl: (c.author_avatar_url as string | null) ?? null,
        content:        String(c.content ?? ''),
        createdAt:      String(c.comment_at ?? ''),
      });
    }

    const enriched = (posts as Record<string, unknown>[]).map((p) => ({
      ...p,
      reactions: reactionMap[p.id as string] || {},
      comments:  commentsMap[p.id as string] || [],
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

    checkBadgesForChild(childId, 'first_post').catch(console.error);
    checkBadgesForChild(childId, 'total_posts').catch(console.error);

    // Schedule friend comments (non-blocking — response already sent)
    const postId      = String((post as Record<string, unknown>).id);
    const postContent = content.trim();
    const childIdStr  = childId;
    const isDev       = process.env.NODE_ENV === 'development';

    setTimeout(() => void (async () => {
      try {
        const childRow = await db('children').where({ id: childIdStr }).first();
        if (!childRow) return;

        const friendRows = await db('child_friends')
          .join('ai_friends', 'ai_friends.id', 'child_friends.friend_id')
          .where({ 'child_friends.child_id': childIdStr, 'ai_friends.is_teacher': false })
          .select('ai_friends.*') as Record<string, unknown>[];

        if (!friendRows.length) return;

        const child   = toChildType(childRow);
        const lang    = (childRow.language as string) || 'en';
        const shuffled = [...friendRows].sort(() => Math.random() - 0.5);
        const commenters = shuffled.filter(() => Math.random() < 0.6).slice(0, 2);
        const delays = isDev
          ? [5000 + Math.random() * 10000, 15000 + Math.random() * 5000]
          : [30000 + Math.random() * 90000, 60000 + Math.random() * 120000];

        for (let i = 0; i < commenters.length; i++) {
          const fr     = commenters[i];
          const friend = toFriendType(fr);
          await new Promise((r) => setTimeout(r, delays[i]));

          console.log(`[posts] 💬 Generating comment from ${friend.name}...`);
          const memoryRow  = await db('child_memories').where({ child_id: childIdStr, friend_id: String(fr.id) }).first();
          const memoryBrief = memoryRow ? buildMemoryBrief(toMemoryType(memoryRow)) : null;

          const comment = await generatePostComment(friend, child, postContent, memoryBrief, lang);
          await db('post_comments').insert({
            post_id:     postId,
            author_id:   String(fr.id),
            author_type: 'ai',
            content:     comment.text,
          });
          console.log(`[posts] ✅ Comment saved from ${friend.name}`);
        }
      } catch (err) {
        console.error('[posts] comment generation failed:', err);
      }
    })(), 500);

  } catch (err) {
    console.error('[posts] createPost error:', err);
    res.status(500).json({ error: 'Failed to create post' });
  }
}

// ─── POST /posts/photo ───────────────────────────────────────────────────────
export async function createPhotoPost(req: AuthRequest, res: Response) {
  const childId = req.childId;
  if (!childId) { res.status(401).json({ error: 'Child authentication required' }); return; }

  try {
    const { photoBase64, photoMediaType, content } = req.body as {
      photoBase64?: string;
      photoMediaType?: string;
      content?: string;
    };

    if (!photoBase64?.trim()) {
      res.status(400).json({ error: 'photoBase64 is required' });
      return;
    }

    const result = await cartoonifyScenePhoto(
      photoBase64,
      photoMediaType ?? 'image/jpeg',
    );

    if (!result) {
      res.status(422).json({
        error: 'photo_rejected',
        message: 'Photos with people are not allowed. Try a photo of a place, animal, food, or object!',
        message_fr: 'Les photos avec des personnes ne sont pas autorisées. Essaie une photo d\'un endroit, d\'un animal, d\'un repas ou d\'un objet !',
      });
      return;
    }

    const postContent = content?.trim() || result.sceneDescription;

    const [post] = await db('posts')
      .insert({
        child_id:    childId,
        author_id:   childId,
        author_type: 'child',
        content:     postContent,
        image_url:   result.cartoonUrl,
        media_type:  'photo',
      })
      .returning('*');

    res.status(201).json({ post });

    checkBadgesForChild(childId, 'first_post').catch(console.error);
    checkBadgesForChild(childId, 'total_posts').catch(console.error);

    const postId     = String((post as Record<string, unknown>).id);
    const childIdStr = childId;
    const isDev      = process.env.NODE_ENV === 'development';

    setTimeout(() => void (async () => {
      try {
        const childRow = await db('children').where({ id: childIdStr }).first();
        if (!childRow) return;

        const friendRows = await db('child_friends')
          .join('ai_friends', 'ai_friends.id', 'child_friends.friend_id')
          .where({ 'child_friends.child_id': childIdStr, 'ai_friends.is_teacher': false })
          .select('ai_friends.*') as Record<string, unknown>[];

        if (!friendRows.length) return;

        const child    = toChildType(childRow);
        const lang     = (childRow.language as string) || 'en';
        const shuffled = [...friendRows].sort(() => Math.random() - 0.5);
        const commenters = shuffled.filter(() => Math.random() < 0.6).slice(0, 2);
        const delays = isDev
          ? [5000 + Math.random() * 10000, 15000 + Math.random() * 5000]
          : [30000 + Math.random() * 90000, 60000 + Math.random() * 120000];

        for (let i = 0; i < commenters.length; i++) {
          const fr     = commenters[i];
          const friend = toFriendType(fr);
          await new Promise((r) => setTimeout(r, delays[i]));
          const memoryRow   = await db('child_memories').where({ child_id: childIdStr, friend_id: String(fr.id) }).first();
          const memoryBrief = memoryRow ? buildMemoryBrief(toMemoryType(memoryRow)) : null;
          const comment = await generatePostComment(friend, child, postContent, memoryBrief, lang);
          await db('post_comments').insert({
            post_id:     postId,
            author_id:   String(fr.id),
            author_type: 'ai',
            content:     comment.text,
          });
          console.log(`[posts] ✅ Photo post comment from ${friend.name}`);
        }
      } catch (err) {
        console.error('[posts] photo post comment error:', err);
      }
    })(), 500);

  } catch (err) {
    console.error('[posts] createPhotoPost error:', err);
    res.status(500).json({ error: 'Failed to create photo post' });
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

    if (!existing) {
      checkBadgesForChild(childId, 'total_reactions').catch(console.error);
    }

    res.json({ reactions: reactionMap, toggled: !existing });
  } catch (err) {
    console.error('[posts] reactToPost error:', err);
    res.status(500).json({ error: 'Failed to react to post' });
  }
}

// ─── GET /posts/:postId/comments ─────────────────────────────────────────────
export async function getPostComments(req: AuthRequest, res: Response) {
  const childId = req.childId;
  if (!childId) { res.status(401).json({ error: 'Child authentication required' }); return; }

  try {
    const post = await db('posts')
      .where('id', req.params.postId)
      .where((qb) => {
        qb.where('child_id', childId)
          .orWhere((qb2) => {
            qb2.whereNull('child_id')
              .whereExists(function () {
                this.select('*').from('child_friends')
                  .whereRaw('child_friends.friend_id = posts.author_id')
                  .andWhere('child_friends.child_id', childId);
              });
          });
      })
      .first();
    if (!post) { res.status(404).json({ error: 'Post not found' }); return; }

    const commentRows = await db('post_comments as pc')
      .leftJoin('ai_friends as af', 'af.id', 'pc.author_id')
      .leftJoin('children as ch', 'ch.id', 'pc.author_id')
      .where('pc.post_id', req.params.postId)
      .where((qb) => qb.where('pc.child_id', childId).orWhereNull('pc.child_id'))
      .select(
        'pc.content', 'pc.author_type',
        'pc.created_at as comment_at',
        db.raw("COALESCE(af.name, ch.name) as author_name"),
        db.raw("COALESCE(af.cover_emojis, '😊') as author_emojis"),
        'af.avatar_url as author_avatar_url',
      )
      .orderBy('pc.created_at', 'asc');

    const comments = (commentRows as Record<string, unknown>[]).map((c) => ({
      authorName:     String(c.author_name ?? ''),
      authorEmoji:    firstEmoji(c.author_emojis ? String(c.author_emojis) : null),
      authorAvatarUrl: (c.author_avatar_url as string | null) ?? null,
      content:        String(c.content ?? ''),
      createdAt:      String(c.comment_at ?? ''),
    }));

    res.json({ comments });
  } catch (err) {
    console.error('[posts] getPostComments error:', err);
    res.status(500).json({ error: 'Failed to fetch comments' });
  }
}

// ─── POST /posts/:postId/comments ────────────────────────────────────────────
export async function addComment(req: AuthRequest, res: Response) {
  const childId = req.childId;
  if (!childId) { res.status(401).json({ error: 'Child authentication required' }); return; }

  try {
    const { text } = req.body as { text?: string };
    if (!text?.trim()) { res.status(400).json({ error: 'text is required' }); return; }

    const post = await db('posts')
      .where('id', req.params.postId)
      .where((qb) => {
        qb.where('child_id', childId)
          .orWhere((qb2) => {
            qb2.whereNull('child_id')
              .whereExists(function () {
                this.select('*').from('child_friends')
                  .whereRaw('child_friends.friend_id = posts.author_id')
                  .andWhere('child_friends.child_id', childId);
              });
          });
      })
      .first();
    if (!post) { res.status(404).json({ error: 'Post not found' }); return; }

    const [comment] = await db('post_comments')
      .insert({ post_id: req.params.postId, author_id: childId, author_type: 'child', content: text.trim(), child_id: childId })
      .returning('*');

    res.status(201).json({ comment });

    // If the post belongs to an AI friend, have them reply to the child's comment
    if ((post as Record<string, unknown>).author_type === 'ai') {
      const friendId    = String((post as Record<string, unknown>).author_id);
      const postId      = req.params.postId;
      const commentText = text.trim();
      const childIdStr  = childId;
      const isDev       = process.env.NODE_ENV === 'development';
      const delay       = isDev
        ? 3000  + Math.random() * 5000
        : 5000  + Math.random() * 3000;

      setTimeout(() => void (async () => {
        try {
          const [childRow, friendRow] = await Promise.all([
            db('children').where({ id: childIdStr }).first(),
            db('ai_friends').where({ id: friendId }).first(),
          ]);
          if (!childRow || !friendRow) return;

          const child   = toChildType(childRow);
          const friend  = toFriendType(friendRow);
          const lang    = (childRow.language as string) || 'en';

          const memoryRow   = await db('child_memories').where({ child_id: childIdStr, friend_id: friendId }).first();
          const memoryBrief = memoryRow ? buildMemoryBrief(toMemoryType(memoryRow)) : null;

          const reply = await generatePostComment(friend, child, commentText, memoryBrief, lang);
          await db('post_comments').insert({
            post_id:     postId,
            author_id:   friendId,
            author_type: 'ai',
            content:     reply.text,
          });
        } catch (err) {
          console.error('[posts] AI reply comment failed:', err);
        }
      })(), delay);
    }
  } catch (err) {
    console.error('[posts] addComment error:', err);
    res.status(500).json({ error: 'Failed to add comment' });
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
