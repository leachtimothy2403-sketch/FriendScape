import { Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db';
import { AuthRequest } from '../middleware/auth';
import { checkBadgesForChild } from './badges.controller';
import {
  generateFriendReply,
  generateJulesReply,
  generateTutorReply,
  generateSophieReply,
  generateRPSMove,
  generateTicTacToeMove,
  generateStoryContribution,
  generateMascotReply,
  checkTTTBoard,
  checkMood,
  buildMemoryBrief,
  type TutorReply,
  type SophieReply,
  type FriendReplyResult,
  type Mascot as AIMascot,
  type MascotName,
  type MascotMessageType,
} from '../services/ai.service';
import { toChildType, toFriendType, toMemoryType } from '../utils/db-mappers';
import { findOrCreateMascotId, sendMascotDM } from '../services/migaDM';
import { sendFeedbackEmail } from '../services/email.service';
import { localizedFriendName } from '../utils/friend-names';
import { detectGrade } from '../utils/grade-detection';
import type { Child } from '../../../shared/types';
import { generateSpeech } from '../services/audio.service';

// Mirrors nameToCharacterId() in app/components/AudioPlayer.tsx byte-for-byte — must stay
// identical so the cache key computed here matches what the client requests later.
function nameToCharacterId(name: string): string {
  return name
    .toLowerCase()
    .replace(/\./g, '')
    .replace(/\s+(.)/g, (_, c: string) => c.toUpperCase());
}

async function callClaudeWithRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (err: unknown) {
      const status = (err as Record<string, unknown>)?.status;
      if (status === 429 && i < maxRetries - 1) {
        const waitMs = (i + 1) * 15000;
        console.log(`[claude] Rate limited — waiting ${waitMs / 1000}s before retry ${i + 1}...`);
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }
      throw err;
    }
  }
  throw new Error('callClaudeWithRetry: unreachable');
}

function calculateTypingDelay(wordCount: number, isOnline: boolean, hasImage: boolean = false): number {
  if (process.env.NODE_ENV === 'development') {
    if (hasImage) return 2000;
    if (isOnline) return Math.floor(Math.random() * 3000) + 3000;  // 3-6s
    return Math.floor(Math.random() * 4000) + 8000;                 // 8-12s
  }
  if (hasImage) return 2000;
  let delay = 0;
  for (let i = 0; i < wordCount; i++) {
    if (i < 5)       delay += 800;
    else if (i < 15) delay += 400;
    else             delay += 200;
  }
  if (!isOnline) delay *= 2;
  return Math.max(delay, 2000);
}

// XP thresholds: index = current level, value = XP needed to reach next level
const LEVEL_UP_AT: Record<number, number> = { 1: 100, 2: 300, 3: 600, 4: 1000, 5: 1500 };
const LEVEL_NAMES: Record<'en' | 'fr', Record<number, string>> = {
  en: {
    1: 'New Friends', 2: 'Good Friends', 3: 'Close Friends',
    4: 'Best Friends', 5: 'Super BFFs', 6: 'Forever Friends',
  },
  fr: {
    1: 'Nouveaux amis', 2: 'Bons amis', 3: 'Amis proches',
    4: 'Meilleurs amis', 5: 'Super BFFs', 6: 'Amis pour toujours',
  },
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
  const lang         = child.language === 'fr' ? 'fr' : 'en';
  const newLevelName = LEVEL_NAMES[lang][newLevel] ?? (lang === 'fr' ? 'Légende' : 'Legend');
  const displayFriendName = localizedFriendName(friendName, lang);

  await db('child_friends')
    .where({ child_id: childId, friend_id: friendId })
    .update({ friendship_level: newLevel });

  console.log(`[xp] 🎉 Level up! ${child.name} + ${displayFriendName} → Level ${newLevel} (${newLevelName})`);

  // Add milestone to child_memories
  const milestoneText = `Reached Level ${newLevel} friendship with ${displayFriendName}!`;
  const newMilestone = {
    id:          uuidv4(),
    title:       milestoneText,
    description: `${child.name} and ${displayFriendName} are now ${newLevelName}`,
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
    message:  lang === 'fr'
      ? `${child.name} et ${displayFriendName} sont maintenant ${newLevelName} ! 🎉`
      : `${child.name} and ${displayFriendName} are now ${newLevelName}! 🎉`,
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
    if (content.trim().length > 2000) { res.status(400).json({ error: 'Message too long' }); return; }

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

    checkBadgesForChild(childId, 'total_messages').catch(console.error);

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

    const hasImage   = !!imageBase64;
    const historyLimit = hasImage ? 3 : 15;
    const recentMessages = (await db('messages')
      .where({ conversation_id: conversation.id })
      .orderBy('created_at', 'desc')
      .limit(historyLimit)
      .select('content', 'sender_type') as Array<{ content: string; sender_type: string }>).reverse();

    const childFriendRows = await db('child_friends')
      .where({ child_id: childId })
      .join('ai_friends', 'ai_friends.id', 'child_friends.friend_id')
      .select('ai_friends.name') as Array<{ name: string }>;
    const friendNames = childFriendRows.map((f) => f.name).join(', ');

    const lang = (childRow.language as string) || 'en';
    const isTeacher = Boolean(friendRow.is_teacher);

    if (isTeacher) checkBadgesForChild(childId, 'tutor_sessions').catch(console.error);

    console.log(`[messages] 🤖 Calling Claude — ${friend.name} replies to ${child.name}: "${content.trim().slice(0, 40)}" (lang=${lang}${isTeacher ? ', teacher' : ''})`);

    let reply: FriendReplyResult = { text: '', inputTokens: 0, outputTokens: 0 };
    let tutorMeta: TutorReply | null = null;
    let rateLimitFallback = false;

    // Jules (cahier de vacances) — grade detection on first message
    const isJules = Boolean((friendRow as Record<string, unknown>).is_jules);
    if (isJules) {
      const childRecord = await db('children').where({ id: childId }).select('school_grade_next', 'name').first();
      const hasGrade = childRecord?.school_grade_next && String(childRecord.school_grade_next).trim() !== '';


      if (!hasGrade) {
        const msgCount = await db('messages')
          .where({ conversation_id: conversation.id, sender_type: 'child' })
          .count('id as count')
          .first() as { count: string } | undefined;

        const isFirstMessage = Number(msgCount?.count ?? 0) <= 0;

        if (isFirstMessage) {
          const gradeQuestion = lang === 'fr'
            ? `Salut ${String(childRecord?.name ?? '')} ! Trop cool de te voir ici. Pour préparer tes missions de la semaine, tu peux me dire en quelle classe tu vas à la rentrée ?`
            : `Hey ${String(childRecord?.name ?? '')}! So great to have you here. To set up your missions, can you tell me what grade you'll be going into in September?`;

          await db('messages').insert({
            conversation_id: conversation.id,
            sender_id:       friendId,
            sender_type:     'ai',
            content:         gradeQuestion,
          });

          res.json({ reply: gradeQuestion, delay: 2000 });
          return;
        }
      }

      // Jules reply — use Jules-specific prompt, not generic friend reply
      const julesPersonalityPrompt = String((friendRow as Record<string, unknown>).personality_prompt ?? '');

      // Grade capture — extract from child's message if not yet stored
      const detectedGrade = detectGrade(content.trim(), lang as 'en' | 'fr');

      let schoolGrade = String((await db('children').where({ id: childId }).select('school_grade_next').first() as { school_grade_next?: string } | undefined)?.school_grade_next ?? '');

      if (detectedGrade && !schoolGrade) {
        await db('children').where({ id: childId }).update({ school_grade_next: detectedGrade });
        schoolGrade = detectedGrade;
        console.log(`[jules] 📚 Next year grade captured: ${detectedGrade} for ${child.name}`);
      }

      let julesReply: FriendReplyResult;
      try {
        const [resolved, mood2] = await Promise.all([
          callClaudeWithRetry(() =>
            generateJulesReply(
              child,
              content.trim(),
              memoryBrief,
              lang as 'en' | 'fr',
              recentMessages,
              julesPersonalityPrompt,
              schoolGrade || null,
              imageBase64,
              imageMediaType,
            ),
          ),
          checkMood(content.trim(), child.name, child.age, lang as 'en' | 'fr'),
        ]);
        julesReply = resolved;
        (req as unknown as Record<string, unknown>)._mood = mood2;
      } catch (err: unknown) {
        const status = (err as Record<string, unknown>)?.status;
        if (status === 429) {
          julesReply = {
            text: lang === 'fr'
              ? "Je suis un peu occupé là — reviens dans un moment ! 🧭"
              : "I'm a bit busy right now — come back in a moment! 🧭",
            inputTokens: 0, outputTokens: 0,
          };
        } else {
          throw err;
        }
      }

      reply = julesReply;
      (req as unknown as Record<string, unknown>)._mood ??= await checkMood(content.trim(), child.name, child.age, lang as 'en' | 'fr').catch(() => ({
        mood: 'neutral' as const, intensity: 'low' as const, crisisFlag: false, crisisReason: null,
        parentAlertNeeded: false, parentAlertReason: null, suggestParentTalk: false, inputTokens: 0, outputTokens: 0,
      }));

    }  // end if (isJules)

    const isSophie = Boolean((friendRow as Record<string, unknown>).is_sophie);
    if (!isJules && isSophie) {
      const currentLevel: 1 | 2 | 3 = child.age <= 7 ? 1 : child.age <= 9 ? 2 : 3;
      const childProgressRow = await db('children')
        .where({ id: childId })
        .select('safety_class_level', 'safety_class_completed_at')
        .first();
      const completedLevel = Number(childProgressRow?.safety_class_level ?? 0);
      const completedAt = childProgressRow?.safety_class_completed_at
        ? new Date(childProgressRow.safety_class_completed_at as string)
        : null;
      const oneYearMs = 365 * 24 * 60 * 60 * 1000;
      const isStale = completedAt ? (Date.now() - completedAt.getTime() > oneYearMs) : false;

      const sophieMode: 'class' | 'quiz' | 'chat' =
        completedLevel < currentLevel ? 'class' : (isStale ? 'quiz' : 'chat');

      let sophieReply: SophieReply;
      try {
        const [resolved, mood2] = await Promise.all([
          callClaudeWithRetry(() =>
            generateSophieReply(
              child,
              content.trim(),
              memoryBrief,
              lang as 'en' | 'fr',
              recentMessages,
              sophieMode,
              currentLevel,
              imageBase64,
              imageMediaType,
            ),
          ),
          checkMood(content.trim(), child.name, child.age, lang as 'en' | 'fr'),
        ]);
        sophieReply = resolved;
        (req as unknown as Record<string, unknown>)._mood = mood2;
      } catch (err: unknown) {
        const status = (err as Record<string, unknown>)?.status;
        if (status === 429) {
          sophieReply = {
            text: lang === 'fr'
              ? "Je suis un peu prise là — reviens dans un moment ! 💫"
              : "I'm a bit tied up right now — come back in a moment! 💫",
            inputTokens: 0, outputTokens: 0,
          };
        } else {
          throw err;
        }
      }

      reply = sophieReply;
      (req as unknown as Record<string, unknown>)._mood ??= await checkMood(content.trim(), child.name, child.age, lang as 'en' | 'fr').catch(() => ({
        mood: 'neutral' as const, intensity: 'low' as const, crisisFlag: false, crisisReason: null,
        parentAlertNeeded: false, parentAlertReason: null, suggestParentTalk: false, inputTokens: 0, outputTokens: 0,
      }));

      if (sophieMode === 'class' && sophieReply.classCompleted) {
        await db('children').where({ id: childId }).update({
          safety_class_level: currentLevel,
          safety_class_completed_at: new Date(),
        });
        checkBadgesForChild(childId, 'safety_class_level').catch((e: unknown) =>
          console.error('[sophie] badge check failed:', e),
        );
      } else if (sophieMode === 'quiz' && sophieReply.quizPassed) {
        await db('children').where({ id: childId }).update({
          safety_class_completed_at: new Date(),
        });
      }
    }

    if (!isJules && !isSophie && isTeacher) {
      const tutorLang = (lang === 'fr' ? 'fr' : 'en') as 'en' | 'fr';
      const isFirstInteraction = !child.schoolGrade;

      let tutorReply: TutorReply;
      try {
        const [resolved, mood2] = await Promise.all([
          callClaudeWithRetry(() =>
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
              undefined,
              hasImage,
            ),
          ),
          checkMood(content.trim(), child.name, child.age, lang as 'en' | 'fr'),
        ]);
        tutorReply = resolved;
        (req as unknown as Record<string, unknown>)._mood = mood2;
      } catch (err: unknown) {
        const status = (err as Record<string, unknown>)?.status;
        if (status === 429) {
          console.warn('[claude] All retries exhausted — returning friendly fallback');
          const fallbackText = lang === 'fr'
            ? "Je suis un peu occupée là — attends un moment et réessaie ! 🌟"
            : "I'm a little busy right now — give me a moment and try again! 🌟";
          tutorReply = { text: fallbackText, inputTokens: 0, outputTokens: 0 };
          rateLimitFallback = true;
          (req as unknown as Record<string, unknown>)._mood = await checkMood(content.trim(), child.name, child.age, lang as 'en' | 'fr').catch(() => ({
            mood: 'neutral' as const, intensity: 'low' as const, crisisFlag: false, crisisReason: null,
            parentAlertNeeded: false, parentAlertReason: null, suggestParentTalk: false, inputTokens: 0, outputTokens: 0,
          }));
        } else {
          throw err;
        }
      }

      reply     = tutorReply;
      tutorMeta = rateLimitFallback ? null : tutorReply as TutorReply;

      if (!rateLimitFallback) {
        // Grade capture
        if ((tutorReply as TutorReply).gradeCapture) {
          await db('children').where({ id: childId }).update({ school_grade: (tutorReply as TutorReply).gradeCapture });
          console.log(`[luna] 📚 Grade captured: ${(tutorReply as TutorReply).gradeCapture} for ${child.name}`);
        }

        // Subject tracking + session count
        if ((tutorReply as TutorReply).detectedSubject) {
          const isNewSubject = (tutorReply as TutorReply).detectedSubject !== child.lastSubject;
          await db('children').where({ id: childId }).update({ last_subject: (tutorReply as TutorReply).detectedSubject });
          if (isNewSubject) {
            await db('children').where({ id: childId }).increment('learning_sessions_count', 1);
          }
        }
      }

      if (imageBase64) {
        console.log(`[luna] 📸 Image received, processed by Claude, not stored`);
      }

    } else if (!isJules && !isSophie) {
      const aiMsgCountRow = await db('messages')
        .where({ conversation_id: conversation.id, sender_type: 'ai' })
        .count('* as count')
        .first();
      const aiMsgCount = Number(aiMsgCountRow?.count ?? 0);
      const triggerBadDay = aiMsgCount > 0 && aiMsgCount % 12 === 0;

      const [friendReply, mood2] = await Promise.all([
        callClaudeWithRetry(() =>
          generateFriendReply(friend, child, content.trim(), memoryBrief, lang, recentMessages, friendNames, false, { triggerBadDay }),
        ),
        checkMood(content.trim(), child.name, child.age, lang as 'en' | 'fr'),
      ]);
      reply = friendReply;
      (req as unknown as Record<string, unknown>)._mood = mood2;
    }

    const mood = (req as unknown as Record<string, unknown>)._mood as Awaited<ReturnType<typeof checkMood>>;

    console.log(`[messages] ✅ ${friend.name}: "${reply.text.slice(0, 60)}" (${reply.inputTokens}→${reply.outputTokens} tokens)`);
    console.log(`[messages] 🎭 Mood: ${mood.mood} intensity=${mood.intensity} alert=${mood.parentAlertNeeded}`);

    // e. Calculate delay based on actual word count
    const wordCount  = reply.text.split(' ').length;
    const delayMs    = calculateTypingDelay(wordCount, isOnline, hasImage);
    const delaySeconds = Math.round(delayMs / 1000);

    // f. Return immediately — app polls for the reply
    res.json({ childMessage, friendReply: null, status: 'pending', estimatedReplySeconds: delaySeconds });

    // g. Save reply after the calculated typing delay (out-of-band — response already sent)
    setTimeout(() => {
      void (async () => {
        try {
          const insertedRows = await db('messages').insert({
            conversation_id: conversation.id,
            sender_id:       friendId,
            sender_type:     'ai',
            content:         reply.text,
          }).returning('id');

          const insertedMessageId = typeof insertedRows[0] === 'object'
            ? (insertedRows[0] as { id: number | string }).id
            : insertedRows[0];

          const characterId   = nameToCharacterId(friend.name);
          const audioCacheKey = `${characterId.toLowerCase()}_${lang}_msg_${insertedMessageId}`;
          generateSpeech(reply.text, characterId, lang as 'en' | 'fr', audioCacheKey).catch((err: unknown) =>
            console.error('[voice] Proactive pre-generation failed:', err),
          );

          awardFriendshipXP(childId, friendId, child, friend.name).catch((err: unknown) =>
            console.error('[xp] Award failed:', err),
          );

          // Kind Heart badge: child comforted the friend when friend had a tough day
          if (!isTeacher) {
            const prevAiMsg = recentMessages
              .filter(m => m.sender_type === 'ai')
              .slice(-1)[0]?.content?.toLowerCase() ?? '';
            const friendHadBadDay = [
              'tired', 'fatigué', 'long day', 'longue journée', 'rough day', 'bit down',
            ].some(k => prevAiMsg.includes(k));
            const childComforted = [
              'better', 'mieux', 'courage', 'ça va', 'bisou', 'hugs', 'sorry', 'désolé', 'cheer',
            ].some(k => content.trim().toLowerCase().includes(k));
            if (friendHadBadDay && childComforted) {
              const kwBadge = await db('badge_definitions')
                .where({ trigger_type: 'kind_words' })
                .select('id', 'name', 'name_fr', 'icon', 'lumi_message', 'lumi_message_fr')
                .first() as Record<string, unknown> | undefined;
              if (kwBadge) {
                const alreadyEarned = await db('child_badges')
                  .where({ child_id: childId, badge_id: String(kwBadge.id) })
                  .first();
                if (!alreadyEarned) {
                  await db('child_badges')
                    .insert({ child_id: childId, badge_id: String(kwBadge.id) })
                    .onConflict(['child_id', 'badge_id']).ignore();
                  const lumiMsg = lang === 'fr'
                    ? String(kwBadge.lumi_message_fr ?? kwBadge.lumi_message ?? '')
                    : String(kwBadge.lumi_message ?? '');
                  if (lumiMsg) {
                    sendMascotDM(childId, String(child.mascot || 'miga'), lumiMsg).catch(console.error);
                  }
                  await db('parent_alerts').insert({
                    child_id: childId,
                    type:     'milestone',
                    message:  lang === 'fr'
                      ? `${child.name} a obtenu le badge "${String(kwBadge.name_fr ?? kwBadge.name)}" ! ${String(kwBadge.icon)}`
                      : `${child.name} earned the "${String(kwBadge.name)}" badge! ${String(kwBadge.icon)}`,
                    severity: 'info',
                  }).catch(console.error);
                }
              }
            }
          }

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

// ─── POST /api/messages/:friendId/game/start ─────────────────────────────────
export async function startGame(req: AuthRequest, res: Response) {
  const childId = req.childId;
  if (!childId) { res.status(401).json({ error: 'Child authentication required' }); return; }

  const { friendId } = req.params;
  const { gameType } = req.body as { gameType: 'rps' | 'tictactoe' | 'story' };

  try {
    const [childRow, friendRow] = await Promise.all([
      db('children').where({ id: childId }).first(),
      db('ai_friends').where({ id: friendId }).first(),
    ]);
    if (!childRow || !friendRow) { res.status(404).json({ error: 'Not found' }); return; }

    const child  = toChildType(childRow);
    const friend = toFriendType(friendRow);
    const lang   = (childRow.language as string) || 'en';
    const fr     = lang === 'fr';

    let conversation = await db('conversations').where({ child_id: childId, friend_id: friendId }).first();
    if (!conversation) {
      [conversation] = await db('conversations').insert({ child_id: childId, friend_id: friendId }).returning('*');
    }

    let content = '';
    let gameState: Record<string, unknown> = { type: gameType };

    if (gameType === 'rps') {
      content = fr
        ? `✊ Pierre Feuille Ciseaux ! À toi de jouer, ${child.name} — tu choisis !`
        : `✊ Rock Paper Scissors! Your move, ${child.name} — you choose first!`;
    } else if (gameType === 'tictactoe') {
      const board = ['','','','','','','','',''];
      gameState = { type: 'tictactoe', board };
      content = fr
        ? `❌ Morpion ! Tu es ❌ et je suis ⭕. À toi de commencer — choisis une case !`
        : `❌ Tic-Tac-Toe! You're ❌ and I'm ⭕. Your turn — pick a square!`;
    } else if (gameType === 'story') {
      const opening = await generateStoryContribution(friend, child, [], 0, lang);
      content   = opening.contribution;
      gameState = { type: 'story', storyHistory: [opening.contribution], round: 1 };
    }

    const [message] = await db('messages').insert({
      conversation_id: String(conversation.id),
      sender_id:       friendId,
      sender_type:     'ai',
      content,
      message_type:    'game_start',
      game_state:      JSON.stringify(gameState),
    }).returning('*');

    await db('conversations').where({ id: String(conversation.id) }).update({ updated_at: new Date() });
    res.json({ message, gameState });

  } catch (err) {
    console.error('[game] startGame error:', err);
    res.status(500).json({ error: 'Failed to start game' });
  }
}

// ─── POST /api/messages/:friendId/game/move ──────────────────────────────────
export async function makeGameMove(req: AuthRequest, res: Response) {
  const childId = req.childId;
  if (!childId) { res.status(401).json({ error: 'Child authentication required' }); return; }

  const { friendId } = req.params;
  const { gameType, move, gameState: clientState, childMessage } = req.body as {
    gameType:     'rps' | 'tictactoe' | 'story';
    move:         string | number;
    gameState:    Record<string, unknown>;
    childMessage?: string;
  };

  try {
    const [childRow, friendRow] = await Promise.all([
      db('children').where({ id: childId }).first(),
      db('ai_friends').where({ id: friendId }).first(),
    ]);
    if (!childRow || !friendRow) { res.status(404).json({ error: 'Not found' }); return; }

    const child  = toChildType(childRow);
    const friend = toFriendType(friendRow);
    const lang   = (childRow.language as string) || 'en';

    let conversation = await db('conversations').where({ child_id: childId, friend_id: friendId }).first();
    if (!conversation) {
      [conversation] = await db('conversations').insert({ child_id: childId, friend_id: friendId }).returning('*');
    }

    let content                              = '';
    let newGameState: Record<string, unknown> = { ...clientState };
    let gameOver                             = false;
    let winner: string | null                = null;

    if (gameType === 'rps') {
      const result = await generateRPSMove(friend, child, String(move), lang);
      content      = result.reaction;
      newGameState = { ...clientState, friendChoice: result.friendChoice, winner: result.winner };
      gameOver     = true;
      winner       = result.winner;

    } else if (gameType === 'tictactoe') {
      const board      = (clientState.board as string[]) ?? Array(9).fill('');
      const square     = Number(move);
      const updated    = [...board];
      if (updated[square] === '') updated[square] = 'X';

      const childWon = checkTTTBoard(updated);
      if (childWon) {
        content = lang === 'fr'
          ? (childWon === 'X' ? `Tu gagnes ! 🎉 Trois à la suite !` : `Égalité ! 🤝`)
          : (childWon === 'X' ? `You win! 🎉 Three in a row!` : `It's a draw! 🤝`);
        newGameState = { ...clientState, board: updated, winner: childWon };
        gameOver = true; winner = childWon;
      } else {
        const result = await generateTicTacToeMove(updated, friend, child, lang);
        content      = result.reaction;
        newGameState = { ...clientState, board: result.board, winner: result.winner };
        gameOver     = result.winner !== null;
        winner       = result.winner;
      }

    } else if (gameType === 'story') {
      const history = (clientState.storyHistory as string[]) ?? [];
      const round   = (clientState.round as number) ?? 1;
      if (childMessage) history.push(childMessage);
      const result  = await generateStoryContribution(friend, child, history, round, lang);
      content       = result.contribution;
      history.push(content);
      newGameState  = { ...clientState, storyHistory: history, round: round + 1 };
      gameOver      = result.isEnding;
    }

    const msgType = gameOver ? 'game_end' : 'game_move';
    const [message] = await db('messages').insert({
      conversation_id: String(conversation.id),
      sender_id:       friendId,
      sender_type:     'ai',
      content,
      message_type:    msgType,
      game_state:      JSON.stringify(newGameState),
    }).returning('*');

    await db('conversations').where({ id: String(conversation.id) }).update({ updated_at: new Date() });
    res.json({ message, gameState: newGameState, gameOver, winner });

  } catch (err) {
    console.error('[game] makeGameMove error:', err);
    res.status(500).json({ error: 'Failed to process game move' });
  }
}

// ─── POST /api/messages/:friendId/sophie-quiz ────────────────────────────────
// Voluntary, on-demand version of Sophie's quiz mode — same generation logic as
// the automatic annual-reactivation quiz, just triggerable anytime by the child.
// Low-stakes: passing refreshes safety_class_completed_at same as the automatic
// path; failing has no negative effect, they can just try again later.
export async function startSophieQuiz(req: AuthRequest, res: Response) {
  const childId = req.childId;
  if (!childId) { res.status(401).json({ error: 'Child authentication required' }); return; }

  const { friendId } = req.params;

  try {
    const [childRow, friendRow] = await Promise.all([
      db('children').where({ id: childId }).first(),
      db('ai_friends').where({ id: friendId }).first(),
    ]);
    if (!childRow || !friendRow) { res.status(404).json({ error: 'Not found' }); return; }
    if (!Boolean((friendRow as Record<string, unknown>).is_sophie)) {
      res.status(400).json({ error: 'Not Sophie' });
      return;
    }

    const child = toChildType(childRow);
    const lang  = (childRow.language as string) || 'en';
    const currentLevel: 1 | 2 | 3 = child.age <= 7 ? 1 : child.age <= 9 ? 2 : 3;
    const completedLevel = Number(childRow.safety_class_level ?? 0);

    if (completedLevel < currentLevel) {
      res.status(400).json({
        error: 'Class not completed yet',
        message: lang === 'fr'
          ? "On n'a pas encore fini la leçon ! Termine-la d'abord et je te ferai un quiz après 😊"
          : "We haven't finished the lesson yet! Finish that first and I'll quiz you after 😊",
      });
      return;
    }

    let conversation = await db('conversations').where({ child_id: childId, friend_id: friendId }).first();
    if (!conversation) {
      [conversation] = await db('conversations').insert({ child_id: childId, friend_id: friendId }).returning('*');
    }

    const sophieReply = await generateSophieReply(
      child,
      '',
      null,
      lang as 'en' | 'fr',
      [],
      'quiz',
      currentLevel,
    );

    const insertedRows = await db('messages').insert({
      conversation_id: String(conversation.id),
      sender_id:       friendId,
      sender_type:     'ai',
      content:         sophieReply.text,
    }).returning('*');
    const message = insertedRows[0];

    await db('conversations').where({ id: String(conversation.id) }).update({ updated_at: new Date() });

    if (sophieReply.quizPassed) {
      await db('children').where({ id: childId }).update({ safety_class_completed_at: new Date() });
    }

    const insertedMessageId = (message as Record<string, unknown>).id;
    const characterId       = nameToCharacterId(friendRow.name as string);
    const audioCacheKey     = `${characterId.toLowerCase()}_${lang}_msg_${insertedMessageId}`;
    generateSpeech(sophieReply.text, characterId, lang as 'en' | 'fr', audioCacheKey).catch((err: unknown) =>
      console.error('[voice] Proactive pre-generation failed:', err),
    );

    res.json({ message, quizPassed: !!sophieReply.quizPassed });
  } catch (err) {
    console.error('[sophie-quiz] error:', err);
    res.status(500).json({ error: 'Failed to start quiz' });
  }
}

// ─── GET /api/messages/unread ─────────────────────────────────────────────────
// Returns AI messages received since `since` (ISO query param) across all
// conversations for this child, used for feed-screen notification polling.
export async function getUnreadMessages(req: AuthRequest, res: Response) {
  const childId = req.childId;
  if (!childId) { res.status(401).json({ error: 'Child authentication required' }); return; }

  try {
    const since = req.query.since as string | undefined;
    const sinceDate = since ? new Date(since) : new Date(Date.now() - 60000);

    const rows = await db('messages')
      .join('conversations', 'conversations.id', 'messages.conversation_id')
      .join('ai_friends', 'ai_friends.id', 'messages.sender_id')
      .where('conversations.child_id', childId)
      .where('messages.sender_type', 'ai')
      .where('messages.created_at', '>', sinceDate)
      .whereNotExists(
        db('read_notifications')
          .where('read_notifications.child_id', childId)
          .whereRaw('"read_notifications"."message_id" = "messages"."id"')
          .select(db.raw('1')),
      )
      .orderBy('messages.created_at', 'asc')
      .select(
        'messages.id as id',
        'messages.sender_id as friendId',
        'ai_friends.name as friendName',
        db.raw("COALESCE(ai_friends.cover_emojis, '🌟') as friendEmojis"),
        'messages.content as message',
      ) as Array<{ id: string; friendId: string; friendName: string; friendEmojis: string; message: string }>;

    const messages = rows.map((r) => ({
      id:          String(r.id),
      friendId:    r.friendId,
      friendName:  r.friendName,
      friendEmoji: ([...(r.friendEmojis || '')][0]) ?? '🌟',
      message:     r.message,
    }));

    res.json({ messages });
  } catch (err) {
    console.error('[messages] getUnreadMessages error:', err);
    res.status(500).json({ error: 'Failed to fetch unread messages' });
  }
}

// ─── POST /api/messages/mascot ─────────────────────────────────────────────────
// Requires FEEDBACK_EMAIL in server/.env
export async function mascotMessage(req: AuthRequest, res: Response) {
  const childId = req.childId;
  if (!childId) { res.status(401).json({ error: 'Child authentication required' }); return; }

  const { content, history } = req.body as {
    content?: string;
    history?: { role: 'child' | 'mascot'; content: string }[];
  };
  if (!content?.trim()) { res.status(400).json({ error: 'content is required' }); return; }

  try {
    const childRow = await db('children').where({ id: childId }).first();
    if (!childRow) { res.status(404).json({ error: 'Child not found' }); return; }

    const child = toChildType(childRow);
    const lang = (childRow.language as string) || 'en';
    const rawMascot = String(childRow.mascot || 'miga').toLowerCase();

    const lower = content.trim().toLowerCase();
    const feedbackKeywords = [
      'bug', 'broken', 'marche pas', 'feedback', 'problème', 'problem',
      'issue', "doesn't work", 'not working', 'signaler', 'report',
    ];
    const deadEndKeywords = [
      'still', 'toujours', 'toujours pas', 'always', 'never',
      'ça marche pas', 'marche toujours pas', 'same', 'encore',
      'tried', 'essayé', 'même problème', 'still broken',
    ];
    const helpKeywords = ['how', 'comment', 'where', 'où', 'aide', 'help', 'what is', "qu'est-ce"];

    const hasFeedbackKeyword = feedbackKeywords.some(k => lower.includes(k));
    const hasDeadEnd = deadEndKeywords.some(k => lower.includes(k));
    const hasHelpKw  = helpKeywords.some(k => lower.includes(k));

    const historyArr = history ?? [];
    const feedbackTurnsInHistory = historyArr.filter(h =>
      h.role === 'child' && feedbackKeywords.some(k => h.content.toLowerCase().includes(k)),
    ).length;
    const deadEndInHistory = historyArr.filter(h =>
      h.role === 'child' && deadEndKeywords.some(k => h.content.toLowerCase().includes(k)),
    ).length;

    const isResolved = [
      'works now', 'it works', 'thank', 'merci', 'ça marche', 'ok merci',
      'super merci', 'parfait',
    ].some(k => lower.includes(k));

    const lastMascotMsg = historyArr
      .filter(h => h.role === 'mascot')
      .slice(-1)[0]?.content?.toLowerCase() ?? '';

    const mascotEscalated = [
      'je vais signaler', "i'll report", 'sending to team',
      'envoyer', 'équipe technique', 'technical team',
      'je vais envoyer', "i'll send",
    ].some(k => lastMascotMsg.includes(k));

    let mode: 'help' | 'feedback' | 'friend';
    if (hasHelpKw && !hasFeedbackKeyword) {
      mode = 'help';
    } else if (mascotEscalated || (feedbackTurnsInHistory >= 2 && hasDeadEnd)) {
      mode = 'feedback';
    } else {
      mode = 'friend';
    }

    const messageType: MascotMessageType = mode === 'help' ? 'help' : 'general';
    const mascotName = (rawMascot.charAt(0).toUpperCase() + rawMascot.slice(1)) as MascotName;
    const validNames: MascotName[] = ['Miga', 'Pixel', 'Finn', 'Sage'];
    const mascot: AIMascot = { name: validNames.includes(mascotName) ? mascotName : 'Miga' };

    console.log('[feedback] decision:', {
      msg: lower.slice(0, 30),
      hasFeedbackKeyword,
      hasDeadEnd,
      feedbackTurnsInHistory,
      deadEndInHistory,
      mascotEscalated,
      mode,
      feedbackEmail: process.env.FEEDBACK_EMAIL ? 'set' : 'NOT SET',
    });
    const result = await generateMascotReply(mascot, child, content.trim(), messageType, lang, history);

    if (mode === 'feedback') {
      const feedbackEmail = process.env.FEEDBACK_EMAIL;
      if (!feedbackEmail) {
        console.warn('[feedback] FEEDBACK_EMAIL not set in .env — email skipped');
      }
      if (feedbackEmail) {
        console.log(`[feedback] sending email to: ${feedbackEmail}, transcriptTurns=${(history ?? []).length + 1}`);
        const userRow = await db('users').where({ id: childRow.parent_id }).first().catch(() => null);
        const parentEmail = String(userRow?.email || '');
        const transcript = [
          ...(history ?? []).map(h => `${h.role === 'child' ? child.name : mascot.name}: ${h.content}`),
          `${child.name}: ${content.trim()}`,
        ].join('\n\n');
        const emailMessage = isResolved ? `[ISSUE RESOLVED]\n\n${transcript}` : transcript;

        let summary = '';
        try {
          const AnthropicSDK = (await import('@anthropic-ai/sdk')).default;
          const summaryClient = new AnthropicSDK({ apiKey: process.env.ANTHROPIC_API_KEY });
          const summaryRes = await summaryClient.messages.create({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 200,
            messages: [{
              role: 'user',
              content: `Summarize this support conversation in 2-3 sentences. Focus on: what the problem is, what was tried, current status. Be concise and factual.\n\nConversation:\n${transcript}`,
            }],
          });
          summary = summaryRes.content[0].type === 'text' ? summaryRes.content[0].text : '';
        } catch (e) {
          console.warn('[feedback] summary generation failed:', e);
        }

        sendFeedbackEmail({
          to:            feedbackEmail,
          childName:     child.name,
          childAge:      child.age,
          childLanguage: lang,
          parentEmail,
          childId,
          message:       emailMessage,
          summary,
          timestamp:     new Date().toISOString(),
        }).catch(console.error);
      }
    }

    const mascotId = await findOrCreateMascotId(rawMascot);

    let conversation = await db('conversations')
      .where({ child_id: childId, friend_id: mascotId })
      .first();
    if (!conversation) {
      [conversation] = await db('conversations')
        .insert({ child_id: childId, friend_id: mascotId })
        .returning('*');
    }

    await db('messages').insert({
      conversation_id: String(conversation.id),
      sender_id:       childId,
      sender_type:     'child',
      content:         content.trim(),
    });
    await db('messages').insert({
      conversation_id: String(conversation.id),
      sender_id:       mascotId,
      sender_type:     'ai',
      content:         result.text,
    });
    await db('conversations').where({ id: String(conversation.id) }).update({ updated_at: new Date() });

    res.json({ reply: result.text, mode });
  } catch (err) {
    console.error('[messages] mascotMessage error:', err);
    res.status(500).json({ error: 'Mascot reply failed' });
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
