import { Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db';
import { AuthRequest } from '../middleware/auth';
import {
  generateFriendReply,
  generateTutorReply,
  checkMood,
  buildMemoryBrief,
  type TutorReply,
  type FriendReplyResult,
} from '../services/ai.service';
import { toChildType, toFriendType, toMemoryType } from '../utils/db-mappers';
import type { Child } from '../../../shared/types';

function calculateTypingDelay(wordCount: number, isOnline: boolean): number {
  let delay = 0;
  for (let i = 0; i < wordCount; i++) {
    if (i < 5)       delay += 800;
    else if (i < 15) delay += 400;
    else             delay += 200;
  }
  if (!isOnline) delay *= 2;
  if (process.env.NODE_ENV === 'development') {
    delay = Math.min(delay, 15000);
  }
  return Math.max(delay, 2000);
}

// XP thresholds: index = current level, value = XP needed to reach next level
const LEVEL_UP_AT: Record<number, number> = { 1: 100, 2: 300, 3: 600, 4: 1000, 5: 1500 };
const LEVEL_NAMES: Record<number, string> = {
  1: 'New Friends', 2: 'Good Friends', 3: 'Close Friends',
  4: 'Best Friends', 5: 'Super BFFs', 6: 'Forever Friends',
};
const MAX_LEVEL = 6;
const XP_PER_MESSAGE = 10;

async function awardFriendshipXP(childId: string, friendId: string, child: Child, friendName: string) {
  await db('child_friends')
    .where({ child_id: childId, friend_id: friendId })
    .increment('friendship_xp', XP_PER_MESSAGE);

  const row = await db('child_friends')
    .where({ child_id: childId, friend_id: friendId })
    .select('friendship_xp', 'friendship_level')
    .first() as { friendship_xp: number; friendship_level: number } | undefined;

  if (!row) return;
  const { friendship_xp: newXp, friendship_level: currentLevel } = row;

  const threshold = LEVEL_UP_AT[currentLevel];
  if (!threshold || newXp < threshold || currentLevel >= MAX_LEVEL) return;

  const newLevel     = currentLevel + 1;
  const newLevelName = LEVEL_NAMES[newLevel] ?? 'Legend';

  await db('child_friends')
    .where({ child_id: childId, friend_id: friendId })
    .update({ friendship_level: newLevel });

  console.log(`[xp] 🎉 Level up! ${child.name} + ${friendName} → Level ${newLevel} (${newLevelName})`);

  // Add milestone to child_memories
  const milestoneText = `Reached Level ${newLevel} friendship with ${friendName}!`;
  const newMilestone = {
    id:          uuidv4(),
    title:       milestoneText,
    description: `${child.name} and ${friendName} are now ${newLevelName}`,
    achievedAt:  new Date().toISOString(),
    badgeId:     null,
  };

  const memoryRow = await db('child_memories')
    .where({ child_id: childId, friend_id: friendId })
    .first();

  const existingMilestones = ((memoryRow?.milestones as object[]) ?? []);

  await db('child_memories')
    .insert({
      child_id:         childId,
      friend_id:        friendId,
      facts:            JSON.stringify(memoryRow?.facts ?? []),
      emotional_history: JSON.stringify(memoryRow?.emotional_history ?? []),
      milestones:       JSON.stringify([...existingMilestones, newMilestone]),
      last_updated:     new Date(),
    })
    .onConflict(['child_id', 'friend_id'])
    .merge(['milestones', 'last_updated']);

  // Parent alert
  await db('parent_alerts').insert({
    child_id: childId,
    type:     'milestone',
    message:  `${child.name} and ${friendName} are now ${newLevelName}! 🎉`,
    severity: 'info',
  }).catch((err: unknown) => console.error('[xp] Failed to save level-up alert:', err));
}

// ─── GET /api/messages/:friendId ──────────────────────────────────────────────
// Child-session endpoint — childId comes from JWT, not URL.
export async function getMessages(req: AuthRequest, res: Response) {
  const childId = req.childId;
  if (!childId) { res.status(401).json({ error: 'Child authentication required' }); return; }

  try {
    const { friendId } = req.params;

    let conversation = await db('conversations')
      .where({ child_id: childId, friend_id: friendId })
      .first();

    if (!conversation) {
      [conversation] = await db('conversations')
        .insert({ child_id: childId, friend_id: friendId })
        .returning('*');
    }

    const messages = await db('messages')
      .where({ conversation_id: conversation.id })
      .orderBy('created_at', 'asc')
      .limit(50);

    res.json({ messages, conversationId: conversation.id });
  } catch (err) {
    console.error('[messages] getMessages error:', err);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
}

// ─── POST /api/messages/:friendId ─────────────────────────────────────────────
// Saves child message, returns immediately with status:'pending', then fires
// Claude reply after a realistic delay via setTimeout.
export async function sendMessage(req: AuthRequest, res: Response) {
  const childId = req.childId;
  if (!childId) { res.status(401).json({ error: 'Child authentication required' }); return; }

  try {
    const { friendId } = req.params;
    const { content, imageBase64, imageMediaType } = req.body as {
      content?: string;
      imageBase64?: string;
      imageMediaType?: string;
    };
    if (!content?.trim()) { res.status(400).json({ error: 'content is required' }); return; }

    // a. Find or create conversation
    let conversation = await db('conversations')
      .where({ child_id: childId, friend_id: friendId })
      .first();
    if (!conversation) {
      [conversation] = await db('conversations')
        .insert({ child_id: childId, friend_id: friendId })
        .returning('*');
    }

    // b. Save child's message
    const [childMessage] = await db('messages')
      .insert({
        conversation_id: conversation.id,
        sender_id:       childId,
        sender_type:     'child',
        content:         content.trim(),
      })
      .returning('*');

    await db('conversations').where({ id: conversation.id }).update({ updated_at: new Date() });

    // c. Fetch child profile + friend (parallel)
    const [childRow, friendRow] = await Promise.all([
      db('children').where({ id: childId }).first(),
      db('ai_friends')
        .where({ id: friendId })
        .select('*', 'is_online', 'response_delay_min', 'response_delay_max')
        .first(),
    ]);

    if (!childRow)  { res.status(404).json({ error: 'Child not found' });  return; }
    if (!friendRow) { res.status(404).json({ error: 'Friend not found' }); return; }

    const child  = toChildType(childRow);
    const friend = toFriendType(friendRow);
    const isOnline = !!(friendRow.is_online as boolean);

    // d. Generate Claude reply immediately so we can base the delay on word count
    const memoryRow = await db('child_memories')
      .where({ child_id: childId, friend_id: friendId })
      .first();
    const memoryBrief = memoryRow ? buildMemoryBrief(toMemoryType(memoryRow)) : null;

    const recentMessages = await db('messages')
      .where({ conversation_id: conversation.id })
      .orderBy('created_at', 'asc')
      .limit(15)
      .select('content', 'sender_type') as Array<{ content: string; sender_type: string }>;

    const childFriendRows = await db('child_friends')
      .where({ child_id: childId })
      .join('ai_friends', 'ai_friends.id', 'child_friends.friend_id')
      .select('ai_friends.name') as Array<{ name: string }>;
    const friendNames = childFriendRows.map((f) => f.name).join(', ');

    const lang = (childRow.language as string) || 'en';
    const isTeacher = Boolean(friendRow.is_teacher);

    console.log(`[messages] 🤖 Calling Claude — ${friend.name} replies to ${child.name}: "${content.trim().slice(0, 40)}" (lang=${lang}${isTeacher ? ', teacher' : ''})`);

    let reply: FriendReplyResult;
    let tutorMeta: TutorReply | null = null;

    if (isTeacher) {
      const tutorLang = (lang === 'fr' ? 'fr' : 'en') as 'en' | 'fr';
      const isFirstInteraction = !child.schoolGrade;

      const [tutorReply, mood2] = await Promise.all([
        generateTutorReply(
          child,
          (friendRow.subject as string | undefined) ?? 'general',
          content.trim(),
          memoryBrief,
          tutorLang,
          recentMessages,
          imageBase64,
          imageMediaType,
          isFirstInteraction,
        ),
        checkMood(content.trim(), child.name, child.age),
      ]);

      reply     = tutorReply;
      tutorMeta = tutorReply;

      // Grade capture
      if (tutorMeta.gradeCapture) {
        await db('children').where({ id: childId }).update({ school_grade: tutorMeta.gradeCapture });
        console.log(`[luna] 📚 Grade captured: ${tutorMeta.gradeCapture} for ${child.name}`);
      }

      // Subject tracking + session count
      if (tutorMeta.detectedSubject) {
        const isNewSubject = tutorMeta.detectedSubject !== child.lastSubject;
        await db('children').where({ id: childId }).update({ last_subject: tutorMeta.detectedSubject });
        if (isNewSubject) {
          await db('children').where({ id: childId }).increment('learning_sessions_count', 1);
        }
      }

      if (imageBase64) {
        console.log(`[luna] 📸 Image received, processed by Claude, not stored`);
      }

      // Stash mood for use below
      (req as unknown as Record<string, unknown>)._mood = mood2;

    } else {
      const [friendReply, mood2] = await Promise.all([
        generateFriendReply(friend, child, content.trim(), memoryBrief, lang, recentMessages, friendNames),
        checkMood(content.trim(), child.name, child.age),
      ]);
      reply = friendReply;
      (req as unknown as Record<string, unknown>)._mood = mood2;
    }

    const mood = (req as unknown as Record<string, unknown>)._mood as Awaited<ReturnType<typeof checkMood>>;

    console.log(`[messages] ✅ ${friend.name}: "${reply.text.slice(0, 60)}" (${reply.inputTokens}→${reply.outputTokens} tokens)`);
    console.log(`[messages] 🎭 Mood: ${mood.mood} intensity=${mood.intensity} alert=${mood.parentAlertNeeded}`);

    // e. Calculate delay based on actual word count
    const wordCount  = reply.text.split(' ').length;
    const delayMs    = calculateTypingDelay(wordCount, isOnline);
    const delaySeconds = Math.round(delayMs / 1000);

    // f. Return immediately — app polls for the reply
    res.json({ childMessage, friendReply: null, status: 'pending', estimatedReplySeconds: delaySeconds });

    // g. Save reply after the calculated typing delay (out-of-band — response already sent)
    setTimeout(() => {
      void (async () => {
        try {
          await db('messages').insert({
            conversation_id: conversation.id,
            sender_id:       friendId,
            sender_type:     'ai',
            content:         reply.text,
          });

          awardFriendshipXP(childId, friendId, child, friend.name).catch((err: unknown) =>
            console.error('[xp] Award failed:', err),
          );

          // Record learning session for teacher friends
          if (tutorMeta) {
            const gradeAtTime = child.schoolGrade ?? tutorMeta.gradeCapture ?? 'unknown';
            await db('learning_sessions').insert({
              child_id:         childId,
              subject:          tutorMeta.detectedSubject ?? 'general',
              grade_at_time:    gradeAtTime,
              concepts_covered: JSON.stringify(tutorMeta.conceptsCovered ?? []),
              mode:             tutorMeta.detectedMode ?? 'learning',
              confidence_level: tutorMeta.confidenceLevel ?? null,
              photo_used:       !!imageBase64,
              created_at:       new Date(),
            }).catch((err: unknown) => console.error('[luna] Failed to save learning session:', err));
          }

          if (mood.parentAlertNeeded) {
            await db('parent_alerts').insert({
              child_id: childId,
              type:     'mood_flag',
              message:  mood.parentAlertReason ?? 'Mood concern detected',
              severity: mood.crisisFlag ? 'urgent' : 'warning',
            }).catch((alertErr: unknown) =>
              console.error('[alerts] ❌ Failed to save parent alert:', alertErr),
            );
          }
        } catch (err) {
          console.error('[messages] ❌ Delayed reply save failed:', err);
        }
      })();
    }, delayMs);

  } catch (err) {
    console.error('[messages] sendMessage error:', err);
    res.status(500).json({ error: 'Failed to send message' });
  }
}

// ─── GET /api/messages/:friendId/latest ───────────────────────────────────────
// Returns the single most recent message in this conversation (used to poll for
// pending AI replies).
export async function getLatestMessage(req: AuthRequest, res: Response) {
  const childId = req.childId;
  if (!childId) { res.status(401).json({ error: 'Child authentication required' }); return; }

  try {
    const { friendId } = req.params;

    const conversation = await db('conversations')
      .where({ child_id: childId, friend_id: friendId })
      .first();

    if (!conversation) { res.json({ message: null }); return; }

    const message = await db('messages')
      .where({ conversation_id: conversation.id })
      .orderBy('created_at', 'desc')
      .first();

    res.json({ message: message ?? null });
  } catch (err) {
    console.error('[messages] getLatestMessage error:', err);
    res.status(500).json({ error: 'Failed to fetch latest message' });
  }
}

// ─── Legacy parent-dashboard endpoint ─────────────────────────────────────────
export async function getConversations(req: AuthRequest, res: Response) {
  try {
    const conversations = await db('conversations')
      .join('ai_friends', 'ai_friends.id', 'conversations.friend_id')
      .where({ 'conversations.child_id': req.params.childId })
      .select('conversations.*', 'ai_friends.name as friend_name', 'ai_friends.avatar_url')
      .orderBy('conversations.updated_at', 'desc');
    res.json({ conversations });
  } catch {
    res.status(500).json({ error: 'Failed to fetch conversations' });
  }
}
