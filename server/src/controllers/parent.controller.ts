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
