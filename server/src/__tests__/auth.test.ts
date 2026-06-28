import express from 'express';
import request from 'supertest';
import bcrypt from 'bcryptjs';

jest.mock('../db', () => require('./helpers/mockDb').dbFactory());
jest.mock('../services/email.service', () => ({
  sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
  sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
  sendApprovalEmail: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../services/redis.service', () => ({
  default: { status: 'not_ready', flushdb: jest.fn().mockResolvedValue('OK') },
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue(undefined),
  connectRedis: jest.fn().mockResolvedValue(undefined),
}));

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
  it('returns token and user for valid credentials', async () => {
    const hash = await bcrypt.hash('correct-password', 1);
    getChain().first.mockResolvedValueOnce({
      id: 'user-1', email: 'user@example.com', display_name: 'Test User',
      password_hash: hash,
    });

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'user@example.com', password: 'correct-password' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body.user).toMatchObject({ email: 'user@example.com' });
  });

  it('returns 401 for wrong password', async () => {
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
