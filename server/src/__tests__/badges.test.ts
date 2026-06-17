import express from 'express';
import request from 'supertest';

jest.mock('../db', () => require('./helpers/mockDb').dbFactory());
jest.mock('../services/redis.service', () => ({
  default: { status: 'not_ready' },
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../services/migaDM', () => ({
  sendMigaDM: jest.fn().mockResolvedValue(undefined),
  sendMascotDM: jest.fn().mockResolvedValue(undefined),
}));

import badgesRoutes from '../routes/badges';
import { makeChildToken } from './helpers/mockAuth';

const app = express();
app.use(express.json());
app.use('/badges', badgesRoutes);

// ---------------------------------------------------------------------------

function getChain() {
  return (jest.requireMock('../db') as { chain: Record<string, jest.Mock> }).chain;
}

function resetChain() {
  const c = getChain();
  c.first.mockReset().mockResolvedValue(null);
  c.returning.mockReset().mockResolvedValue([]);
  c.del.mockReset().mockResolvedValue(0);
  c.pluck.mockReset().mockResolvedValue([]);
  c.ignore.mockReset().mockResolvedValue(undefined);
  c.then.mockReset().mockImplementation((resolve: (v: unknown) => unknown) => Promise.resolve([]).then(resolve));
}

beforeEach(resetChain);

const CHILD_TOKEN = makeChildToken('child-123');

const BADGE_DEFINITION = {
  id: 'badge-1', name: 'First Post', name_fr: 'Premier message',
  description: 'Share your first post', description_fr: 'Partagez votre premier message',
  icon: '✏️', category: 'social', trigger_type: 'first_post',
  xp_required: 1, lumi_message: 'Amazing first post!', lumi_message_fr: null,
};

// ── GET /badges ───────────────────────────────────────────────────────────────

describe('GET /badges', () => {
  it('returns badge definitions with earned and progress fields', async () => {
    const chain = getChain();

    // child row (for lang)
    chain.first.mockResolvedValueOnce({ id: 'child-123', language: 'en' });

    // Promise.all: [definitions, earned, progress queries...]
    // definitions → via .then
    chain.then
      .mockImplementationOnce((r: (v: unknown) => unknown) =>
        Promise.resolve([BADGE_DEFINITION]).then(r),
      )
      // earned child_badges
      .mockImplementationOnce((r: (v: unknown) => unknown) =>
        Promise.resolve([]).then(r),
      );

    // fetchAllProgress — 8 parallel count queries all go through .then
    // They return via the shared chain.then mock (default [] per call)
    // The count/sum fields are extracted from .first() calls
    chain.first
      .mockResolvedValueOnce({ count: '2' })  // postCount
      .mockResolvedValueOnce({ count: '0' })  // encouragingCount
      .mockResolvedValueOnce({ count: '1' })  // tutorCount
      .mockResolvedValueOnce({ count: '3' })  // friendsCount
      .mockResolvedValueOnce({ count: '10' }) // totalMessages
      .mockResolvedValueOnce({ count: '2' })  // totalPosts
      .mockResolvedValueOnce({ count: '5' })  // totalReactions
    ;
    // consecutiveRaw is db.raw
    const mockDbModule = jest.requireMock('../db') as { default: { raw: jest.Mock } };
    mockDbModule.default.raw.mockResolvedValueOnce({ rows: [{ cnt: '3' }] });

    const res = await request(app)
      .get('/badges')
      .set('Authorization', `Bearer ${CHILD_TOKEN}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.badges)).toBe(true);
    expect(res.body.badges[0]).toHaveProperty('id');
    expect(res.body.badges[0]).toHaveProperty('earned');
    expect(res.body.badges[0]).toHaveProperty('progress');
  });

  it('returns 401 without auth', async () => {
    const res = await request(app).get('/badges');
    expect(res.status).toBe(401);
  });
});

// ── POST /badges/check ────────────────────────────────────────────────────────

describe('POST /badges/check', () => {
  it('returns 400 when trigger is missing', async () => {
    const res = await request(app)
      .post('/badges/check')
      .set('Authorization', `Bearer ${CHILD_TOKEN}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/trigger/i);
  });

  it('awards first_post badge when threshold is met', async () => {
    const chain = getChain();

    // child row
    chain.first.mockResolvedValueOnce({ id: 'child-123', language: 'en', name: 'Alice', mascot: 'miga' });
    // earnedBadgeIds pluck
    chain.pluck.mockResolvedValueOnce([]);
    // candidates → via .then
    chain.then.mockImplementationOnce((r: (v: unknown) => unknown) =>
      Promise.resolve([BADGE_DEFINITION]).then(r),
    );
    // child_badges insert → ignore
    chain.ignore.mockResolvedValueOnce(undefined);
    // parent_alerts insert → catch
    chain.catch = jest.fn().mockResolvedValue(undefined);

    const res = await request(app)
      .post('/badges/check')
      .set('Authorization', `Bearer ${CHILD_TOKEN}`)
      .send({ trigger: 'first_post', value: 1 });

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.newBadges)).toBe(true);
    expect(res.body.newBadges[0]).toMatchObject({ id: 'badge-1', earned: true });
  });

  it('does not award badge when threshold not met', async () => {
    const chain = getChain();

    chain.first.mockResolvedValueOnce({ id: 'child-123', language: 'en', name: 'Alice', mascot: 'miga' });
    chain.pluck.mockResolvedValueOnce([]);
    chain.then.mockImplementationOnce((r: (v: unknown) => unknown) =>
      Promise.resolve([BADGE_DEFINITION]).then(r),
    );

    const res = await request(app)
      .post('/badges/check')
      .set('Authorization', `Bearer ${CHILD_TOKEN}`)
      .send({ trigger: 'first_post', value: 0 }); // below threshold of 1

    expect(res.status).toBe(200);
    expect(res.body.newBadges).toHaveLength(0);
  });

  it('does not re-award an already earned badge', async () => {
    const chain = getChain();

    chain.first.mockResolvedValueOnce({ id: 'child-123', language: 'en', name: 'Alice', mascot: 'miga' });
    chain.pluck.mockResolvedValueOnce(['badge-1']); // already earned
    chain.then.mockImplementationOnce((r: (v: unknown) => unknown) =>
      Promise.resolve([]).then(r), // no candidates (filtered out)
    );

    const res = await request(app)
      .post('/badges/check')
      .set('Authorization', `Bearer ${CHILD_TOKEN}`)
      .send({ trigger: 'first_post', value: 5 });

    expect(res.status).toBe(200);
    expect(res.body.newBadges).toHaveLength(0);
  });
});

// ── Badge award logic ─────────────────────────────────────────────────────────

describe('checkBadgesForChild (internal logic)', () => {
  it('awards first_message badge for total_messages trigger', async () => {
    const chain = getChain();
    const firstMsgBadge = { ...BADGE_DEFINITION, id: 'badge-msg', trigger_type: 'total_messages', xp_required: 1 };

    chain.first.mockResolvedValueOnce({ id: 'child-123', language: 'en', name: 'Alice', mascot: 'miga' });
    chain.pluck.mockResolvedValueOnce([]);
    chain.then.mockImplementationOnce((r: (v: unknown) => unknown) =>
      Promise.resolve([firstMsgBadge]).then(r),
    );
    chain.ignore.mockResolvedValueOnce(undefined);
    chain.catch = jest.fn().mockResolvedValue(undefined);

    const res = await request(app)
      .post('/badges/check')
      .set('Authorization', `Bearer ${CHILD_TOKEN}`)
      .send({ trigger: 'total_messages', value: 1 });

    expect(res.status).toBe(200);
    expect(res.body.newBadges[0].trigger_type).toBe('total_messages');
  });

  it('awards consecutive_posts badge for login_streak trigger', async () => {
    const streakBadge = {
      ...BADGE_DEFINITION, id: 'badge-streak',
      trigger_type: 'consecutive_posts', xp_required: 3,
    };
    const chain = getChain();

    chain.first.mockResolvedValueOnce({ id: 'child-123', language: 'en', name: 'Alice', mascot: 'miga' });
    chain.pluck.mockResolvedValueOnce([]);
    chain.then.mockImplementationOnce((r: (v: unknown) => unknown) =>
      Promise.resolve([streakBadge]).then(r),
    );
    chain.ignore.mockResolvedValueOnce(undefined);
    chain.catch = jest.fn().mockResolvedValue(undefined);

    const res = await request(app)
      .post('/badges/check')
      .set('Authorization', `Bearer ${CHILD_TOKEN}`)
      .send({ trigger: 'consecutive_posts', value: 5 });

    expect(res.status).toBe(200);
    expect(res.body.newBadges[0].trigger_type).toBe('consecutive_posts');
  });
});
