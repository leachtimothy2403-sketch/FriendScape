import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import db from '../db';
import { AuthRequest } from '../middleware/auth';

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

export async function createChildFromOnboarding(req: Request, res: Response) {
  try {
    const {
      parentEmail, name, age, gender, language,
      specialNeeds, specialNeedsDetails, preReader,
      avatarTheme, mascotId, interests, freeInterest,
      avatarPack, selectedFriendId,
    } = req.body as Record<string, unknown>;

    // 1. Validate required fields
    if (!name || !age || !parentEmail) {
      res.status(400).json({ error: 'name, age, and parentEmail are required' });
      return;
    }

    // 2. Verify approved enrollment
    const enrollment = await db('enrollments')
      .where({ parent_email: parentEmail as string, status: 'approved' })
      .first();
    if (!enrollment) {
      res.status(403).json({ error: 'Parent approval required — ask your parent to approve the Migo request first.' });
      return;
    }

    // 3. Find or create parent user account
    let parentUser = await db('users').where({ email: parentEmail as string }).first();
    if (!parentUser) {
      const tempPassword = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);
      [parentUser] = await db('users')
        .insert({
          email:          parentEmail,
          display_name:   'Parent',
          password_hash:  tempPassword,
          email_verified: false,
          settings:       DEFAULT_PARENT_SETTINGS,
        })
        .returning('*');
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

    const [child] = await db('children')
      .insert({
        parent_id:     parentUser.id,
        name,
        age:           ageNum,
        gender:        mappedGender,
        language:      mappedLang,
        special_needs: JSON.stringify(needsArray),
        pre_reader:    Boolean(preReader),
        avatar_theme:  mappedTheme,
        mascot:        String(mascotId || 'miga'),
        interests:     JSON.stringify(Array.isArray(interests) ? interests : []),
        selected_pack: String(avatarPack || ''),
      })
      .returning('*');

    // 5. Link selected friend + seed initial friendship
    if (selectedFriendId) {
      await db('child_friends')
        .insert({
          child_id:         child.id,
          friend_id:        selectedFriendId,
          activated_at:     new Date(),
          friendship_level: 1,
          friendship_xp:    0,
        })
        .onConflict(['child_id', 'friend_id'])
        .ignore();

      // 6. Create initial memory record
      await db('child_memories')
        .insert({
          child_id:         child.id,
          friend_id:        selectedFriendId,
          facts:            JSON.stringify([]),
          emotional_history: JSON.stringify([]),
          milestones:       JSON.stringify(['Joined Migo!']),
          last_updated:     new Date(),
        })
        .onConflict(['child_id', 'friend_id'])
        .ignore();
    }

    // 7. Stamp enrollment with child id
    await db('enrollments')
      .where({ id: enrollment.id })
      .update({ child_device_id: child.id });

    // 8. Fetch selected friend for summary
    const friend = selectedFriendId
      ? await db('ai_friends').where({ id: selectedFriendId }).first()
      : null;

    // 9. Include free-interest note in interests if provided
    if (freeInterest) {
      console.log(`[onboarding] free interest note for ${child.id}: "${freeInterest}"`);
    }

    res.status(201).json({
      childId: child.id,
      name:    child.name,
      mascotId: child.mascot,
      selectedFriend: friend
        ? { id: friend.id, name: friend.name, coverEmojis: friend.cover_emojis || '🌟' }
        : null,
    });
  } catch (err) {
    console.error('createChildFromOnboarding error:', err);
    res.status(500).json({ error: 'Failed to create child profile. Please try again.' });
  }
}

// ─── POST /children/session/start ────────────────────────────────────────────
export async function startSession(req: AuthRequest, res: Response) {
  const childId = req.childId;
  if (!childId) { res.status(401).json({ error: 'Child authentication required' }); return; }

  try {
    // Close any open sessions first
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

// ─── GET /children/me/graduation ─────────────────────────────────────────────
export async function getMyGraduation(req: AuthRequest, res: Response) {
  const childId = req.childId;
  if (!childId) { res.status(401).json({ error: 'Child authentication required' }); return; }

  try {
    const { getGraduationProgress } = await import('../services/graduationTrack');
    const progress = await getGraduationProgress(childId);

    // Award Graduate badge automatically when all milestones complete
    if (progress.allComplete) {
      const { sendMigaDM } = await import('../services/migaDM');
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
          const lumiMsg = lang === 'fr'
            ? (graduateBadge.lumi_message_fr ?? graduateBadge.lumi_message) as string | null
            : graduateBadge.lumi_message as string | null;

          if (lumiMsg) await sendMigaDM(childId, lumiMsg).catch(() => {});

          await db('parent_alerts').insert({
            child_id: childId,
            type:     'milestone',
            message:  `${String(childRow?.name ?? 'Your child')} has earned the Graduation badge! They are ready for the real world! 🎓`,
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
