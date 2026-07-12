import { Response } from 'express';
import db from '../db';
import { AuthRequest } from '../middleware/auth';

export async function getAlerts(req: AuthRequest, res: Response) {
  try {
    const childIds = await db('children').where({ parent_id: req.userId }).pluck('id');
    if (childIds.length === 0) { res.json({ alerts: [], unreadCount: 0 }); return; }

    const alerts = await db('parent_alerts')
      .join('children', 'children.id', 'parent_alerts.child_id')
      .whereIn('parent_alerts.child_id', childIds)
      .where('parent_alerts.read', false)
      .select(
        'parent_alerts.id',
        'parent_alerts.child_id',
        'parent_alerts.type',
        'parent_alerts.message',
        'parent_alerts.severity',
        'parent_alerts.read',
        'parent_alerts.created_at',
        'children.name as child_name',
      )
      .orderBy('parent_alerts.created_at', 'desc')
      .limit(50);

    res.json({ alerts, unreadCount: alerts.length });
  } catch (err) {
    console.error('[parent] getAlerts error:', err);
    res.status(500).json({ error: 'Failed to fetch alerts' });
  }
}

export async function markAlertRead(req: AuthRequest, res: Response) {
  try {
    await db('parent_alerts')
      .where({ id: req.params.alertId })
      .update({ read: true, read_at: db.fn.now() });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to update alert' });
  }
}

export async function markAllAlertsRead(req: AuthRequest, res: Response) {
  try {
    const childIds = await db('children').where({ parent_id: req.userId }).pluck('id');
    await db('parent_alerts').whereIn('child_id', childIds).update({ read: true });
    res.json({ message: 'All alerts marked as read' });
  } catch {
    res.status(500).json({ error: 'Failed to update alerts' });
  }
}

export async function getChildActivity(req: AuthRequest, res: Response) {
  try {
    const { childId } = req.params;
    const child = await db('children').where({ id: childId, parent_id: req.userId }).first();
    if (!child) {
      res.status(404).json({ error: 'Child not found' });
      return;
    }

    const [recentPosts, recentMessages, milestones] = await Promise.all([
      db('posts').where({ author_id: childId }).orderBy('created_at', 'desc').limit(10),
      db('messages').where({ sender_id: childId }).orderBy('created_at', 'desc').limit(20),
      db('child_memories').where({ child_id: childId }).select('milestones'),
    ]);

    res.json({ child, recentPosts, recentMessages, milestones });
  } catch {
    res.status(500).json({ error: 'Failed to fetch child activity' });
  }
}

// ─── GET /parent/children/:childId/posts ─────────────────────────────────────
export async function getChildPosts(req: AuthRequest, res: Response) {
  try {
    const { childId } = req.params;
    const child = await db('children').where({ id: childId, parent_id: req.userId }).first();
    if (!child) { res.status(404).json({ error: 'Child not found' }); return; }

    const posts = await db('posts')
      .where('posts.child_id', childId)
      .leftJoin('ai_friends', 'ai_friends.id', 'posts.author_id')
      .select(
        'posts.id', 'posts.content', 'posts.mood', 'posts.author_type',
        'posts.scene_emojis', 'posts.created_at',
        'ai_friends.name as friend_name',
      )
      .orderBy('posts.created_at', 'desc')
      .limit(10);

    res.json({ posts });
  } catch (err) {
    console.error('[parent] getChildPosts error:', err);
    res.status(500).json({ error: 'Failed to fetch posts' });
  }
}

// ─── GET /parent/children/:childId/messages ───────────────────────────────────
export async function getChildMessages(req: AuthRequest, res: Response) {
  try {
    const { childId } = req.params;
    const child = await db('children').where({ id: childId, parent_id: req.userId }).first();
    if (!child) { res.status(404).json({ error: 'Child not found' }); return; }

    const messages = await db('messages')
      .join('conversations', 'conversations.id', 'messages.conversation_id')
      .leftJoin('ai_friends', 'ai_friends.id', 'conversations.friend_id')
      .where('conversations.child_id', childId)
      .select(
        'messages.id', 'messages.sender_type', 'messages.content', 'messages.created_at',
        'ai_friends.name as friend_name',
      )
      .orderBy('messages.created_at', 'desc')
      .limit(20);

    res.json({ messages });
  } catch (err) {
    console.error('[parent] getChildMessages error:', err);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
}

// ─── GET /parent/children/:childId/stats ─────────────────────────────────────
export async function getChildStats(req: AuthRequest, res: Response) {
  try {
    const { childId } = req.params;
    const child = await db('children').where({ id: childId, parent_id: req.userId }).first();
    if (!child) { res.status(404).json({ error: 'Child not found' }); return; }

    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const today   = new Date(); today.setHours(0, 0, 0, 0);

    const [totalPosts, totalMessages, weekMoods, todayMessages, screenTimeToday, screenTimeWeek] = await Promise.all([
      db('posts').where({ child_id: childId, author_type: 'child' }).count('id as count').first(),
      db('messages')
        .join('conversations', 'conversations.id', 'messages.conversation_id')
        .where({ 'conversations.child_id': childId, 'messages.sender_type': 'child' })
        .count('messages.id as count').first(),
      db('posts')
        .where('child_id', childId)
        .where('created_at', '>=', weekAgo)
        .whereNotNull('mood')
        .select('mood'),
      db('messages')
        .join('conversations', 'conversations.id', 'messages.conversation_id')
        .where('conversations.child_id', childId)
        .where('messages.created_at', '>=', today)
        .count('messages.id as count').first(),
      db('child_sessions')
        .where({ child_id: childId })
        .where('date', '>=', today)
        .sum('duration_minutes as total')
        .first()
        .catch(() => ({ total: null })),
      db('child_sessions')
        .where({ child_id: childId })
        .where('date', '>=', weekAgo)
        .sum('duration_minutes as total')
        .first()
        .catch(() => ({ total: null })),
    ]);

    const moodCounts: Record<string, number> = {};
    for (const { mood } of weekMoods as { mood: string }[]) {
      moodCounts[mood] = (moodCounts[mood] ?? 0) + 1;
    }
    const topMood = Object.entries(moodCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'neutral';

    res.json({
      totalPosts:           Number((totalPosts as { count: string })?.count ?? 0),
      totalMessages:        Number((totalMessages as { count: string })?.count ?? 0),
      topMoodThisWeek:      topMood,
      messagesToday:        Number((todayMessages as { count: string })?.count ?? 0),
      screenTimeToday:      Math.round(Number((screenTimeToday as { total: string | null })?.total ?? 0)),
      screenTimeWeeklyAvg:  Math.round(Number((screenTimeWeek as { total: string | null })?.total ?? 0) / 7),
    });
  } catch (err) {
    console.error('[parent] getChildStats error:', err);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
}

export async function getWeeklyReport(req: AuthRequest, res: Response) {
  // TODO: aggregate weekly activity, mood trends, milestone progress
  res.json({ message: 'Weekly report — coming soon' });
}

// ─── GET /parent/timeline/:childId ───────────────────────────────────────────
export async function getTimeline(req: AuthRequest, res: Response) {
  try {
    const { childId } = req.params;
    const child = await db('children').where({ id: childId, parent_id: req.userId }).first();
    if (!child) { res.status(404).json({ error: 'Child not found' }); return; }

    const lang = (child.language as string) === 'fr' ? 'fr' : 'en';

    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [recentPosts, messageDays, recentBadges, newFriends] = await Promise.all([
      db('posts')
        .where({ child_id: childId, author_type: 'child' })
        .where('created_at', '>=', since)
        .select('content', 'mood', 'created_at')
        .orderBy('created_at', 'desc')
        .limit(20),

      db('messages')
        .join('conversations', 'conversations.id', 'messages.conversation_id')
        .where('conversations.child_id', childId)
        .where('messages.created_at', '>=', since)
        .where('messages.sender_type', 'child')
        .select(
          db.raw("date_trunc('day', messages.created_at) as day"),
          db.raw('count(*) as count'),
          db.raw('max(messages.created_at) as ts'),
        )
        .groupByRaw("date_trunc('day', messages.created_at)")
        .orderBy('ts', 'desc'),

      db('child_badges')
        .join('badge_definitions', 'badge_definitions.id', 'child_badges.badge_id')
        .where('child_badges.child_id', childId)
        .where('child_badges.earned_at', '>=', since)
        .select('badge_definitions.name', 'badge_definitions.name_fr', 'badge_definitions.icon', 'child_badges.earned_at')
        .orderBy('child_badges.earned_at', 'desc'),

      db('child_friends')
        .join('ai_friends', 'ai_friends.id', 'child_friends.friend_id')
        .where('child_friends.child_id', childId)
        .whereNotNull('child_friends.activated_at')
        .where('child_friends.activated_at', '>=', since)
        .select('ai_friends.name', 'child_friends.activated_at as created_at')
        .orderBy('child_friends.activated_at', 'desc'),
    ]);

    type Ev = { type: string; timestamp: string; summary: string; icon: string };
    const events: Ev[] = [];

    for (const p of recentPosts as Array<{ content: string; mood: string; created_at: string }>) {
      const c = String(p.content ?? '');
      const truncated = `${c.slice(0, 80)}${c.length > 80 ? '…' : ''}`;
      events.push({
        type: 'post', timestamp: p.created_at, icon: '📝',
        summary: lang === 'fr' ? `A publié : « ${truncated} »` : `Posted: "${truncated}"`,
      });
    }
    for (const d of messageDays as Array<{ count: string | number; ts: string }>) {
      const n = Number(d.count);
      events.push({
        type: 'messages', timestamp: d.ts, icon: '💬',
        summary: lang === 'fr'
          ? `A envoyé ${n} message${n !== 1 ? 's' : ''}`
          : `Sent ${n} message${n !== 1 ? 's' : ''}`,
      });
    }
    for (const b of recentBadges as Array<{ name: string; name_fr?: string; icon: string; earned_at: string }>) {
      const badgeName = lang === 'fr' ? (b.name_fr ?? b.name) : b.name;
      events.push({
        type: 'badge', timestamp: b.earned_at, icon: b.icon,
        summary: lang === 'fr' ? `A obtenu le badge : ${b.icon} ${badgeName}` : `Earned badge: ${b.icon} ${badgeName}`,
      });
    }
    for (const f of newFriends as Array<{ name: string; created_at: string }>) {
      events.push({
        type: 'friend', timestamp: f.created_at, icon: '👥',
        summary: lang === 'fr' ? `Nouvel ami : ${f.name}` : `Made a new friend: ${f.name}`,
      });
    }

    events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    res.json({ events: events.slice(0, 50) });
  } catch (err) {
    console.error('[parent] getTimeline error:', err);
    res.status(500).json({ error: 'Failed to fetch timeline' });
  }
}

// ─── GET /parent/mood/:childId ────────────────────────────────────────────────
export async function getMoodHistory(req: AuthRequest, res: Response) {
  try {
    const { childId } = req.params;
    const child = await db('children').where({ id: childId, parent_id: req.userId }).first();
    if (!child) { res.status(404).json({ error: 'Child not found' }); return; }

    const since       = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(Date.now() -  7 * 24 * 60 * 60 * 1000);

    const [moodRows, crisisRow] = await Promise.all([
      db('posts')
        .where({ child_id: childId })
        .whereNotNull('mood')
        .where('created_at', '>=', since)
        .select(db.raw("date_trunc('day', created_at) as day"), 'mood', db.raw('count(*) as count'))
        .groupByRaw("date_trunc('day', created_at), mood")
        .orderByRaw('day ASC'),
      db('parent_alerts')
        .where({ child_id: childId })
        .where('type', 'crisis')
        .where('created_at', '>=', sevenDaysAgo)
        .count('id as count')
        .first(),
    ]);

    const dayMap: Record<string, Array<{ mood: string; count: number }>> = {};
    for (const row of moodRows as Array<{ day: string; mood: string; count: string | number }>) {
      const key = new Date(row.day).toISOString().split('T')[0];
      (dayMap[key] ??= []).push({ mood: row.mood, count: Number(row.count) });
    }

    const MOOD_INTENSITY: Record<string, number> = {
      excited: 1.0, happy: 0.9, funny: 0.85, caring: 0.8, curious: 0.7,
      neutral: 0.5, lonely: 0.35, sad: 0.3, worried: 0.2, angry: 0.15,
    };

    const moodHistory = Object.entries(dayMap).map(([date, moods]) => {
      const top   = moods.reduce((a, b) => b.count > a.count ? b : a);
      const total = moods.reduce((s, m) => s + m.count, 0);
      return { date, mood: top.mood, intensity: MOOD_INTENSITY[top.mood] ?? 0.5, note: `${top.count} of ${total} post${total !== 1 ? 's' : ''}` };
    }).sort((a, b) => a.date.localeCompare(b.date));

    const hasCrisisFlag = Number((crisisRow as { count: string | number } | undefined)?.count ?? 0) > 0;
    res.json({ moodHistory, hasCrisisFlag });
  } catch (err) {
    console.error('[parent] getMoodHistory error:', err);
    res.status(500).json({ error: 'Failed to fetch mood history' });
  }
}

// ─── GET /parent/friends/:childId ─────────────────────────────────────────────
export async function getParentFriends(req: AuthRequest, res: Response) {
  try {
    const { childId } = req.params;
    const child = await db('children').where({ id: childId, parent_id: req.userId }).first();
    if (!child) { res.status(404).json({ error: 'Child not found' }); return; }

    const friends = await db('child_friends')
      .join('ai_friends', 'ai_friends.id', 'child_friends.friend_id')
      .where('child_friends.child_id', childId)
      .select(
        'ai_friends.id', 'ai_friends.name', 'ai_friends.avatar_url',
        'ai_friends.cover_emojis', 'ai_friends.is_teacher',
        'child_friends.friendship_level', 'child_friends.friendship_xp',
        'child_friends.activated_at',
      )
      .orderBy('child_friends.friendship_level', 'desc');

    const convStats = await db('conversations')
      .leftJoin(
        db('messages')
          .select('conversation_id', db.raw('count(*) as msg_count'), db.raw('max(created_at) as last_active'))
          .where('sender_type', 'child')
          .groupBy('conversation_id')
          .as('mc'),
        'mc.conversation_id', 'conversations.id',
      )
      .where('conversations.child_id', childId)
      .select('conversations.friend_id', 'mc.msg_count', 'mc.last_active');

    const statsMap: Record<string, { message_count: number; last_active: string | null }> = {};
    for (const s of convStats as Array<{ friend_id: string; msg_count: string | null; last_active: string | null }>) {
      statsMap[s.friend_id] = { message_count: Number(s.msg_count ?? 0), last_active: s.last_active };
    }

    const enriched = (friends as Array<Record<string, unknown>>).map((f) => ({
      ...f,
      message_count: statsMap[f.id as string]?.message_count ?? 0,
      last_active:   statsMap[f.id as string]?.last_active   ?? null,
    }));

    res.json({ friends: enriched });
  } catch (err) {
    console.error('[parent] getParentFriends error:', err);
    res.status(500).json({ error: 'Failed to fetch friends' });
  }
}

// ─── GET /parent/badges/:childId ──────────────────────────────────────────────
export async function getParentBadges(req: AuthRequest, res: Response) {
  try {
    const { childId } = req.params;
    const child = await db('children').where({ id: childId, parent_id: req.userId }).first();
    if (!child) { res.status(404).json({ error: 'Child not found' }); return; }

    const lang = (child.language as string) === 'fr' ? 'fr' : 'en';

    const [allBadges, childBadgeRows] = await Promise.all([
      db('badge_definitions')
        .select('id', 'name', 'name_fr', 'description', 'description_fr', 'icon', 'category', 'xp_required')
        .orderBy('category').orderBy('name'),
      db('child_badges').where({ child_id: childId }).select('badge_id', 'earned_at'),
    ]);

    const earnedMap: Record<string, string> = {};
    for (const b of childBadgeRows as Array<{ badge_id: string; earned_at: string }>) {
      earnedMap[b.badge_id] = b.earned_at;
    }

    const localized = (allBadges as Array<Record<string, unknown>>).map((b) => ({
      ...b,
      name:        lang === 'fr' ? (b.name_fr ?? b.name) : b.name,
      description: lang === 'fr' ? (b.description_fr ?? b.description) : b.description,
    })) as Array<Record<string, unknown>>;

    const earned = localized
      .filter((b) => earnedMap[b.id as string])
      .map((b)  => ({ ...b, earned_at: earnedMap[b.id as string] }));

    const locked = localized.filter((b) => !earnedMap[b.id as string]);

    res.json({ earned, locked, totalXp: earned.reduce((s, b) => s + Number((b as Record<string, unknown>).xp_required ?? 10), 0) });
  } catch (err) {
    console.error('[parent] getParentBadges error:', err);
    res.status(500).json({ error: 'Failed to fetch badges' });
  }
}

// ─── GET /parent/alerts/:childId ──────────────────────────────────────────────
export async function getChildAlerts(req: AuthRequest, res: Response) {
  try {
    const { childId } = req.params;
    const child = await db('children').where({ id: childId, parent_id: req.userId }).first();
    if (!child) { res.status(404).json({ error: 'Child not found' }); return; }

    const alerts = await db('parent_alerts')
      .where({ child_id: childId })
      .orderBy('created_at', 'desc')
      .limit(30)
      .select('id', 'type', 'message', 'severity', 'read', 'created_at');

    res.json({ alerts, child: { name: child.name } });
  } catch (err) {
    console.error('[parent] getChildAlerts error:', err);
    res.status(500).json({ error: 'Failed to fetch child alerts' });
  }
}

// ─── PATCH /parent/children/:childId/screen-time ─────────────────────────────
export async function updateChildScreenTime(req: AuthRequest, res: Response) {
  try {
    const { childId } = req.params;
    const child = await db('children')
      .where({ id: childId, parent_id: req.userId })
      .select('*', db.raw('screen_time_extension_date::text as screen_time_extension_date'))
      .first();
    if (!child) { res.status(404).json({ error: 'Child not found' }); return; }

    const { weekdayLimitMinutes, weekendLimitMinutes, extensionMinutes } = req.body as {
      weekdayLimitMinutes?: number | null;
      weekendLimitMinutes?: number | null;
      extensionMinutes?: number;
    };

    const updates: Record<string, unknown> = { updated_at: db.fn.now() };

    if (weekdayLimitMinutes !== undefined) {
      updates.screen_time_limit_weekday_minutes = weekdayLimitMinutes;
    }
    if (weekendLimitMinutes !== undefined) {
      updates.screen_time_limit_weekend_minutes = weekendLimitMinutes;
    }
    if (extensionMinutes !== undefined) {
      if (extensionMinutes > 0) {
        if (extensionMinutes % 5 !== 0 || extensionMinutes > 120) {
          res.status(400).json({ error: 'extensionMinutes must be a multiple of 5 and at most 120' });
          return;
        }
        const todayResult = await db.raw('SELECT CURRENT_DATE::text as today');
        const todayStr = todayResult.rows[0].today as string;
        const existingDate = child.screen_time_extension_date as string | null;
        const existingMinutes = Number(child.screen_time_extension_minutes ?? 0);

        if (existingDate === todayStr && existingMinutes > 0) {
          const newTotal = Math.min(existingMinutes + extensionMinutes, 120);
          updates.screen_time_extension_minutes = newTotal;
        } else {
          updates.screen_time_extension_minutes = extensionMinutes;
        }
        updates.screen_time_extension_date = todayStr;
      } else {
        updates.screen_time_extension_minutes = 0;
        updates.screen_time_extension_date    = null;
      }
    }

    const [updated] = await db('children').where({ id: childId }).update(updates).returning('*');
    res.json({ success: true, child: updated });
  } catch (err) {
    console.error('[parent] updateChildScreenTime error:', err);
    res.status(500).json({ error: 'Failed to update screen time settings' });
  }
}

export async function updateSettings(req: AuthRequest, res: Response) {
  try {
    const allowed = ['alertsEnabled', 'weeklyReportEnabled', 'contentFilterLevel',
      'screenTimeLimitMinutes', 'bedtimeLockEnabled', 'bedtimeLockStart', 'bedtimeLockEnd'];
    const updates: Record<string, unknown> = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }

    await db('users')
      .where({ id: req.userId })
      .update({ settings: db.raw('settings || ?::jsonb', [JSON.stringify(updates)]) });

    res.json({ message: 'Settings updated' });
  } catch {
    res.status(500).json({ error: 'Failed to update settings' });
  }
}
