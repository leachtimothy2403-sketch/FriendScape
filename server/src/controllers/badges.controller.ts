import { Response } from 'express';
import db from '../db';
import { AuthRequest } from '../middleware/auth';
import { sendMigaDM } from '../services/migaDM';

// ── Progress helpers ──────────────────────────────────────────────────────────

async function fetchAllProgress(childId: string): Promise<Record<string, number>> {
  const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);

  const [
    postCount,
    encouragingCount,
    consecutiveRaw,
    tutorCount,
    friendsCount,
    totalMessages,
    totalPosts,
    totalReactions,
  ] = await Promise.all([
    // first_post / total_posts
    db('posts').where({ child_id: childId, author_type: 'child' }).count('id as count').first(),

    // encouraging_messages
    db('messages')
      .join('conversations', 'conversations.id', 'messages.conversation_id')
      .where('conversations.child_id', childId)
      .where('messages.sender_type', 'child')
      .whereRaw(
        "messages.content ILIKE ANY(ARRAY['%good%','%great%','%amazing%','%love%','%awesome%','%proud%','%bien%','%super%','%g\\u00e9nial%','%bravo%','%incroyable%'])",
      )
      .count('messages.id as count')
      .first(),

    // consecutive_posts: distinct post days in last 5 days
    db.raw<{ rows: { cnt: string }[] }>(
      `SELECT COUNT(DISTINCT DATE(created_at)) AS cnt FROM posts WHERE child_id = ? AND author_type = 'child' AND created_at >= ?`,
      [childId, fiveDaysAgo],
    ),

    // tutor_sessions: child messages to teacher friends
    db('messages')
      .join('conversations', 'conversations.id', 'messages.conversation_id')
      .join('ai_friends', 'ai_friends.id', 'conversations.friend_id')
      .where('conversations.child_id', childId)
      .where('messages.sender_type', 'child')
      .where('ai_friends.is_teacher', true)
      .count('messages.id as count')
      .first(),

    // friends_added
    db('child_friends').where({ child_id: childId }).count('friend_id as count').first(),

    // total_messages: all child messages
    db('messages')
      .join('conversations', 'conversations.id', 'messages.conversation_id')
      .where('conversations.child_id', childId)
      .where('messages.sender_type', 'child')
      .count('messages.id as count')
      .first(),

    // total_posts (same as postCount)
    db('posts').where({ child_id: childId, author_type: 'child' }).count('id as count').first(),

    // total_reactions
    db('post_reactions').where({ child_id: childId }).count('id as count').first(),
  ]);

  const n = (v: unknown) => Number((v as { count?: string })?.count ?? 0);
  const consecutiveDays = Number(consecutiveRaw.rows[0]?.cnt ?? 0);

  return {
    first_post:            n(postCount),
    encouraging_messages:  n(encouragingCount),
    consecutive_posts:     consecutiveDays,
    tutor_sessions:        n(tutorCount),
    friends_added:         n(friendsCount),
    total_messages:        n(totalMessages),
    total_posts:           n(totalPosts),
    total_reactions:       n(totalReactions),
    graduation:            0,  // resolved via /children/me/graduation
  };
}

// ── GET /api/badges ───────────────────────────────────────────────────────────
export async function getBadges(req: AuthRequest, res: Response) {
  const childId = req.childId;
  if (!childId) { res.status(401).json({ error: 'Child authentication required' }); return; }

  try {
    const childRow = await db('children').where({ id: childId }).first();
    const lang = (childRow?.language as string) === 'fr' ? 'fr' : 'en';

    const [definitions, earned, progress] = await Promise.all([
      db('badge_definitions').select('*').orderBy('category').orderBy('name'),
      db('child_badges').where({ child_id: childId }).select('badge_id', 'earned_at'),
      fetchAllProgress(childId),
    ]);

    const earnedMap = new Map(
      (earned as { badge_id: string; earned_at: string }[]).map(e => [e.badge_id, e.earned_at]),
    );

    const badges = (definitions as Record<string, unknown>[]).map(def => ({
      id:                def.id,
      name:              def.name,
      description:       def.description,
      icon:              def.icon,
      category:          def.category,
      trigger_type:      def.trigger_type,
      xp_required:       def.xp_required,
      lumi_message:      lang === 'fr'
        ? (def.lumi_message_fr ?? def.lumi_message)
        : def.lumi_message,
      earned:            earnedMap.has(def.id as string),
      earned_at:         earnedMap.get(def.id as string) ?? null,
      progress:          progress[def.trigger_type as string] ?? 0,
      progress_required: def.xp_required,
    }));

    res.json({ badges });
  } catch (err) {
    console.error('[badges] getBadges error:', err);
    res.status(500).json({ error: 'Failed to fetch badges' });
  }
}

// ── POST /api/badges/check ────────────────────────────────────────────────────
export async function checkBadges(req: AuthRequest, res: Response) {
  const childId = req.childId;
  if (!childId) { res.status(401).json({ error: 'Child authentication required' }); return; }

  try {
    const { trigger, value } = req.body as { trigger?: string; value?: number };
    if (!trigger) { res.status(400).json({ error: 'trigger is required' }); return; }

    const val = Number(value ?? 0);

    const childRow = await db('children').where({ id: childId }).first();
    const lang = (childRow?.language as string) === 'fr' ? 'fr' : 'en';

    const earnedBadgeIds = await db('child_badges')
      .where({ child_id: childId })
      .pluck('badge_id') as string[];

    const candidates = await db('badge_definitions')
      .where({ trigger_type: trigger })
      .whereNotIn('id', earnedBadgeIds.length ? earnedBadgeIds : ['00000000-0000-0000-0000-000000000000'])
      .select('*') as Record<string, unknown>[];

    const newBadges: Record<string, unknown>[] = [];

    for (const badge of candidates) {
      const threshold = badge.xp_required as number | null;
      if (threshold !== null && val < threshold) continue;

      await db('child_badges')
        .insert({ child_id: childId, badge_id: badge.id as string })
        .onConflict(['child_id', 'badge_id'])
        .ignore();

      const lumiMsg = lang === 'fr'
        ? (badge.lumi_message_fr ?? badge.lumi_message) as string | null
        : badge.lumi_message as string | null;

      // Save parent alert
      await db('parent_alerts').insert({
        child_id: childId,
        type:     'milestone',
        message:  `${String(childRow?.name ?? 'Your child')} earned the "${badge.name as string}" badge! ${badge.icon as string}`,
        severity: 'info',
      }).catch((e: unknown) => console.error('[badges] alert insert failed:', e));

      // Send Miga DM with celebration message
      if (lumiMsg) {
        await sendMigaDM(childId, lumiMsg)
          .catch((e: unknown) => console.error('[badges] Miga DM failed:', e));
      }

      newBadges.push({
        ...badge,
        lumi_message: lumiMsg,
        earned:       true,
        earned_at:    new Date().toISOString(),
      });

      console.log(`[badges] 🏅 ${String(childRow?.name ?? childId)} earned "${badge.name as string}" ${badge.icon as string}`);
    }

    res.json({ newBadges });
  } catch (err) {
    console.error('[badges] checkBadges error:', err);
    res.status(500).json({ error: 'Failed to check badges' });
  }
}

// ── Internal helper — fire-and-forget badge check after key actions ───────────
export async function checkBadgesForChild(childId: string, trigger: string): Promise<void> {
  try {
    const childRow = await db('children').where({ id: childId }).first();
    const lang = (childRow?.language as string) === 'fr' ? 'fr' : 'en';

    const progress = await fetchAllProgress(childId);
    const val = progress[trigger] ?? 0;

    const earnedBadgeIds = await db('child_badges')
      .where({ child_id: childId })
      .pluck('badge_id') as string[];

    const candidates = await db('badge_definitions')
      .where({ trigger_type: trigger })
      .whereNotIn('id', earnedBadgeIds.length ? earnedBadgeIds : ['00000000-0000-0000-0000-000000000000'])
      .select('*') as Record<string, unknown>[];

    for (const badge of candidates) {
      const threshold = badge.xp_required as number | null;
      if (threshold !== null && val < threshold) continue;

      await db('child_badges')
        .insert({ child_id: childId, badge_id: badge.id as string })
        .onConflict(['child_id', 'badge_id'])
        .ignore();

      const lumiMsg = lang === 'fr'
        ? (badge.lumi_message_fr ?? badge.lumi_message) as string | null
        : badge.lumi_message as string | null;

      await db('parent_alerts').insert({
        child_id: childId,
        type:     'milestone',
        message:  `${String(childRow?.name ?? 'Your child')} earned the "${badge.name as string}" badge! ${badge.icon as string}`,
        severity: 'info',
      }).catch((e: unknown) => console.error('[badges] alert insert failed:', e));

      if (lumiMsg) {
        await sendMigaDM(childId, lumiMsg)
          .catch((e: unknown) => console.error('[badges] Miga DM failed:', e));
      }

      console.log(`[badges] 🏅 ${String(childRow?.name ?? childId)} earned "${badge.name as string}" ${badge.icon as string}`);
    }
  } catch (err) {
    console.error('[badges] checkBadgesForChild error:', err);
  }
}
