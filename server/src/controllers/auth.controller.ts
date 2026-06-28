import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import db from '../db';
import {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendApprovalEmail,
} from '../services/email.service';
import { AuthRequest } from '../middleware/auth';
import redis from '../services/redis.service';
import { generateFriendPortrait, generateAdultFriendPortrait, generateLunaPortrait } from '../services/avatar.service';

export async function register(req: Request, res: Response) {
  try {
    const { email, displayName, password } = req.body;
    if (!email || !displayName || !password) {
      res.status(400).json({ error: 'Email, display name, and password are required' });
      return;
    }

    const existing = await db('users').where({ email }).first();
    if (existing) {
      res.status(409).json({ error: 'An account with this email already exists' });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const defaultSettings = {
      alertsEnabled: true,
      weeklyReportEnabled: true,
      contentFilterLevel: 'strict',
      screenTimeLimitMinutes: 60,
      bedtimeLockEnabled: false,
      bedtimeLockStart: '20:00',
      bedtimeLockEnd: '07:00',
    };

    const [user] = await db('users')
      .insert({ email, display_name: displayName, password_hash: passwordHash, settings: defaultSettings })
      .returning(['id', 'email', 'display_name', 'email_verified', 'created_at']);

    void sendVerificationEmail;

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET!, { expiresIn: '7d' });
    res.status(201).json({ token, user });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Registration failed' });
  }
}

export async function login(req: Request, res: Response) {
  try {
    const { email, password } = req.body;
    const user = await db('users').where({ email }).first();
    if (!user) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email, type: 'parent' },
      process.env.JWT_SECRET!,
      { expiresIn: '30d' },
    );
    const language = (user.settings as Record<string, unknown>)?.language as string ?? 'en';
    res.json({
      token,
      language,
      user: { id: user.id, email: user.email, displayName: user.display_name },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
}

export async function logout(_req: AuthRequest, res: Response) {
  res.json({ message: 'Logged out successfully' });
}

export async function refreshToken(req: Request, res: Response) {
  res.status(501).json({ error: 'Refresh token not yet implemented' });
}

export async function forgotPassword(req: Request, res: Response) {
  try {
    const { email } = req.body;
    const user = await db('users').where({ email }).first();
    if (user) {
      void sendPasswordResetEmail;
    }
    res.json({ message: 'If that email is registered, a reset link is on its way.' });
  } catch (err) {
    res.status(500).json({ error: 'Password reset failed' });
  }
}

export async function resetPassword(req: Request, res: Response) {
  res.status(501).json({ error: 'Reset password not yet implemented' });
}

export async function verifyEmail(req: Request, res: Response) {
  res.status(501).json({ error: 'Email verification not yet implemented' });
}

// ─── Child session ────────────────────────────────────────────────────────────

export async function childLogin(req: Request, res: Response) {
  try {
    const { childId } = req.body as { childId?: string };
    if (!childId) {
      res.status(400).json({ error: 'childId is required' });
      return;
    }
    const child = await db('children').where({ id: childId }).first();
    if (!child) {
      res.status(404).json({ error: 'Child not found' });
      return;
    }
    const token = jwt.sign({ childId }, process.env.JWT_SECRET!, { expiresIn: '90d' });
    res.json({ token, child });
  } catch (err) {
    console.error('childLogin error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
}

// ─── Enrollment flow ──────────────────────────────────────────────────────────

export async function enroll(req: Request, res: Response) {
  const { parentEmail, language } = req.body as { parentEmail?: string; language?: string };

  if (!parentEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(parentEmail)) {
    res.status(400).json({ error: 'Please enter a valid email address' });
    return;
  }

  const approved = await db('enrollments')
    .where({ parent_email: parentEmail, status: 'approved' })
    .first();
  if (approved) {
    res.json({ status: 'already_approved' });
    return;
  }

  const approvalToken = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

  await db('enrollments').insert({
    parent_email: parentEmail,
    approval_token: approvalToken,
    status: 'pending',
    expires_at: expiresAt,
    language: language ?? 'en',
  });

  // Send response immediately
  res.json({ status: 'pending', message: 'Approval email sent' });

  // Fire and forget the email
  sendApprovalEmail(parentEmail, approvalToken, undefined, language).catch((emailErr) => {
    console.error('Failed to send approval email (enrollment still created):', emailErr);
  });
}

export async function approve(req: Request, res: Response) {
  try {
    const { token } = req.query as { token?: string };

    if (!token) {
      res.send(expiredHtml('Invalid approval link.'));
      return;
    }

    const enrollment = await db('enrollments').where({ approval_token: token }).first();

    if (!enrollment || new Date() > new Date(enrollment.expires_at)) {
      res.send(expiredHtml());
      return;
    }

    await db('enrollments')
      .where({ approval_token: token })
      .update({ status: 'approved', approved_at: new Date() });

    res.send(approvedHtml(token));
  } catch (err) {
    console.error('Approve error:', err);
    res.status(500).send('<h1>Something went wrong. Please try again.</h1>');
  }
}

export async function decline(req: Request, res: Response) {
  try {
    const { token } = req.query as { token?: string };

    if (token) {
      await db('enrollments')
        .where({ approval_token: token })
        .update({ status: 'expired' });
    }

    res.send(declinedHtml());
  } catch (err) {
    console.error('Decline error:', err);
    res.status(500).send('<h1>Something went wrong.</h1>');
  }
}

export async function enrollmentStatus(req: Request, res: Response) {
  try {
    const { parentEmail } = req.query as { parentEmail?: string };

    if (!parentEmail) {
      res.status(400).json({ error: 'parentEmail is required' });
      return;
    }

    const enrollment = await db('enrollments')
      .where({ parent_email: parentEmail })
      .orderBy('created_at', 'desc')
      .first();

    const parentUser = enrollment ? await db('users').where({ email: enrollment.parent_email }).first() : null;
    const parentLanguage = parentUser ? (parentUser.settings as Record<string, unknown>)?.language as string ?? null : null;

    if (!enrollment) {
      res.json({ status: 'pending', parentLanguage });
      return;
    }

    if (enrollment.status === 'approved') {
      // Only tell the child app they're approved once the parent has signed consent
      if (!enrollment.consent_accepted_at) {
        res.json({ status: 'pending', parentLanguage });
        return;
      }
      res.json({ status: 'approved', parentLanguage });
      return;
    }

    if (new Date() > new Date(enrollment.expires_at)) {
      res.json({ status: 'expired', parentLanguage });
      return;
    }

    res.json({ status: 'pending', parentLanguage });
  } catch (err) {
    console.error('Enrollment status error:', err);
    res.status(500).json({ error: 'Failed to check enrollment status' });
  }
}

export async function simulateApprove(req: Request, res: Response) {
  if (process.env.NODE_ENV !== 'development') {
    res.status(403).json({ error: 'Only available in development' });
    return;
  }

  try {
    const { parentEmail } = req.body as { parentEmail?: string };

    if (!parentEmail) {
      res.status(400).json({ error: 'parentEmail is required' });
      return;
    }

    const updated = await db('enrollments')
      .where({ parent_email: parentEmail })
      .orderBy('created_at', 'desc')
      .limit(1)
      .update({ status: 'approved', approved_at: new Date(), consent_accepted_at: new Date() });

    if (!updated) {
      await db('enrollments').insert({
        parent_email: parentEmail,
        approval_token: crypto.randomUUID(),
        status: 'approved',
        expires_at: new Date(Date.now() + 48 * 60 * 60 * 1000),
        approved_at: new Date(),
      });
    }

    res.json({ status: 'approved' });
  } catch (err) {
    console.error('Simulate approve error:', err);
    res.status(500).json({ error: 'Failed to simulate approval' });
  }
}

// ─── HTML response pages ──────────────────────────────────────────────────────

function htmlShell(emoji: string, title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} — Migo</title>
<style>
  *{box-sizing:border-box}
  body{margin:0;padding:20px;background:#F8F7FF;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh}
  .card{background:#fff;border-radius:24px;padding:48px 40px;max-width:440px;width:100%;text-align:center;box-shadow:0 4px 32px rgba(0,0,0,0.08)}
  h1{color:#2C2C2A;font-size:24px;margin:16px 0 12px}
  p{color:#888780;line-height:1.7;font-size:15px;margin:0 0 24px}
  .btn{display:inline-block;background:#7F77DD;color:#fff;text-decoration:none;font-size:16px;font-weight:700;padding:16px 36px;border-radius:9999px}
  .logo{font-size:22px;font-weight:800;margin-bottom:24px}
  .logo-friend{color:#2C2C2A}.logo-scape{color:#7F77DD}
</style>
</head>
<body>
<div class="card">
  <div class="logo"><span class="logo-friend">Mi</span><span class="logo-scape">go</span></div>
  <div style="font-size:64px;margin-bottom:4px">${emoji}</div>
  ${body}
</div>
</body>
</html>`;
}

function approvedHtml(token: string): string {
  return htmlShell('✅', 'Approved!', `
    <h1>One more step!</h1>
    <p>Please set up your parent account to complete the approval and give your child access to myMigo.</p>
    <a href="/auth/set-password?token=${token}" class="btn">Set Up Parent Account →</a>
  `);
}

function setPasswordFormHtml(token: string, error?: string, lang = 'en'): string {
  return htmlShell('🔐', 'Set Up Parent Account', `
    <h1>Set up your Parent account</h1>
    <p>${lang === 'fr' ? 'Créez un mot de passe pour accéder au tableau de bord myMigo.' : 'Create a password to access the myMigo Parent Dashboard.'}</p>
    ${error ? `<p style="color:#C0392B">${error}</p>` : ''}
    <form method="POST" action="/auth/set-password" onsubmit="return validateForm()">
      <input type="hidden" name="token" value="${token}">
      <input type="hidden" name="consent" value="1">

      <div style="background:#F8F7FF;border-radius:16px;padding:20px;margin-bottom:24px;text-align:left">
        <p style="margin:0 0 12px;font-size:14px;font-weight:700;color:#2C2C2A">${lang === 'fr' ? 'Accord de test bêta' : 'Beta Test Agreement'}</p>
        <p style="margin:0 0 12px;font-size:13px;color:#888780;line-height:1.6">${lang === 'fr' ? 'En créant votre compte, vous confirmez que :' : 'By creating your account, you confirm that:'}</p>
        <ul style="margin:0 0 12px;padding-left:20px;font-size:13px;color:#888780;line-height:1.9">
          ${lang === 'fr' ? `
          <li>Votre enfant utilisera myMigo sous votre supervision sur votre appareil</li>
          <li>Les conversations de votre enfant sont traitées par Claude (Anthropic) — jamais vendues ni utilisées pour entraîner des modèles IA</li>
          <li>Les photos et enregistrements vocaux sont traités en temps réel et jamais stockés par myMigo</li>
          <li>Vous pouvez demander la suppression de toutes les données de votre enfant à tout moment en écrivant à ${process.env.FEEDBACK_EMAIL || 'privacy@mymigo.fr'}</li>
          <li>Il s'agit d'un bêta fermé — ne partagez pas l'accès avec d'autres personnes</li>
          ` : `
          <li>Your child will use myMigo under your supervision on your device</li>
          <li>Your child's conversations are processed by Claude (Anthropic) — never sold or used to train AI models</li>
          <li>Photos and voice recordings are processed in real-time and never stored by myMigo</li>
          <li>You can request deletion of all your child's data at any time by emailing ${process.env.FEEDBACK_EMAIL || 'privacy@mymigo.fr'}</li>
          <li>This is a closed beta — please do not share access with others</li>
          `}
        </ul>
        <label style="display:flex;align-items:flex-start;gap:10px;font-size:13px;color:#2C2C2A;cursor:pointer">
          <input type="checkbox" id="consentCheck" style="margin-top:3px;width:16px;height:16px;flex-shrink:0">
          <span>${lang === 'fr' ? `J'ai lu et j'accepte les <a href="https://mymigo-site.vercel.app/beta-terms" target="_blank" style="color:#7F77DD">conditions du test bêta</a> et le traitement des données de mon enfant tel que décrit ci-dessus.` : `I have read and agree to the <a href="https://mymigo-site.vercel.app/beta-terms" target="_blank" style="color:#7F77DD">beta test terms</a> and the processing of my child's data as described above.`}</span>
        </label>
      </div>

      <input type="password" name="password" id="passwordInput" placeholder="${lang === 'fr' ? 'Choisissez un mot de passe (8 caractères min.)' : 'Choose a password (min 8 characters)'}" minlength="8" style="width:100%;padding:14px;border-radius:12px;border:1px solid #E8E6FF;margin-bottom:16px;font-size:15px;box-sizing:border-box">
      <div id="formError" style="color:#C0392B;font-size:13px;margin-bottom:12px;display:none"></div>
      <button type="submit" class="btn" style="border:none;width:100%;cursor:pointer">${lang === 'fr' ? "Créer mon compte & donner l'accès →" : 'Create Account & Give Access →'}</button>
    </form>
    <script>
      function validateForm() {
        var cb = document.getElementById('consentCheck');
        var pw = document.getElementById('passwordInput');
        var err = document.getElementById('formError');
        if (!cb.checked) {
          err.textContent = '${lang === 'fr' ? "Veuillez lire et accepter l'accord de test bêta pour continuer." : 'Please read and accept the beta test agreement to continue.'}';
          err.style.display = 'block';
          return false;
        }
        if (!pw.value || pw.value.length < 8) {
          err.textContent = '${lang === 'fr' ? "Veuillez choisir un mot de passe d'au moins 8 caractères." : 'Please choose a password of at least 8 characters.'}';
          err.style.display = 'block';
          return false;
        }
        err.style.display = 'none';
        return true;
      }
    </script>
  `);
}

function expiredHtml(message?: string): string {
  return htmlShell('⏰', 'Link Expired', `
    <h1>This link has expired</h1>
    <p>${message ?? 'This approval link has expired. Please ask your child to open the Migo app and send a new request.'}</p>
  `);
}

function declinedHtml(): string {
  return htmlShell('👋', 'Request Declined', `
    <h1>Request declined</h1>
    <p>No problem — this request has been cancelled. If you change your mind, ask your child to open the Migo app and try again.</p>
  `);
}

// ─── Set-password flow ───────────────────────────────────────────────────────

export async function showSetPasswordForm(req: Request, res: Response) {
  const { token } = req.query as { token?: string };

  if (!token) {
    console.log('[auth] ❌ set-password form rejected — invalid/expired token:', token);
    res.send(expiredHtml('Invalid link.'));
    return;
  }

  const enrollment = await db('enrollments').where({ approval_token: token }).first();

  if (!enrollment || new Date() > new Date(enrollment.expires_at) || enrollment.status !== 'approved') {
    console.log('[auth] ❌ set-password form rejected — invalid/expired token:', token);
    res.send(expiredHtml());
    return;
  }

  console.log('[auth] 🔑 Showing set-password form for', enrollment.parent_email);
  const enrollLang = (enrollment.language as string | undefined) ?? 'en';
  res.send(setPasswordFormHtml(token, undefined, enrollLang));
}

export async function setApprovalPassword(req: Request, res: Response) {
  const { token, password } = req.body as { token?: string; password?: string };
  console.log('[auth] 📨 setApprovalPassword called, token:', token, 'password length:', password?.length ?? 0);

  try {
    const enrollment = await db('enrollments').where({ approval_token: token }).first();

    if (!token || !enrollment || new Date() > new Date(enrollment.expires_at) || enrollment.status !== 'approved') {
      console.log('[auth] ❌ setApprovalPassword rejected — invalid/expired token');
      res.send(expiredHtml());
      return;
    }

    if (!password || password.length < 8) {
      console.log('[auth] ❌ setApprovalPassword rejected — password too short');
      res.send(setPasswordFormHtml(token, 'Password must be at least 8 characters.'));
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const existing = await db('users').where({ email: enrollment.parent_email }).first();

    if (existing) {
      await db('users')
        .where({ email: enrollment.parent_email })
        .update({ password_hash: passwordHash, email_verified: true });
    } else {
      const defaultSettings = {
        alertsEnabled: true,
        weeklyReportEnabled: true,
        contentFilterLevel: 'strict',
        screenTimeLimitMinutes: 60,
        bedtimeLockEnabled: false,
        bedtimeLockStart: '20:00',
        bedtimeLockEnd: '07:00',
      };
      await db('users').insert({
        email: enrollment.parent_email,
        display_name: 'Parent',
        password_hash: passwordHash,
        email_verified: true,
        settings: defaultSettings,
      });
    }

    await db('enrollments')
      .where({ approval_token: token })
      .update({ consent_accepted_at: new Date() });

    console.log('[auth] ✅ Password set for', enrollment.parent_email, '— existing user updated:', !!existing);

    res.send(htmlShell('🎉', 'All Set!', `
      <h1>All Set!</h1>
      <p>You can now log in to the Migo Parent Dashboard with your email (<strong>${enrollment.parent_email}</strong>) and your new password.</p>
      <a href="http://localhost:3000" class="btn">Open Parent Dashboard →</a>
    `));
  } catch (err) {
    console.error('setApprovalPassword error:', err);
    res.send(htmlShell('❌', 'Error', `
      <h1>Something went wrong</h1>
      <p>We couldn't set your password. Please try again or contact support.</p>
    `));
  }
}

// ─── DEV ONLY ────────────────────────────────────────────────────────────────

export async function devReset(req: Request, res: Response) {
  if (process.env.NODE_ENV !== 'development') {
    res.status(403).json({ error: 'This endpoint is only available in development' });
    return;
  }

  try {
    // Send response immediately, do async work after
    res.json({
      success: true,
      message: 'Database reset started',
    });

    // Heavy work happens async in background
    setImmediate(async () => {
      try {
        // Delete in FK-safe order
        await db('child_sessions').del();
        await db('child_badges').del();
        await db('learning_sessions').del();
        await db('post_comments').del();
        await db('post_reactions').del();
        await db('parent_alerts').del();
        await db('messages').del();
        await db('conversations').del();
        await db('posts').del();
        await db('child_memories').del();
        await db('child_friends').del();

        const childCount = await db('children').count('id as n').first();
        const nChildren  = Number((childCount as { n: string } | undefined)?.n ?? 0);
        await db('children').del();

        const enrollCount = await db('enrollments').count('id as n').first();
        const nEnrollments = Number((enrollCount as { n: string } | undefined)?.n ?? 0);
        await db('enrollments').del();

        // Remove generated AI friends (preserve seeded ones)
        const genIds = await db('ai_friends').where({ is_generated: true }).select('id') as { id: string }[];
        const genIdList = genIds.map((r) => r.id);

        let nGeneratedFriends = 0;
        if (genIdList.length > 0) {
          await db('ai_friend_network')
            .whereIn('ai_friend_id', genIdList)
            .orWhereIn('connected_friend_id', genIdList)
            .del();
          nGeneratedFriends = await db('ai_friends').where({ is_generated: true }).delete();
        }

        if (redis.status === 'ready') {
          await redis.flushdb();
          console.log('[dev] ✅ Redis flushed');
        }

        // Re-seed core data
        await db.seed.run({ specific: '02_badges.ts' });
        await db.seed.run({ specific: '01_ai_friends.ts' });

        console.log(`[dev] 🗑️  Database reset — ${nChildren} children, ${nGeneratedFriends} generated friends deleted`);

        // Regenerate star friend avatars (reseed wipes them since seed data has no avatar_url)
        try {
          const ADULT_STYLE_NAMES = ['Coach Mike', 'Capitaine Coquillage', 'Jules'];
          const starRows = await db('ai_friends').where({ is_star_friend: true }).whereNull('avatar_url');
          console.log(`[dev] 🎨 Regenerating ${starRows.length} star friend avatar(s)...`);
          for (const row of starRows) {
            try {
              const personality: string[] = row.personality ?? [];
              let url: string;
              if (row.name === 'Jules') {
                const { fal } = await import('@fal-ai/client');
                const result = await fal.subscribe('fal-ai/flux/schnell', {
                  input: {
                    prompt: "Pixar cartoon portrait of a cool friendly adult male teacher in his early thirties, tousled sun-bleached hair, warm smile, relaxed confidence, slight tan, casual summer style, children's app illustration style, plain warm light background, centered portrait, vibrant friendly colors, high quality",
                    negative_prompt: 'child, kid, teenager, scary, dark, realistic photo, elderly, old, text, watermark, female, woman',
                    image_size: 'square',
                    num_inference_steps: 4,
                    num_images: 1,
                  } as never,
                  pollInterval: 500,
                });
                const r = result as unknown as { data: { images: Array<{ url: string }> } };
                url = r.data?.images?.[0]?.url ?? '';
                if (!url) throw new Error('No image for Jules');
              } else if (ADULT_STYLE_NAMES.includes(row.name)) {
                url = await generateAdultFriendPortrait(row.name, row.gender, personality, 'en');
              } else {
                const age: number = row.age ?? 10;
                url = await generateFriendPortrait(row.name, age, row.gender, personality, 'en');
              }
              await db('ai_friends').where({ id: row.id }).update({ avatar_url: url });
              console.log(`[dev]   ✓ ${row.name} avatar regenerated`);
            } catch (avatarErr) {
              console.error(`[dev]   ✗ ${row.name} avatar failed:`, avatarErr);
            }
          }
        } catch (err) {
          console.error('[dev] Star friend avatar regeneration failed:', err);
        }

        // Regenerate Ms. Luna's avatar (reseed wipes it since seed data has no avatar_url)
        try {
          const lunaRow = await db('ai_friends')
            .where({ name: 'Ms. Luna', is_teacher: true })
            .whereNull('avatar_url')
            .first();
          if (lunaRow) {
            console.log('[dev] 🎨 Regenerating Ms. Luna avatar...');
            const lunaUrl = await generateLunaPortrait();
            await db('ai_friends').where({ id: lunaRow.id }).update({ avatar_url: lunaUrl });
            console.log('[dev]   ✓ Ms. Luna avatar regenerated');
          }
        } catch (err) {
          console.error('[dev] Ms. Luna avatar regeneration failed:', err);
        }

        // Regenerate secondary/network friend avatars (reseed wipes them since seed data has no avatar_url)
        try {
          const networkRows = await db('ai_friends')
            .where({ is_star_friend: false })
            .whereNot({ name: 'Ms. Luna' })
            .whereNull('avatar_url');
          console.log(`[dev] 🎨 Regenerating ${networkRows.length} network friend avatar(s)...`);
          for (const row of networkRows) {
            try {
              const personality: string[] = row.personality ?? [];
              let url: string;
              if (row.is_teacher) {
                url = await generateAdultFriendPortrait(row.name, row.gender, personality, 'en');
              } else {
                const age: number = row.age ?? 10;
                url = await generateFriendPortrait(row.name, age, row.gender, personality, 'en');
              }
              await db('ai_friends').where({ id: row.id }).update({ avatar_url: url });
              console.log(`[dev]   ✓ ${row.name} avatar regenerated`);
            } catch (avatarErr) {
              console.error(`[dev]   ✗ ${row.name} avatar failed:`, avatarErr);
            }
          }
        } catch (err) {
          console.error('[dev] Network friend avatar regeneration failed:', err);
        }
      } catch (err) {
        console.error('[dev] devReset background error:', err);
      }
    });
  } catch (err) {
    console.error('[dev] devReset error:', err);
    res.status(500).json({ error: 'Reset failed', detail: String(err) });
  }
}
