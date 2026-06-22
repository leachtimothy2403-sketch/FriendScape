import { Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import db from '../db';
import { AuthRequest } from '../middleware/auth';
import {
  generatePersonalisedFriends,
  generateFriendNetwork,
  selectVoiceId,
} from '../services/ai.service';
import { toChildType } from '../utils/db-mappers';
import Anthropic from '@anthropic-ai/sdk';
import { generateFriendPortrait } from '../services/avatar.service';

// ─── Authed CRUD ──────────────────────────────────────────────────────────────

export async function getChildren(req: AuthRequest, res: Response) {
  try {
    const children = await db('children').where({ parent_id: req.userId });
    res.json({ children });
  } catch {
    res.status(500).json({ error: 'Failed to fetch children' });
  }
}

export async function createChild(req: AuthRequest, res: Response) {
  try {
    const {
      name, age, gender, language, specialNeeds, preReader,
      avatarTheme, mascot, interests, selectedPack,
    } = req.body;

    if (!name || !age) {
      res.status(400).json({ error: 'Name and age are required' });
      return;
    }

    const [child] = await db('children')
      .insert({
        parent_id: req.userId,
        name,
        age,
        gender:        gender || 'preferNotToSay',
        language:      language || 'en',
        special_needs: JSON.stringify(specialNeeds || []),
        pre_reader:    preReader || false,
        avatar_theme:  avatarTheme || 'animals',
        mascot:        mascot || 'luna',
        interests:     JSON.stringify(interests || []),
        selected_pack: selectedPack || null,
      })
      .returning('*');

    res.status(201).json({ child });
  } catch {
    res.status(500).json({ error: 'Failed to create child profile' });
  }
}

export async function getChild(req: AuthRequest, res: Response) {
  try {
    const child = await db('children')
      .where({ id: req.params.childId, parent_id: req.userId })
      .first();
    if (!child) {
      res.status(404).json({ error: 'Child not found' });
      return;
    }
    res.json({ child });
  } catch {
    res.status(500).json({ error: 'Failed to fetch child' });
  }
}

export async function updateChild(req: AuthRequest, res: Response) {
  try {
    const allowed = ['name', 'age', 'gender', 'language', 'special_needs', 'pre_reader',
      'avatar_theme', 'mascot', 'interests', 'selected_pack', 'avatar_url'];
    const updates: Record<string, unknown> = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }

    const [child] = await db('children')
      .where({ id: req.params.childId, parent_id: req.userId })
      .update({ ...updates, updated_at: db.fn.now() })
      .returning('*');

    if (!child) {
      res.status(404).json({ error: 'Child not found' });
      return;
    }
    res.json({ child });
  } catch {
    res.status(500).json({ error: 'Failed to update child profile' });
  }
}

export async function deleteChild(req: AuthRequest, res: Response) {
  try {
    const deleted = await db('children')
      .where({ id: req.params.childId, parent_id: req.userId })
      .delete();
    if (!deleted) {
      res.status(404).json({ error: 'Child not found' });
      return;
    }
    res.json({ message: 'Child profile deleted' });
  } catch {
    res.status(500).json({ error: 'Failed to delete child profile' });
  }
}

// ─── Onboarding: unauthed child creation via approved enrollment ──────────────

const AVATAR_THEME_MAP: Record<string, string> = {
  princess: 'fantasy',  astronaut: 'space',   cat:      'animals',
  superhero: 'fantasy', nature:    'jungle',   wizard:   'fantasy',
  artist:    'animals', dino:      'jungle',
};

const VALID_LANGUAGES = ['en', 'es', 'fr', 'de', 'pt', 'zh', 'ar'];

function parseAgeRange(ageRange: string): number {
  const match = ageRange.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : 8;
}

const DEFAULT_PARENT_SETTINGS = {
  alertsEnabled: true,
  weeklyReportEnabled: true,
  contentFilterLevel: 'strict',
  screenTimeLimitMinutes: 60,
  bedtimeLockEnabled: false,
  bedtimeLockStart: '20:00',
  bedtimeLockEnd: '07:00',
};

export async function createChildFromOnboarding(req: AuthRequest, res: Response) {
  try {
    const {
      parentEmail, name, age, gender, language,
      specialNeeds, specialNeedsDetails, preReader,
      avatarTheme, mascotId, interests, freeInterest,
      avatarPack,
      personalityTraits, personalityFreeText,
      avatarConfig, avatarBackground,
      cartoonUrl,
    } = req.body as Record<string, unknown>;

    // 1 & 2. Resolve parent — two paths depending on whether a parent JWT was supplied
    let parentUser: Record<string, unknown>;
    let enrollment: Record<string, unknown> | undefined;

    if (req.userId) {
      // PARENT-AUTHENTICATED PATH: JWT already verified by optionalAuth
      if (!name || !age) {
        res.status(400).json({ error: 'name and age are required' });
        return;
      }
      const found = await db('users').where({ id: req.userId }).first();
      if (!found) {
        res.status(401).json({ error: 'Parent account not found' });
        return;
      }
      parentUser = found as Record<string, unknown>;
    } else {
      // UNAUTHENTICATED PATH: enrollment-based flow (unchanged)
      if (!name || !age || !parentEmail) {
        res.status(400).json({ error: 'name, age, and parentEmail are required' });
        return;
      }

      // 2. Verify approved enrollment
      enrollment = await db('enrollments')
        .where({ parent_email: parentEmail as string, status: 'approved' })
        .first();
      if (!enrollment) {
        res.status(403).json({ error: 'Parent approval required — ask your parent to approve the Migo request first.' });
        return;
      }

      // 3. Find or create parent user account
      let found = await db('users').where({ email: parentEmail as string }).first();
      if (!found) {
        const tempPassword = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);
        [found] = await db('users')
          .insert({
            email:          parentEmail,
            display_name:   'Parent',
            password_hash:  tempPassword,
            email_verified: false,
            settings:       DEFAULT_PARENT_SETTINGS,
          })
          .returning('*');
      }
      parentUser = found as Record<string, unknown>;
    }

    // 4. Map and create child record
    const ageNum       = parseAgeRange(String(age));
    const mappedTheme  = AVATAR_THEME_MAP[String(avatarTheme) || ''] || 'animals';
    const mappedLang   = VALID_LANGUAGES.includes(String(language)) ? language : 'en';
    const mappedGender = String(gender) === 'other' ? 'nonbinary' :
                         String(gender) === 'girl'  ? 'girl'      :
                         String(gender) === 'boy'   ? 'boy'       : 'preferNotToSay';

    // Build special_needs array from both flags
    const needsArray: string[] = [];
    if (Array.isArray(specialNeedsDetails)) needsArray.push(...(specialNeedsDetails as string[]));
    if (preReader && !needsArray.includes('preReader')) needsArray.push('preReader');

    const traitsArray = Array.isArray(personalityTraits) ? (personalityTraits as string[]) : [];
    const freeText    = personalityFreeText ? String(personalityFreeText) : null;

    const [child] = await db('children')
      .insert({
        parent_id:             parentUser.id,
        name,
        age:                   ageNum,
        gender:                mappedGender,
        language:              mappedLang,
        special_needs:         JSON.stringify(needsArray),
        pre_reader:            Boolean(preReader),
        avatar_theme:          mappedTheme,
        mascot:                String(mascotId || 'miga'),
        interests:             JSON.stringify(Array.isArray(interests) ? interests : []),
        selected_pack:         String(avatarPack || ''),
        personality_traits:    traitsArray.length ? JSON.stringify(traitsArray) : null,
        personality_free_text: freeText,
        personality_completed: traitsArray.length > 0,
        avatar_config:         avatarConfig ? JSON.stringify(avatarConfig) : null,
        avatar_background:     avatarBackground ? String(avatarBackground) : null,
        avatar_url:            cartoonUrl ? String(cartoonUrl) : null,
      })
      .returning('*');

    // 5. Stamp enrollment (unauthenticated path only — no enrollment row in parent-auth path)
    if (enrollment) {
      await db('enrollments')
        .where({ id: enrollment.id })
        .update({ child_device_id: child.id });
    }

    // 6. Include free-interest note in logs if provided
    if (freeInterest) {
      console.log(`[onboarding] free interest note for ${child.id}: "${freeInterest}"`);
    }

    // 7. Generate 2 personalised AI friends via Claude
    // Guard: if friends already exist (double-fire from React strict mode), return them immediately
    const existingFriendsCheck = await db('child_friends')
      .where({ child_id: child.id })
      .count('* as count') as Array<{ count: string }>;

    if (Number(existingFriendsCheck[0].count) > 0) {
      const friends = await db('child_friends')
        .where({ child_id: child.id })
        .join('ai_friends', 'ai_friends.id', 'child_friends.friend_id')
        .select('ai_friends.*');
      return res.json({
        childId:         child.id,
        name:            child.name,
        mascotId:        child.mascot,
        assignedFriends: friends,
      });
    }

    const childObj = toChildType(child);
    const lang     = (child.language as string) || 'en';

    console.log(`[friends] 🤖 Generating personalised friends for ${childObj.name}...`);
    const genResult = await generatePersonalisedFriends(childObj, lang, 3);

    const assignedFriends: { id: string; name: string; coverEmojis: string; introMessage: string }[] = [];

    for (const gf of genResult.friends) {
      const voiceId = selectVoiceId(gf.gender, lang, gf.personality);
      console.log(`[voice] friend ${gf.name} gender=${gf.gender} voiceId=${voiceId}`);

      const [newFriend] = await db('ai_friends')
        .insert({
          name:               gf.name,
          age:                gf.age,
          gender:             gf.gender,
          bio:                gf.bio,
          personality:        JSON.stringify(gf.personality),
          interests:          JSON.stringify(gf.interests),
          match_tags:         JSON.stringify(gf.matchTags),
          cover_emojis:       gf.coverEmojis,
          personality_prompt: gf.personalityPrompt,
          relationship_type:  gf.relationshipType,
          is_star_friend:     false,
          is_teacher:         false,
          is_generated:       true,
          age_range_min:      Math.max(5, ageNum - 2),
          age_range_max:      Math.min(12, ageNum + 2),
          avatar_style:       'cartoon',
          teacher_subjects:   JSON.stringify([]),
          voice_id:           voiceId,
          voice_model:        lang === 'fr' ? 'eleven_multilingual_v2' : 'eleven_monolingual_v1',
        })
        .returning('*');

      generateFriendPortrait(gf.name, gf.age, gf.gender, gf.personality, lang)
        .then(url => db('ai_friends').where({ id: newFriend.id }).update({ avatar_url: url }))
        .catch(err => console.warn('[avatar] friend portrait failed:', err));

      await db('child_friends').insert({
        child_id:         child.id,
        friend_id:        newFriend.id,
        activated_at:     new Date(),
        friendship_level: 1,
        friendship_xp:    0,
      }).onConflict(['child_id', 'friend_id']).ignore();

      await db('child_memories').insert({
        child_id:          child.id,
        friend_id:         newFriend.id,
        facts:             JSON.stringify([]),
        emotional_history: JSON.stringify([]),
        milestones:        JSON.stringify(['Joined Migo!']),
        last_updated:      new Date(),
      }).onConflict(['child_id', 'friend_id']).ignore();

      assignedFriends.push({
        id:           newFriend.id as string,
        name:         gf.name,
        coverEmojis:  gf.coverEmojis,
        introMessage: gf.introMessage,
      });

      console.log(`[friends] ✅ Generated: ${gf.name} — "${gf.introMessage?.slice(0, 80)}" (voice: ${voiceId})`);

      // Generate friend network connections
      console.log(`[friends] 🌐 Generating network for ${gf.name}...`);
      const networkConnections = await generateFriendNetwork(
        { ...gf, id: newFriend.id as string },
        childObj,
        lang,
        assignedFriends.map((f) => ({
          id: f.id,
          name: f.name,
          interests: gf.interests,
        })),
      ).catch((err) => {
        console.error('[friends] ⚠️ Network generation failed:', err);
        return [];
      });

      let networkCount = 0;
      for (const conn of networkConnections) {
        if (conn.type === 'existing') {
          // Find matching friend by name from already-assigned friends
          const match = assignedFriends.find(
            (f) => f.name.toLowerCase() === (conn.friendName ?? '').toLowerCase(),
          );
          if (!match) continue;
          await db('ai_friend_network')
            .insert({
              ai_friend_id:             newFriend.id,
              connected_friend_id:      match.id,
              relationship_type:        conn.relationshipType,
              relationship_description: conn.relationshipDescription,
            })
            .onConflict(['ai_friend_id', 'connected_friend_id']).ignore();
          await db('ai_friend_network')
            .insert({
              ai_friend_id:             match.id,
              connected_friend_id:      newFriend.id,
              relationship_type:        conn.relationshipType,
              relationship_description: conn.relationshipDescription,
            })
            .onConflict(['ai_friend_id', 'connected_friend_id']).ignore();
          networkCount++;
        } else if (conn.type === 'new' && conn.name && conn.bio) {
          const [mini] = await db('ai_friends')
            .insert({
              name:               conn.name,
              bio:                conn.bio,
              cover_emojis:       conn.coverEmojis ?? '🌟',
              is_generated:       true,
              is_star_friend:     false,
              is_teacher:         false,
              personality:        JSON.stringify([]),
              interests:          JSON.stringify([]),
              match_tags:         JSON.stringify([]),
              personality_prompt: `You are ${conn.name}. ${conn.bio} Be warm and friendly.`,
              age_range_min:      Math.max(5, ageNum - 2),
              age_range_max:      Math.min(12, ageNum + 2),
              avatar_style:       'cartoon',
              teacher_subjects:   JSON.stringify([]),
              voice_id:           selectVoiceId('other', lang, []),
              voice_model:        lang === 'fr' ? 'eleven_multilingual_v2' : 'eleven_monolingual_v1',
            })
            .returning('*');
          generateFriendPortrait(conn.name, ageNum, 'other', [], lang)
            .then(url => db('ai_friends').where({ id: mini.id }).update({ avatar_url: url }))
            .catch(err => console.warn('[avatar] friend portrait failed (mini):', err));
          await db('ai_friend_network')
            .insert({
              ai_friend_id:             newFriend.id,
              connected_friend_id:      mini.id,
              relationship_type:        conn.relationshipType,
              relationship_description: conn.relationshipDescription,
            })
            .onConflict(['ai_friend_id', 'connected_friend_id']).ignore();
          networkCount++;
        }
      }
      console.log(`[friends] ✅ Network: ${networkCount} connections created for ${gf.name}`);
    }

    res.status(201).json({
      childId:        child.id,
      name:           child.name,
      mascotId:       child.mascot,
      avatarUrl:      (child.avatar_url as string | null) ?? null,
      assignedFriends,
    });

    // Delayed Miga DM introducing Ms. Luna (non-blocking — response already sent)
    const childLang     = (child.language as string) || 'en';
    const childIdStr    = String(child.id);
    const lunaIntroMsg  = childLang === 'fr'
      ? "Oh, encore une chose ! 🌟 Tu as rencontré Mme Luna ? C'est une amie spéciale qui aide avec les devoirs — les maths, la lecture, les sciences, tout ce dont tu as besoin. Elle rend l'apprentissage vraiment amusant ! Tu peux la trouver dans l'onglet Découvrir 📚"
      : "Oh, one more thing! 🌟 Have you met Ms. Luna yet? She's a special friend who helps with school stuff — maths, reading, science, whatever you need. She makes learning actually fun! You can find her in the Discover tab 📚";
    const introDelay    = process.env.NODE_ENV === 'development' ? 30_000 : 5 * 60 * 1000;

    setTimeout(() => {
      void import('../services/migaDM').then(({ sendMascotDM }) =>
        sendMascotDM(childIdStr, String(child.mascot || 'miga'), lunaIntroMsg)
          .then(() => console.log(`[luna] 📬 ${String(child.mascot)} intro DM sent to ${String(child.name)}`))
          .catch((e: unknown) => console.error('[luna] Mascot intro DM failed:', e)),
      );
    }, introDelay);

  } catch (err) {
    console.error('createChildFromOnboarding error:', err);
    res.status(500).json({ error: 'Failed to create child profile. Please try again.' });
  }
}

// ─── GET /children/me/screen-time-status ─────────────────────────────────────
export async function getScreenTimeStatus(req: AuthRequest, res: Response) {
  const childId = req.childId;
  if (!childId) { res.status(401).json({ error: 'Child authentication required' }); return; }

  try {
    const child = await db('children')
      .where({ id: childId })
      .select(
        'screen_time_limit_weekday_minutes',
        'screen_time_limit_weekend_minutes',
        'screen_time_extension_minutes',
        'screen_time_extension_date',
      )
      .first();

    if (!child) { res.status(404).json({ error: 'Child not found' }); return; }

    const day = new Date().getDay();
    const isWeekend = day === 0 || day === 6;
    const baseLimit: number | null = isWeekend
      ? child.screen_time_limit_weekend_minutes
      : child.screen_time_limit_weekday_minutes;

    if (baseLimit === null || baseLimit === undefined) {
      res.json({ limitEnabled: false, usedMinutes: 0, limitMinutes: null, limitExceeded: false });
      return;
    }

    const todayStr = new Date().toISOString().slice(0, 10);

    const usedRow = await db('child_sessions')
      .where({ child_id: childId })
      .whereRaw("date::date = ?", [todayStr])
      .sum('duration_minutes as total')
      .first();

    const used = Number(usedRow?.total ?? 0);

    const openSession = await db('child_sessions')
      .where({ child_id: req.childId, session_end: null })
      .whereRaw('date = CURRENT_DATE')
      .select(db.raw('EXTRACT(EPOCH FROM (NOW() - session_start)) / 60 as live_minutes'))
      .first();

    const liveMinutes = openSession ? Number((openSession as { live_minutes: string }).live_minutes) : 0;

    const extensionDate = child.screen_time_extension_date
      ? String(child.screen_time_extension_date).slice(0, 10)
      : null;
    const extensionMinutes = Number(child.screen_time_extension_minutes ?? 0);
    const extensionApplies = extensionDate === todayStr && extensionMinutes > 0;
    const effectiveLimit = baseLimit + (extensionApplies ? extensionMinutes : 0);

    const totalUsed = used + liveMinutes;

    res.json({
      limitEnabled:  true,
      usedMinutes:   Math.round(totalUsed),
      limitMinutes:  effectiveLimit,
      limitExceeded: totalUsed >= effectiveLimit,
    });
  } catch (err) {
    console.error('[session] getScreenTimeStatus error:', err);
    res.status(500).json({ error: 'Failed to fetch screen time status' });
  }
}

// ─── POST /children/session/start ────────────────────────────────────────────
export async function startSession(req: AuthRequest, res: Response) {
  const childId = req.childId;
  if (!childId) { res.status(401).json({ error: 'Child authentication required' }); return; }

  try {
    // Check if an open session from today already exists
    const existing = await db('child_sessions')
      .where({ child_id: childId, session_end: null })
      .whereRaw('date = CURRENT_DATE')
      .first();

    if (existing) {
      res.json({ sessionId: (existing as { id: string }).id });
      return;
    }

    // No open session from today; close any stale sessions from previous days
    await db('child_sessions')
      .where({ child_id: childId, session_end: null })
      .update({
        session_end:      db.fn.now(),
        duration_minutes: db.raw('EXTRACT(EPOCH FROM (NOW() - session_start)) / 60'),
      });

    const [session] = await db('child_sessions')
      .insert({ child_id: childId, date: db.fn.now() })
      .returning('id');

    res.json({ sessionId: (session as { id: string }).id });
  } catch (err) {
    console.error('[session] startSession error:', err);
    res.status(500).json({ error: 'Failed to start session' });
  }
}

// ─── POST /children/session/end ──────────────────────────────────────────────
export async function endSession(req: AuthRequest, res: Response) {
  const childId = req.childId;
  if (!childId) { res.status(401).json({ error: 'Child authentication required' }); return; }

  try {
    const updated = await db('child_sessions')
      .where({ child_id: childId, session_end: null })
      .update({
        session_end:      db.fn.now(),
        duration_minutes: db.raw('EXTRACT(EPOCH FROM (NOW() - session_start)) / 60'),
      })
      .returning('id');

    res.json({ ended: (updated as unknown[]).length });
  } catch (err) {
    console.error('[session] endSession error:', err);
    res.status(500).json({ error: 'Failed to end session' });
  }
}

// ─── GET /children/me/friends ────────────────────────────────────────────────
export async function getMyFriends(req: AuthRequest, res: Response) {
  const childId = req.childId;
  if (!childId) { res.status(401).json({ error: 'Child authentication required' }); return; }

  try {
    const friends = await db('child_friends')
      .join('ai_friends', 'ai_friends.id', 'child_friends.friend_id')
      .where({ 'child_friends.child_id': childId })
      .select('ai_friends.*', 'child_friends.friendship_level', 'child_friends.friendship_xp', 'child_friends.activated_at')
      .orderBy('child_friends.activated_at', 'asc');
    res.json({ friends });
  } catch (err) {
    console.error('[children] getMyFriends error:', err);
    res.status(500).json({ error: 'Failed to fetch friends' });
  }
}

// ─── GET /children/me/xp ──────────────────────────────────────────────────────
const XP_LEVELS: [number, string][] = [
  [0,    'Just Getting Started'],
  [100,  'Making Friends'],
  [300,  'Social Butterfly'],
  [600,  'Social Star'],
  [1000, 'Super BFF'],
  [1500, 'Legend'],
];

export async function getMyXP(req: AuthRequest, res: Response) {
  const childId = req.childId;
  if (!childId) { res.status(401).json({ error: 'Child authentication required' }); return; }

  try {
    const result = await db('child_friends')
      .where({ child_id: childId })
      .sum('friendship_xp as total_xp')
      .first();

    const totalXp = Math.max(0, Number((result as { total_xp: string | null })?.total_xp ?? 0));

    let level = 1;
    let levelName = XP_LEVELS[0][1];
    for (let i = XP_LEVELS.length - 1; i >= 0; i--) {
      if (totalXp >= XP_LEVELS[i][0]) {
        level     = i + 1;
        levelName = XP_LEVELS[i][1];
        break;
      }
    }

    const nextThreshold = level < XP_LEVELS.length ? XP_LEVELS[level][0] : null;
    const xpToNext      = nextThreshold !== null ? Math.max(0, nextThreshold - totalXp) : 0;

    res.json({
      total_xp:             totalXp,
      level,
      level_name:           levelName,
      xp_to_next_level:     xpToNext,
      next_level_threshold: nextThreshold,
    });
  } catch (err) {
    console.error('[xp] getMyXP error:', err);
    res.status(500).json({ error: 'Failed to fetch XP' });
  }
}

// ─── Profile helpers ─────────────────────────────────────────────────────────

const FRIENDSHIP_LEVELS: [number, string][] = [
  [0,    'New Friends'],
  [100,  'Good Friends'],
  [300,  'Close Friends'],
  [600,  'Best Friends'],
  [1000, 'Super BFF'],
  [1500, 'Legendary Friends'],
];

function getFriendshipInfo(level: number, xp: number): { levelName: string; xpToNext: number } {
  const levelName    = (FRIENDSHIP_LEVELS[Math.min(level - 1, FRIENDSHIP_LEVELS.length - 1)] ?? FRIENDSHIP_LEVELS[0])[1];
  const nextThreshold = level < FRIENDSHIP_LEVELS.length ? FRIENDSHIP_LEVELS[level][0] : null;
  return {
    levelName,
    xpToNext: nextThreshold !== null ? Math.max(0, nextThreshold - xp) : 0,
  };
}

function makeMemoryId(type: string, text: string, date: string): string {
  return crypto.createHash('sha1').update(`${type}:${text}:${date}`).digest('hex').slice(0, 16);
}

// ─── GET /children/me/graduation ─────────────────────────────────────────────
export async function getMyGraduation(req: AuthRequest, res: Response) {
  const childId = req.childId;
  if (!childId) { res.status(401).json({ error: 'Child authentication required' }); return; }

  try {
    const { getGraduationProgress } = await import('../services/graduationTrack');
    const progress = await getGraduationProgress(childId);

    // Award Graduate badge automatically when all milestones complete
    if (progress.allComplete) {
      const { sendMascotDM } = await import('../services/migaDM');
      const graduateBadge = await db('badge_definitions')
        .where({ trigger_type: 'graduation' })
        .first() as Record<string, unknown> | undefined;

      if (graduateBadge) {
        const alreadyEarned = await db('child_badges')
          .where({ child_id: childId, badge_id: graduateBadge.id as string })
          .first();

        if (!alreadyEarned) {
          await db('child_badges')
            .insert({ child_id: childId, badge_id: graduateBadge.id as string })
            .onConflict(['child_id', 'badge_id']).ignore();

          const childRow = await db('children').where({ id: childId }).first();
          const lang = (childRow?.language as string) === 'fr' ? 'fr' : 'en';
          const gender = (childRow?.gender as string)?.toLowerCase();
          const lumiMsg = lang === 'fr'
            ? (graduateBadge.lumi_message_fr ?? graduateBadge.lumi_message) as string | null
            : graduateBadge.lumi_message as string | null;

          const childName = String(childRow?.name ?? (lang === 'fr' ? 'Votre enfant' : 'Your child'));
          let alertMsg: string;
          if (lang === 'fr') {
            const pronoun = gender === 'girl' ? 'Elle' : 'Il';
            const adjective = gender === 'girl' ? 'prête' : 'prêt';
            const badgeName = (graduateBadge.name_fr ?? graduateBadge.name) as string;
            alertMsg = `${childName} a obtenu le badge ${badgeName} ! ${pronoun} est ${adjective} pour le monde réel ! 🎓`;
          } else {
            alertMsg = `${childName} has earned the Graduation badge! They are ready for the real world! 🎓`;
          }

          if (lumiMsg) await sendMascotDM(childId, String(childRow?.mascot || 'miga'), lumiMsg).catch(() => {});

          await db('parent_alerts').insert({
            child_id: childId,
            type:     'milestone',
            message:  alertMsg,
            severity: 'info',
          }).catch(() => {});
        }
      }
    }

    res.json(progress);
  } catch (err) {
    console.error('[graduation] getMyGraduation error:', err);
    res.status(500).json({ error: 'Failed to fetch graduation progress' });
  }
}

// ─── GET /children/me/profile ─────────────────────────────────────────────────
export async function getMyProfile(req: AuthRequest, res: Response) {
  const childId = req.childId;
  if (!childId) { res.status(401).json({ error: 'Child authentication required' }); return; }

  try {
    const child = await db('children').where({ id: childId }).first();
    if (!child) { res.status(404).json({ error: 'Child not found' }); return; }

    const [postsCount, friendsCount, badgesCount, xpResult] = await Promise.all([
      db('posts').where({ author_id: childId, author_type: 'child' }).count('id as count').first(),
      db('child_friends').where({ child_id: childId }).count('friend_id as count').first(),
      db('child_badges').where({ child_id: childId }).count('id as count').first(),
      db('child_friends').where({ child_id: childId }).sum('friendship_xp as total_xp').first(),
    ]);

    const totalXp = Math.max(0, Number((xpResult as { total_xp: string | null } | undefined)?.total_xp ?? 0));
    let level = 1;
    let levelName = XP_LEVELS[0][1];
    for (let i = XP_LEVELS.length - 1; i >= 0; i--) {
      if (totalXp >= XP_LEVELS[i][0]) { level = i + 1; levelName = XP_LEVELS[i][1]; break; }
    }

    const avatarConfig = child.avatar_config
      ? (typeof child.avatar_config === 'object' ? child.avatar_config : JSON.parse(child.avatar_config as string))
      : null;

    res.json({
      id:              child.id,
      name:            child.name,
      age:             child.age,
      gender:          child.gender,
      language:        child.language,
      avatarTheme:     child.avatar_theme,
      mascotId:        child.mascot,
      interests:       Array.isArray(child.interests) ? child.interests : JSON.parse(child.interests as string || '[]'),
      bio:             (child.bio as string | null) ?? null,
      avatarConfig:    avatarConfig,
      avatarBackground:(child.avatar_background as string) ?? null,
      avatarUrl:       (child.avatar_url as string | null) ?? null,
      stats: {
        totalPosts:   Number((postsCount   as { count: string } | undefined)?.count   ?? 0),
        totalFriends: Number((friendsCount as { count: string } | undefined)?.count   ?? 0),
        totalBadges:  Number((badgesCount  as { count: string } | undefined)?.count   ?? 0),
        memberSince:  child.created_at as string,
        level,
        levelName,
      },
    });
  } catch (err) {
    console.error('[profile] getMyProfile error:', err);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
}

// ─── PATCH /children/me/profile ───────────────────────────────────────────────
export async function updateMyProfile(req: AuthRequest, res: Response) {
  const childId = req.childId;
  if (!childId) { res.status(401).json({ error: 'Child authentication required' }); return; }

  try {
    const { bio, interests } = req.body as { bio?: string; interests?: string[] };
    const updates: Record<string, unknown> = { updated_at: db.fn.now() };

    if (bio !== undefined) {
      if (typeof bio !== 'string' || bio.length > 100) {
        res.status(400).json({ error: 'Bio must be 100 characters or fewer' });
        return;
      }
      updates.bio = bio;
    }

    if (interests !== undefined) {
      if (!Array.isArray(interests)) {
        res.status(400).json({ error: 'Interests must be an array' });
        return;
      }
      updates.interests = JSON.stringify(interests);
    }

    const [child] = await db('children').where({ id: childId }).update(updates).returning('*');
    if (!child) { res.status(404).json({ error: 'Child not found' }); return; }

    if (interests !== undefined) {
      await db('child_memories')
        .where({ child_id: childId })
        .update({
          milestones:   db.raw("milestones || ?::jsonb", [JSON.stringify(['Updated their interests on Migo'])]),
          last_updated: db.fn.now(),
        })
        .catch(() => {});
    }

    res.json({
      id:          child.id,
      name:        child.name,
      age:         child.age,
      gender:      child.gender,
      language:    child.language,
      avatarTheme: child.avatar_theme,
      mascotId:    child.mascot,
      interests:   Array.isArray(child.interests) ? child.interests : JSON.parse(child.interests as string || '[]'),
      bio:         (child.bio as string | null) ?? null,
    });
  } catch (err) {
    console.error('[profile] updateMyProfile error:', err);
    res.status(500).json({ error: 'Failed to update profile' });
  }
}

// ─── GET /children/me/memories ────────────────────────────────────────────────
export async function getMyMemories(req: AuthRequest, res: Response) {
  const childId = req.childId;
  if (!childId) { res.status(401).json({ error: 'Child authentication required' }); return; }

  try {
    const [child, memoryRows, badgeRows, friendRows, firstPost] = await Promise.all([
      db('children').where({ id: childId }).first(),
      db('child_memories').where({ child_id: childId }),
      db('child_badges')
        .join('badge_definitions', 'badge_definitions.id', 'child_badges.badge_id')
        .where({ 'child_badges.child_id': childId })
        .select('badge_definitions.name', 'badge_definitions.icon', 'child_badges.earned_at'),
      db('child_friends')
        .join('ai_friends', 'ai_friends.id', 'child_friends.friend_id')
        .where({ 'child_friends.child_id': childId })
        .select('ai_friends.name', 'child_friends.friendship_level', 'child_friends.activated_at'),
      db('posts')
        .where({ author_id: childId, author_type: 'child' })
        .orderBy('created_at', 'asc')
        .first(),
    ]);

    type Item = { id: string; type: string; text: string; date: string; icon: string };
    const items: Item[] = [];

    // a. child_memories — milestones + emotional_history
    for (const mem of (memoryRows as Record<string, unknown>[])) {
      const dateStr   = new Date(mem.last_updated as string).toISOString();
      const mils      = Array.isArray(mem.milestones) ? (mem.milestones as unknown[]) : JSON.parse(mem.milestones as string || '[]') as unknown[];
      const emotions  = Array.isArray(mem.emotional_history) ? (mem.emotional_history as unknown[]) : JSON.parse(mem.emotional_history as string || '[]') as unknown[];

      for (const m of mils) {
        const text = typeof m === 'string' ? m : String((m as Record<string, unknown>).text ?? m);
        items.push({ id: makeMemoryId('milestone', text, dateStr), type: 'milestone', text, date: dateStr, icon: '🌟' });
      }
      for (const e of emotions) {
        const text = typeof e === 'string' ? e : String((e as Record<string, unknown>).text ?? (e as Record<string, unknown>).message ?? e);
        items.push({ id: makeMemoryId('emotional', text, dateStr), type: 'emotional', text, date: dateStr, icon: '💛' });
      }
    }

    // b. badges
    for (const badge of (badgeRows as Record<string, unknown>[])) {
      const text    = `Earned the ${badge.name as string} badge ${badge.icon as string}`;
      const dateStr = new Date(badge.earned_at as string).toISOString();
      items.push({ id: makeMemoryId('badge', text, dateStr), type: 'badge', text, date: dateStr, icon: '🏆' });
    }

    // c. friendships
    for (const f of (friendRows as Record<string, unknown>[])) {
      const dateStr    = f.activated_at ? new Date(f.activated_at as string).toISOString() : new Date().toISOString();
      const becomeTxt  = `Became friends with ${f.name as string}`;
      items.push({ id: makeMemoryId('friendship', becomeTxt, dateStr), type: 'friendship', text: becomeTxt, date: dateStr, icon: '💜' });
      if ((f.friendship_level as number) > 1) {
        const levelTxt = `Reached Level ${f.friendship_level as number} with ${f.name as string}!`;
        items.push({ id: makeMemoryId('friendship', levelTxt, dateStr), type: 'friendship', text: levelTxt, date: dateStr, icon: '💜' });
      }
    }

    // d. joined Migo
    if (child) {
      const joinedDate = new Date((child as Record<string, unknown>).created_at as string).toISOString();
      items.push({ id: makeMemoryId('milestone', 'Joined Migo! 🌟', joinedDate), type: 'milestone', text: 'Joined Migo! 🌟', date: joinedDate, icon: '🌟' });
    }

    // e. first post
    if (firstPost) {
      const postDate = new Date((firstPost as Record<string, unknown>).created_at as string).toISOString();
      items.push({ id: makeMemoryId('milestone', 'Shared their very first post! 🎨', postDate), type: 'milestone', text: 'Shared their very first post! 🎨', date: postDate, icon: '🌟' });
    }

    items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    res.json({ memories: items.slice(0, 50) });
  } catch (err) {
    console.error('[profile] getMyMemories error:', err);
    res.status(500).json({ error: 'Failed to fetch memories' });
  }
}

// ─── GET /children/me/posts ───────────────────────────────────────────────────
export async function getMyPosts(req: AuthRequest, res: Response) {
  const childId = req.childId;
  if (!childId) { res.status(401).json({ error: 'Child authentication required' }); return; }

  try {
    const postRows = await db('posts')
      .where({ author_id: childId, author_type: 'child' })
      .select('id', 'content', 'mood', 'scene_emojis', 'created_at')
      .orderBy('created_at', 'desc') as Record<string, unknown>[];

    const postIds = postRows.map(p => p.id as string);
    const reactionMap: Record<string, number> = {};

    if (postIds.length > 0) {
      const counts = await db('post_reactions')
        .whereIn('post_id', postIds)
        .groupBy('post_id')
        .select('post_id')
        .count('id as count') as Record<string, unknown>[];
      for (const row of counts) {
        reactionMap[row.post_id as string] = Number(row.count);
      }
    }

    res.json({ posts: postRows.map(p => ({ ...p, reaction_count: reactionMap[p.id as string] ?? 0 })) });
  } catch (err) {
    console.error('[profile] getMyPosts error:', err);
    res.status(500).json({ error: 'Failed to fetch posts' });
  }
}

// ─── POST /children/me/regenerate-friends ────────────────────────────────────
export async function regenerateFriends(req: AuthRequest, res: Response) {
  const childId = req.childId;
  if (!childId) { res.status(401).json({ error: 'Child authentication required' }); return; }

  try {
    const childRow = await db('children').where({ id: childId }).first();
    if (!childRow) { res.status(404).json({ error: 'Child not found' }); return; }

    const regenCount = Number(childRow.regeneration_count ?? 0);
    if (regenCount >= 3) {
      res.status(429).json({
        error: 'Maximum regenerations reached',
        message: "You have already met lots of great friends! Give them a chance 😊",
      });
      return;
    }

    // Delete existing non-star generated friends
    const generatedFriendIds = await db('child_friends as cf')
      .join('ai_friends as af', 'af.id', 'cf.friend_id')
      .where('cf.child_id', childId)
      .where('af.is_generated', true)
      .where('af.is_star_friend', false)
      .select('af.id') as Array<{ id: string }>;

    for (const { id: fid } of generatedFriendIds) {
      await db('child_friends').where({ child_id: childId, friend_id: fid }).delete();
      await db('ai_friends').where({ id: fid, is_generated: true, is_star_friend: false }).delete();
    }

    // Increment regeneration_count
    await db('children').where({ id: childId }).update({
      regeneration_count: regenCount + 1,
    });

    const child  = toChildType(childRow);
    const lang   = (childRow.language as string) || 'en';
    const ageNum = Number(childRow.age);

    console.log(`[friends] 🔄 Regenerating friends for ${child.name} (attempt ${regenCount + 1})`);
    const genResult = await generatePersonalisedFriends(child, lang, 2);

    const assignedFriends: { id: string; name: string; coverEmojis: string; introMessage: string }[] = [];

    for (const gf of genResult.friends) {
      const voiceId = selectVoiceId(gf.gender, lang, gf.personality);
      console.log(`[voice] friend ${gf.name} gender=${gf.gender} voiceId=${voiceId}`);

      const [newFriend] = await db('ai_friends')
        .insert({
          name:               gf.name,
          age:                gf.age,
          gender:             gf.gender,
          bio:                gf.bio,
          personality:        JSON.stringify(gf.personality),
          interests:          JSON.stringify(gf.interests),
          match_tags:         JSON.stringify(gf.matchTags),
          cover_emojis:       gf.coverEmojis,
          personality_prompt: gf.personalityPrompt,
          relationship_type:  gf.relationshipType,
          is_star_friend:     false,
          is_teacher:         false,
          is_generated:       true,
          age_range_min:      Math.max(5, ageNum - 2),
          age_range_max:      Math.min(12, ageNum + 2),
          avatar_style:       'cartoon',
          teacher_subjects:   JSON.stringify([]),
          voice_id:           voiceId,
          voice_model:        lang === 'fr' ? 'eleven_multilingual_v2' : 'eleven_monolingual_v1',
        })
        .returning('*');

      generateFriendPortrait(gf.name, gf.age, gf.gender, gf.personality, lang)
        .then(url => db('ai_friends').where({ id: newFriend.id }).update({ avatar_url: url }))
        .catch(err => console.warn('[avatar] friend portrait failed:', err));

      await db('child_friends').insert({
        child_id:         childId,
        friend_id:        newFriend.id,
        activated_at:     new Date(),
        friendship_level: 1,
        friendship_xp:    0,
      }).onConflict(['child_id', 'friend_id']).ignore();

      await db('child_memories').insert({
        child_id:          childId,
        friend_id:         newFriend.id,
        facts:             JSON.stringify([]),
        emotional_history: JSON.stringify([]),
        milestones:        JSON.stringify(['Joined Migo!']),
        last_updated:      new Date(),
      }).onConflict(['child_id', 'friend_id']).ignore();

      assignedFriends.push({
        id:           newFriend.id as string,
        name:         gf.name,
        coverEmojis:  gf.coverEmojis,
        introMessage: gf.introMessage,
      });

      console.log(`[friends] ✅ Regenerated: ${gf.name}`);
    }

    res.json({
      assignedFriends,
      regenerationCount: regenCount + 1,
    });
  } catch (err) {
    console.error('[friends] regenerateFriends error:', err);
    res.status(500).json({ error: 'Failed to regenerate friends' });
  }
}

// ─── POST /children/me/interests/validate ────────────────────────────────────
export async function validateInterest(req: AuthRequest, res: Response) {
  const childId = req.childId;
  if (!childId) { res.status(401).json({ error: 'Child authentication required' }); return; }

  const { text } = req.body as { text?: string };
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    res.status(400).json({ safe: false, reason: 'Please type something first' });
    return;
  }
  const trimmed = text.trim();
  if (trimmed.length > 30) {
    res.status(400).json({ safe: false, reason: 'Keep it under 30 characters' });
    return;
  }

  try {
    const { moderateInterest } = await import('../services/ai.service');
    const result = await moderateInterest(trimmed);
    res.json(result);
  } catch (err) {
    console.error('[interest] validateInterest error:', err);
    res.json({ safe: false, reason: "Couldn't check that right now — please try again." });
  }
}

// ─── GET /children/me/friends-list ───────────────────────────────────────────
export async function getMyFriendsList(req: AuthRequest, res: Response) {
  const childId = req.childId;
  if (!childId) { res.status(401).json({ error: 'Child authentication required' }); return; }

  try {
    const friendRows = await db('child_friends as cf')
      .join('ai_friends as af', 'af.id', 'cf.friend_id')
      .where('cf.child_id', childId)
      .select(
        'af.id', 'af.name', 'af.bio', 'af.bio_fr', 'af.cover_emojis', 'af.avatar_url',
        'af.personality', 'af.interests', 'af.is_star_friend',
        'af.is_teacher', 'af.age', 'af.gender', 'af.relationship_type',
        'cf.friendship_level', 'cf.friendship_xp', 'cf.activated_at',
        db.raw(`(
          SELECT MAX(m.created_at)
          FROM messages m
          JOIN conversations c ON c.id = m.conversation_id
          WHERE c.child_id = ? AND c.friend_id = af.id
        ) AS last_message_at`, [childId]),
      )
      .orderByRaw('last_message_at DESC NULLS LAST') as Record<string, unknown>[];

    const language = req.query.language as string | undefined;
    const friends = friendRows.map(f => {
      const { levelName, xpToNext } = getFriendshipInfo(f.friendship_level as number, f.friendship_xp as number);
      const { bio_fr, ...rest } = f;
      const bio = language === 'fr' && bio_fr ? bio_fr : f.bio;
      return { ...rest, bio, level_name: levelName, xp_to_next_level: xpToNext };
    });

    res.json({ friends });
  } catch (err) {
    console.error('[profile] getMyFriendsList error:', err);
    res.status(500).json({ error: 'Failed to fetch friends list' });
  }
}

// ─── DELETE /children/me/friends/:friendId ───────────────────────────────────
export async function removeMyFriend(req: AuthRequest, res: Response) {
  const childId = req.childId;
  if (!childId) { res.status(401).json({ error: 'Child authentication required' }); return; }

  try {
    await db('child_friends').where({ child_id: childId, friend_id: req.params.friendId }).delete();
    res.json({ success: true });
  } catch (err) {
    console.error('[friends] removeMyFriend error:', err);
    res.status(500).json({ error: 'Failed to remove friend' });
  }
}

// ─── GET /children/me/avatar ──────────────────────────────────────────────────
export async function getMyAvatar(req: AuthRequest, res: Response) {
  const childId = req.childId;
  if (!childId) { res.status(401).json({ error: 'Child authentication required' }); return; }

  try {
    const child = await db('children').where({ id: childId }).first();
    if (!child) { res.status(404).json({ error: 'Child not found' }); return; }

    const avatarConfig = child.avatar_config
      ? (typeof child.avatar_config === 'object' ? child.avatar_config : JSON.parse(child.avatar_config as string))
      : null;

    res.json({ avatarConfig, avatarBackground: (child.avatar_background as string) ?? null });
  } catch (err) {
    console.error('[avatar] getMyAvatar error:', err);
    res.status(500).json({ error: 'Failed to fetch avatar' });
  }
}

// ─── PUT /children/me/avatar ──────────────────────────────────────────────────
export async function saveMyAvatar(req: AuthRequest, res: Response) {
  const childId = req.childId;
  if (!childId) { res.status(401).json({ error: 'Child authentication required' }); return; }

  const { avatarConfig, avatarBackground } = req.body as { avatarConfig?: unknown; avatarBackground?: string };

  if (!avatarConfig || typeof avatarConfig !== 'object') {
    res.status(400).json({ error: 'avatarConfig is required and must be an object' });
    return;
  }

  try {
    const [child] = await db('children')
      .where({ id: childId })
      .update({
        avatar_config:      JSON.stringify(avatarConfig),
        avatar_background:  avatarBackground ?? null,
        updated_at:         db.fn.now(),
      })
      .returning('*');

    if (!child) { res.status(404).json({ error: 'Child not found' }); return; }

    const stored = typeof child.avatar_config === 'object'
      ? child.avatar_config
      : JSON.parse(child.avatar_config as string);

    res.json({ success: true, avatarConfig: stored, avatarBackground: child.avatar_background ?? null });
  } catch (err) {
    console.error('[avatar] saveMyAvatar error:', err);
    res.status(500).json({ error: 'Failed to save avatar' });
  }
}

