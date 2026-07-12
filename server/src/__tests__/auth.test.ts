import express from 'express';
import request from 'supertest';
import bcrypt from 'bcryptjs';

jest.mock('../db', () => require('./helpers/mockDb').dbFactory());
jest.mock('../services/email.service', () => ({
  sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
  sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
  sendApprovalEmail: jest.fn().mockResolvedValue(undefined),
  sendLoginOtpEmail: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../services/redis.service', () => {
  // Simple in-memory stand-in so login -> verify-otp can round-trip a real value
  // within a test, instead of always resolving to null.
  const store = new Map<string, string>();
  return {
    default: { status: 'not_ready', flushdb: jest.fn().mockResolvedValue('OK') },
    get: jest.fn(async (key: string) => (store.has(key) ? store.get(key)! : null)),
    set: jest.fn(async (key: string, value: string) => { store.set(key, value); }),
    del: jest.fn(async (key: string) => { store.delete(key); }),
    connectRedis: jest.fn().mockResolvedValue(undefined),
  };
});

import authRoutes from '../routes/auth';

const app = express();
app.use(express.json());
app.use('/auth', authRoutes);

// ---------------------------------------------------------------------------

function getChain() {
  return (jest.requireMock('../db') as { chain: Record<string, jest.Mock> }).chain;
}

function resetChain() {
  const chain = getChain();
  chain.first.mockReset().mockResolvedValue(null);
  chain.returning.mockReset().mockResolvedValue([]);
  chain.del.mockReset().mockResolvedValue(0);
  chain.delete.mockReset().mockResolvedValue(0);
  chain.pluck.mockReset().mockResolvedValue([]);
  chain.ignore.mockReset().mockResolvedValue(undefined);
  chain.then.mockReset().mockImplementation((resolve: (v: unknown) => unknown) => Promise.resolve([]).then(resolve));
}

beforeEach(resetChain);

// ── POST /auth/enroll ────────────────────────────────────────────────────────

describe('POST /auth/enroll', () => {
  it('returns pending for a valid new email', async () => {
    // No existing approved enrollment
    getChain().first.mockResolvedValueOnce(null);

    const res = await request(app)
      .post('/auth/enroll')
      .send({ parentEmail: 'parent@example.com' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('pending');
  });

  it('returns 400 for an invalid email', async () => {
    const res = await request(app)
      .post('/auth/enroll')
      .send({ parentEmail: 'not-an-email' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/valid email/i);
  });

  it('returns 400 when email is missing', async () => {
    const res = await request(app).post('/auth/enroll').send({});
    expect(res.status).toBe(400);
  });

  it('returns already_approved when enrollment is already approved', async () => {
    getChain().first.mockResolvedValueOnce({ id: '1', parent_email: 'parent@example.com', status: 'approved' });

    const res = await request(app)
      .post('/auth/enroll')
      .send({ parentEmail: 'parent@example.com' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('already_approved');
  });
});

// ── POST /auth/login ─────────────────────────────────────────────────────────

describe('POST /auth/login', () => {
  it('returns requiresOtp + otpToken for valid credentials, and emails a code (2FA)', async () => {
    const hash = await bcrypt.hash('correct-password', 1);
    getChain().first.mockResolvedValueOnce({
      id: 'user-1', email: 'user@example.com', display_name: 'Test User',
      password_hash: hash,
    });

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'user@example.com', password: 'correct-password' });

    expect(res.status).toBe(200);
    expect(res.body.requiresOtp).toBe(true);
    expect(typeof res.body.otpToken).toBe('string');
    expect(res.body).not.toHaveProperty('token'); // real token withheld until OTP is verified

    const emailMock = jest.requireMock('../services/email.service').sendLoginOtpEmail as jest.Mock;
    expect(emailMock).toHaveBeenCalledWith('user@example.com', expect.any(String));
  });

  it('returns 401 for wrong password (no OTP issued)', async () => {
    const hash = await bcrypt.hash('correct-password', 1);
    getChain().first.mockResolvedValueOnce({
      id: 'user-1', email: 'user@example.com', password_hash: hash,
    });

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'user@example.com', password: 'wrong-password' });

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid/i);
  });

  it('returns 401 for unknown email', async () => {
    getChain().first.mockResolvedValueOnce(null);

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'nobody@example.com', password: 'any' });

    expect(res.status).toBe(401);
  });
});

// ── POST /auth/verify-otp ────────────────────────────────────────────────────

describe('POST /auth/verify-otp', () => {
  async function loginAndCaptureCode(email: string) {
    const hash = await bcrypt.hash('correct-password', 1);
    getChain().first.mockResolvedValueOnce({
      id: 'user-otp', email, display_name: 'OTP Test User', password_hash: hash,
    });

    const loginRes = await request(app)
      .post('/auth/login')
      .send({ email, password: 'correct-password' });

    const otpToken = loginRes.body.otpToken as string;
    const emailMock = jest.requireMock('../services/email.service').sendLoginOtpEmail as jest.Mock;
    const lastCall = emailMock.mock.calls[emailMock.mock.calls.length - 1] as [string, string];
    const code = lastCall[1];
    return { otpToken, code };
  }

  it('issues a real token when the code is correct', async () => {
    const { otpToken, code } = await loginAndCaptureCode('verify-ok@example.com');

    // verify-otp re-fetches the user by id to build the final response
    getChain().first.mockResolvedValueOnce({
      id: 'user-otp', email: 'verify-ok@example.com', display_name: 'OTP Test User', settings: {},
    });

    const res = await request(app)
      .post('/auth/verify-otp')
      .send({ otpToken, code });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body.user).toMatchObject({ email: 'verify-ok@example.com' });
  });

  it('rejects an incorrect code without issuing a token', async () => {
    const { otpToken } = await loginAndCaptureCode('verify-bad@example.com');

    const res = await request(app)
      .post('/auth/verify-otp')
      .send({ otpToken, code: '000000' });

    expect(res.status).toBe(401);
    expect(res.body).not.toHaveProperty('token');
  });

  it('rejects a missing or expired otpToken', async () => {
    const res = await request(app)
      .post('/auth/verify-otp')
      .send({ otpToken: 'this-token-does-not-exist', code: '123456' });

    expect(res.status).toBe(400);
  });

  it('requires both otpToken and code', async () => {
    const res = await request(app).post('/auth/verify-otp').send({});
    expect(res.status).toBe(400);
  });
});

// ── POST /auth/dev-reset ─────────────────────────────────────────────────────

describe('POST /auth/dev-reset', () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => { process.env.NODE_ENV = originalEnv; });

  it('returns 200 with success message in development', async () => {
    process.env.NODE_ENV = 'development';

    const res = await request(app).post('/auth/dev-reset').send({});

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body).toHaveProperty('message');
  });

  it('returns 403 outside development', async () => {
    process.env.NODE_ENV = 'production';

    const res = await request(app).post('/auth/dev-reset').send({});
    expect(res.status).toBe(403);
  });
});

// ── GET /auth/enrollment-status ──────────────────────────────────────────────

describe('GET /auth/enrollment-status', () => {
  it('returns pending when no enrollment found', async () => {
    getChain().first.mockResolvedValueOnce(null);

    const res = await request(app)
      .get('/auth/enrollment-status')
      .query({ parentEmail: 'new@example.com' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('pending');
  });

  it('returns approved when enrollment is approved', async () => {
    getChain().first.mockResolvedValueOnce({
      status: 'approved',
      expires_at: new Date(Date.now() + 100000),
      consent_accepted_at: new Date().toISOString(),
    });

    const res = await request(app)
      .get('/auth/enrollment-status')
      .query({ parentEmail: 'approved@example.com' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('approved');
  });

  it('returns expired when token has expired', async () => {
    getChain().first.mockResolvedValueOnce({
      status: 'pending',
      expires_at: new Date(Date.now() - 1000), // in the past
    });

    const res = await request(app)
      .get('/auth/enrollment-status')
      .query({ parentEmail: 'expired@example.com' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('expired');
  });

  it('returns 400 when parentEmail is missing', async () => {
    const res = await request(app).get('/auth/enrollment-status');
    expect(res.status).toBe(400);
  });
});
