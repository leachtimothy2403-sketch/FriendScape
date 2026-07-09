import { Response, Request } from 'express';
import db from '../db';
import { AuthRequest } from '../middleware/auth';

interface NotificationRow {
  id: string;
  type: 'dm' | 'comment' | 'badge';
  friendId: string | null;
  friendName: string;
  friendEmoji: string;
  friendAvatarUrl: string | null;
  preview: string;
  createdAt: string;
  read: boolean;
}

export async function getNotifications(req: AuthRequest, res: Response) {
  const childId = req.childId;
  if (!childId) {
    res.status(401).json({ error: 'Child auth required' });
    return;
  }

  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const [dmRows, commentRows, badgeRows] = await Promise.all([
      db('messages as m')
        .join('conversations as c', 'm.conversation_id', 'c.id')
        .join('ai_friends as af', 'c.friend_id', 'af.id')
        .where('c.child_id', childId)
        .where('m.sender_type', 'ai')
        .where('m.created_at', '>=', since)
        .whereRaw('(m.read IS NOT TRUE)')
        .select(
          'm.id',
          'm.content',
          'm.created_at',
          'm.read',
          'af.id as friend_id',
          'af.name as friend_name',
          'af.cover_emojis as friend_emoji',
          'af.avatar_url as friend_avatar_url',
        )
        .orderBy('m.created_at', 'desc')
        .limit(20),

      db('post_comments as pc')
        .join('posts as p', 'pc.post_id', 'p.id')
        .join('ai_friends as af', 'pc.author_id', 'af.id')
        .where('p.author_id', childId)
        .where('p.author_type', 'child')
        .where('pc.author_type', 'ai')
        .where('pc.created_at', '>=', since)
        .where('pc.read', false)
        .select(
          'pc.id',
          'pc.content',
          'pc.created_at',
          'af.id as friend_id',
          'af.name as friend_name',
          'af.cover_emojis as friend_emoji',
          'af.avatar_url as friend_avatar_url',
        )
        .orderBy('pc.created_at', 'desc')
        .limit(20),

      db('child_badges as cb')
        .join('badge_definitions as bd', 'cb.badge_id', 'bd.id')
        .join('children as c', 'cb.child_id', 'c.id')
        .where('cb.child_id', childId)
        .where('cb.earned_at', '>=', since)
        .select(
          'cb.id',
          'cb.earned_at',
          'cb.seen',
          'bd.name',
          'bd.name_fr',
          'bd.icon as badge_icon',
          'bd.description',
          'bd.description_fr',
          'c.language',
        )
        .orderBy('cb.earned_at', 'desc')
        .limit(20),
    ]);

    const notifications: NotificationRow[] = [
      ...dmRows.map((r) => ({
        id: r.id as string,
        type: 'dm' as const,
        friendId: r.friend_id as string,
        friendName: r.friend_name as string,
        friendEmoji: r.friend_emoji as string,
        friendAvatarUrl: (r.friend_avatar_url as string | null) ?? null,
        preview: r.content as string,
        createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
        read: Boolean(r.read),
      })),
      ...commentRows.map((r) => ({
        id: `comment-${r.id as string}`,
        type: 'comment' as const,
        friendId: r.friend_id as string,
        friendName: r.friend_name as string,
        friendEmoji: r.friend_emoji as string,
        friendAvatarUrl: (r.friend_avatar_url as string | null) ?? null,
        preview: r.content as string,
        createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
        read: false,
      })),
      ...badgeRows.map((r) => {
        const lang = (r.language as string) === 'fr' ? 'fr' : 'en';
        const badgeName = lang === 'fr' ? (r.name_fr ?? r.name) : r.name;
        const badgeDesc = lang === 'fr' ? (r.description_fr ?? r.description) : r.description;
        return {
          id: `badge-${r.id as string}`,
          type: 'badge' as const,
          friendId: null,
          friendName: badgeName as string,
          friendEmoji: r.badge_icon as string,
          friendAvatarUrl: null,
          preview: badgeDesc as string,
          createdAt: r.earned_at instanceof Date ? r.earned_at.toISOString() : String(r.earned_at),
          read: Boolean(r.seen),
        };
      }),
    ]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 20);

    res.json({ notifications });
  } catch {
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
}

export async function markNotificationRead(req: AuthRequest, res: Response) {
  const childId = req.childId;
  const { id } = req.params;

  if (!childId) {
    res.status(401).json({ error: 'Child auth required' });
    return;
  }

  if (!id) {
    res.status(400).json({ error: 'Notification ID required' });
    return;
  }

  try {
    if (id.startsWith('comment-')) {
      const commentId = id.replace('comment-', '');
      await db('post_comments').where('id', commentId).update({ read: true });
    } else if (id.startsWith('badge-')) {
      const badgeId = id.replace('badge-', '');
      await db('child_badges').where('id', badgeId).update({ seen: true });
    } else {
      await db('messages').where('id', id).update({ read: true });
      await db('read_notifications')
        .insert({ child_id: childId, message_id: id })
        .onConflict(['child_id', 'message_id'])
        .ignore();
    }

    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
}
