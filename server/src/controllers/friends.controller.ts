import { Request, Response } from 'express';
import db from '../db';
import { AuthRequest } from '../middleware/auth';
import { triggerWelcomeFlow } from '../services/friendWelcome';
import { checkBadgesForChild } from './badges.controller';

export async function listFriends(_req: Request, res: Response) {
  try {
    const friends = await db('ai_friends').orderBy('name');
    res.json({ friends });
  } catch {
    res.status(500).json({ error: 'Failed to fetch friends' });
  }
}

// GET /friends/:friendId — optionalAuth: includes is_added + friendship stats if child token
export async function getFriend(req: AuthRequest, res: Response) {
  try {
    const friend = await db('ai_friends').where({ id: req.params.friendId }).first();
    if (!friend) { res.status(404).json({ error: 'Friend not found' }); return; }

    let is_added = false;
    let friendship: Record<string, unknown> | undefined;

    if (req.childId) {
      const cf = await db('child_friends')
        .where({ child_id: req.childId, friend_id: req.params.friendId })
        .first();
      is_added = !!cf;
      if (cf) {
        const msgCount = await db('messages')
          .join('conversations', 'conversations.id', 'messages.conversation_id')
          .where({
            'conversations.child_id':  req.childId,
            'conversations.friend_id': req.params.friendId,
            'messages.sender_type':    'child',
          })
          .count('messages.id as count')
          .first() as { count: string } | undefined;

        friendship = {
          level:         Number(cf.friendship_level ?? 1),
          xp:            Number(cf.friendship_xp    ?? 0),
          activatedAt:   cf.activated_at,
          messagesCount: Number(msgCount?.count ?? 0),
        };
      }
    }

    // Resolve the referring friend's name so the app can show "Friend of Mia" not a UUID
    const referrer = await db('ai_friend_network')
      .where({ connected_friend_id: req.params.friendId })
      .join('ai_friends', 'ai_friends.id', 'ai_friend_network.ai_friend_id')
      .select('ai_friends.name as referring_friend_name', 'ai_friends.id as referring_friend_id')
      .first() as { referring_friend_name: string; referring_friend_id: string } | undefined;

    res.json({
      friend: {
        ...friend,
        is_added,
        friendship,
        referringFriendName: referrer?.referring_friend_name ?? null,
        referringFriendId:   referrer?.referring_friend_id   ?? null,
      },
    });
  } catch {
    res.status(500).json({ error: 'Failed to fetch friend' });
  }
}

// GET /friends/:friendId/network — optionalAuth: marks already_added for child
export async function getFriendNetwork(req: AuthRequest, res: Response) {
  try {
    const rows = await db('ai_friend_network')
      .join('ai_friends', 'ai_friends.id', 'ai_friend_network.connected_friend_id')
      .where('ai_friend_network.ai_friend_id', req.params.friendId)
      .select(
        'ai_friends.*',
        'ai_friend_network.relationship_type as network_relationship_type',
        'ai_friend_network.relationship_description',
      );

    let addedIds = new Set<string>();
    if (req.childId) {
      const added = await db('child_friends')
        .where({ child_id: req.childId })
        .pluck('friend_id') as string[];
      addedIds = new Set(added);
    }

    const friends = (rows as Record<string, unknown>[]).map(r => ({
      ...r,
      relationship_type: r.network_relationship_type,
      already_added:     addedIds.has(r.id as string),
    }));

    res.json({ friends });
  } catch (err) {
    console.error('[friends] getFriendNetwork error:', err);
    res.status(500).json({ error: 'Failed to fetch friend network' });
  }
}

// GET /friends/:friendId/posts — requireAuth (child token)
export async function getFriendPosts(req: AuthRequest, res: Response) {
  const childId = req.childId;
  if (!childId) { res.status(401).json({ error: 'Child authentication required' }); return; }

  try {
    const posts = await db('posts')
      .where({ child_id: childId, author_id: req.params.friendId, author_type: 'ai' })
      .orderBy('created_at', 'desc')
      .limit(6)
      .select('id', 'content', 'scene_emojis', 'mood', 'created_at');
    res.json({ posts });
  } catch {
    res.status(500).json({ error: 'Failed to fetch friend posts' });
  }
}

// POST /friends/:friendId/add — requireAuth (child token)
export async function addFriendForChild(req: AuthRequest, res: Response) {
  const childId = req.childId;
  if (!childId) { res.status(401).json({ error: 'Child authentication required' }); return; }

  try {
    const { friendId } = req.params;
    const { referringFriendId } = req.body as { referringFriendId?: string };

    const friend = await db('ai_friends').where({ id: friendId }).first();
    if (!friend) { res.status(404).json({ error: 'Friend not found' }); return; }

    await db('child_friends')
      .insert({ child_id: childId, friend_id: friendId, activated_at: new Date(), friendship_level: 1, friendship_xp: 0 })
      .onConflict(['child_id', 'friend_id']).ignore();

    await db('child_memories')
      .insert({
        child_id:          childId,
        friend_id:         friendId,
        facts:             JSON.stringify([]),
        emotional_history: JSON.stringify([]),
        milestones:        JSON.stringify([`Added ${String(friend.name)} as a friend`]),
        last_updated:      new Date(),
      })
      .onConflict(['child_id', 'friend_id']).ignore();

    if (referringFriendId) {
      const existingWelcome = await db('messages')
        .join('conversations', 'conversations.id', 'messages.conversation_id')
        .where({
          'conversations.child_id':  childId,
          'conversations.friend_id': friendId,
          'messages.sender_type':    'ai',
        })
        .first();

      if (existingWelcome) {
        console.log('[friends] Welcome already sent, skipping duplicate');
      } else {
        triggerWelcomeFlow(childId, friendId, referringFriendId)
          .catch(e => console.error('[friends] welcome flow failed:', e));
      }
    }

    checkBadgesForChild(childId, 'friends_added').catch(console.error);

    console.log(`[friends] ✅ Child ${childId} added ${String(friend.name)}`);
    res.json({ success: true, friend });
  } catch (err) {
    console.error('[friends] addFriendForChild error:', err);
    res.status(500).json({ error: 'Failed to add friend' });
  }
}

export async function getChildFriends(req: AuthRequest, res: Response) {
  try {
    const friends = await db('child_friends')
      .join('ai_friends', 'ai_friends.id', 'child_friends.friend_id')
      .where({ 'child_friends.child_id': req.params.childId })
      .select('ai_friends.*');
    res.json({ friends });
  } catch {
    res.status(500).json({ error: 'Failed to fetch child friends' });
  }
}

export async function activateFriendForChild(req: AuthRequest, res: Response) {
  try {
    await db('child_friends')
      .insert({ child_id: req.params.childId, friend_id: req.body.friendId })
      .onConflict(['child_id', 'friend_id']).ignore();
    res.json({ message: 'Friend activated' });
  } catch {
    res.status(500).json({ error: 'Failed to activate friend' });
  }
}

export async function deactivateFriendForChild(req: AuthRequest, res: Response) {
  try {
    await db('child_friends')
      .where({ child_id: req.params.childId, friend_id: req.params.friendId })
      .delete();
    res.json({ message: 'Friend deactivated' });
  } catch {
    res.status(500).json({ error: 'Failed to deactivate friend' });
  }
}

// GET /friends/:friendId/status — no auth required
export async function getFriendStatus(req: Request, res: Response) {
  try {
    const friend = await db('ai_friends')
      .where({ id: req.params.friendId })
      .select('name', 'is_online', 'response_delay_min', 'response_delay_max')
      .first() as {
        name: string;
        is_online: boolean;
        response_delay_min: number;
        response_delay_max: number;
      } | undefined;

    if (!friend) { res.status(404).json({ error: 'Friend not found' }); return; }

    res.json({
      is_online:           !!friend.is_online,
      friend_name:         friend.name,
      response_delay_min:  Number(friend.response_delay_min ?? 1),
      response_delay_max:  Number(friend.response_delay_max ?? 3),
    });
  } catch {
    res.status(500).json({ error: 'Failed to fetch friend status' });
  }
}
