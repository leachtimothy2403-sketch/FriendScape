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
    res.json({
      token,
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

    res.send(approvedHtml());
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

    if (!enrollment) {
      res.json({ status: 'pending' });
      return;
    }

    if (enrollment.status === 'approved') {
      res.json({ status: 'approved' });
      return;
    }

    if (new Date() > new Date(enrollment.expires_at)) {
      res.json({ status: 'expired' });
      return;
    }

    res.json({ status: 'pending' });
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
      .update({ status: 'approved', approved_at: new Date() });

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

function approvedHtml(): string {
  return htmlShell('✅', 'Approved!', `
    <h1>Approved!</h1>
    <p>You can now set up Migo together with your child. Hand the device back and tap "Let's set up Migo!" to get started.</p>
    <a href="http://localhost:3000" class="btn">Download the Parent Dashboard →</a>
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
      } catch (err) {
        console.error('[dev] devReset background error:', err);
      }
    });
  } catch (err) {
    console.error('[dev] devReset error:', err);
    res.status(500).json({ error: 'Reset failed', detail: String(err) });
  }
}
