import { Response } from 'express';
import db from '../db';
import {
  generateFriendReply,
  generateDailyPosts,
  buildMemoryBrief,
  FriendForAI,
} from '../services/ai.service';
import { AuthRequest } from '../middleware/auth';
import { Child, PersonalityTrait } from '../../../shared/types';

// Map a snake_case DB row to the Child type expected by the AI service
function toChildType(row: Record<string, unknown>): Child {
  return {
    id:           String(row.id),
    parentId:     String(row.parent_id),
    name:         String(row.name),
    age:          Number(row.age),
    gender:       (row.gender as Child['gender'])       || 'preferNotToSay',
    language:     (row.language as Child['language'])   || 'en',
    specialNeeds: (row.special_needs as string[])       || [],
    preReader:    Boolean(row.pre_reader),
    avatarTheme:  (row.avatar_theme as Child['avatarTheme']) || 'animals',
    mascot:       (row.mascot as Child['mascot'])       || 'luna',
    interests:    (row.interests as string[])           || [],
    selectedPack: String(row.selected_pack ?? ''),
    avatarUrl:    row.avatar_url ? String(row.avatar_url) : null,
    createdAt:    row.created_at as Date,
    updatedAt:    row.updated_at as Date,
  };
}

// Map a snake_case DB row to FriendForAI
function toFriendType(row: Record<string, unknown>): FriendForAI {
  return {
    id:           String(row.id),
    name:         String(row.name),
    personality:  (row.personality as PersonalityTrait[]) || [],
    interests:    (row.interests as string[])   || [],
    avatarStyle:  (row.avatar_style as FriendForAI['avatarStyle']) || 'cartoon',
    avatarUrl:    String(row.avatar_url ?? ''),
    isStarFriend: Boolean(row.is_star_friend),
    isTeacher:    Boolean(row.is_teacher),
    bio:          String(row.bio ?? ''),
    greeting:     String(row.greeting ?? ''),
    packId:       row.pack_id ? String(row.pack_id) : null,
    // runtime extras
    age:          row.age ? Number(row.age) : undefined,
    subject:      row.subject ? String(row.subject) : undefined,
  };
}

export async function aiChat(req: AuthRequest, res: Response) {
  try {
    const { childId, friendId } = req.params;
    const { message } = req.body;

    if (!message?.trim()) {
      res.status(400).json({ error: 'Message is required' });
      return;
    }

    const [childRow, friendRow] = await Promise.all([
      db('children').where({ id: childId, parent_id: req.userId }).first(),
      db('ai_friends').where({ id: friendId }).first(),
    ]);

    if (!childRow) {
      res.status(404).json({ error: 'Child not found' });
      return;
    }
    if (!friendRow) {
      res.status(404).json({ error: 'Friend not found' });
      return;
    }

    const child  = toChildType(childRow);
    const friend = toFriendType(friendRow);

    const memoryRow = await db('child_memories')
      .where({ child_id: childId, friend_id: friendId })
      .first();

    const brief = buildMemoryBrief(memoryRow ?? null);

    const aiResponse = await generateFriendReply(friend, child, message.trim(), brief);

    // Upsert conversation
    let conversation = await db('conversations')
      .where({ child_id: childId, friend_id: friendId })
      .first();
    if (!conversation) {
      [conversation] = await db('conversations')
        .insert({ child_id: childId, friend_id: friendId })
        .returning('*');
    }

    const [aiMessage] = await db('messages')
      .insert({
        conversation_id: conversation.id,
        sender_id:       friendId,
        sender_type:     'ai',
        content:         aiResponse.text,
        media_type:      'text',
      })
      .returning('*');

    await db('conversations')
      .where({ id: conversation.id })
      .update({ updated_at: db.fn.now() });

    res.json({ message: aiMessage });
  } catch (err) {
    console.error('AI chat error:', err);
    res.status(500).json({ error: 'AI friend is taking a nap — please try again!' });
  }
}

export async function generateFriendPost(req: AuthRequest, res: Response) {
  try {
    const { friendId } = req.params;
    const { childId } = req.body;

    if (!childId) {
      res.status(400).json({ error: 'childId is required in the request body' });
      return;
    }

    const [childRow, friendRow] = await Promise.all([
      db('children').where({ id: childId, parent_id: req.userId }).first(),
      db('ai_friends').where({ id: friendId }).first(),
    ]);

    if (!childRow || !friendRow) {
      res.status(404).json({ error: 'Child or friend not found' });
      return;
    }

    const child  = toChildType(childRow);
    const friend = toFriendType(friendRow);

    const memoryRow = await db('child_memories')
      .where({ child_id: childId, friend_id: friendId })
      .first();

    const brief = buildMemoryBrief(memoryRow ?? null);

    const result = await generateDailyPosts([friend], child, brief);

    if (result.error || result.posts.length === 0) {
      res.status(500).json({ error: 'Failed to generate post' });
      return;
    }

    const generated = result.posts[0];
    const [post] = await db('posts')
      .insert({
        author_id:   friendId,
        author_type: 'ai',
        content:     generated.text,
        mood:        generated.mood,
        media_type:  'text',
      })
      .returning('*');

    res.status(201).json({ post });
  } catch (err) {
    console.error('Generate friend post error:', err);
    res.status(500).json({ error: 'Failed to generate post' });
  }
}
