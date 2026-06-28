import express from 'express';
import request from 'supertest';

jest.mock('../db', () => require('./helpers/mockDb').dbFactory());
jest.mock('../services/redis.service', () => ({
  default: { status: 'not_ready' },
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../services/ai.service', () => ({
  generatePersonalisedFriends: jest.fn().mockResolvedValue({ friends: [] }),
  generateFriendNetwork: jest.fn().mockResolvedValue([]),
  selectVoiceId: jest.fn().mockReturnValue('voice-id'),
  buildMemoryBrief: jest.fn().mockReturnValue(null),
  moderateInterest: jest.fn().mockResolvedValue({ safe: true }),
}));
jest.mock('../services/avatar.service', () => ({
  generateFriendPortrait: jest.fn().mockResolvedValue('https://example.com/avatar.png'),
  generatePostImage: jest.fn().mockResolvedValue('https://example.com/post.png'),
}));
jest.mock('../services/migaDM', () => ({
  sendMigaDM: jest.fn().mockResolvedValue(undefined),
  sendMascotDM: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../services/graduationTrack', () => ({
  getGraduationProgress: jest.fn().mockResolvedValue({ allComplete: false, milestones: [] }),
}));

import childrenRoutes from '../routes/children';
import { makeChildToken, makeParentToken } from './helpers/mockAuth';

const app = express();
app.use(express.json());
app.use('/children', childrenRoutes);

// ---------------------------------------------------------------------------

function getChain() {
  return (jest.requireMock('../db') as { chain: Record<string, jest.Mock> }).chain;
}

function resetChain() {
  const c = getChain();
  c.first.mockReset().mockResolvedValue(null);
  c.returning.mockReset().mockResolvedValue([]);
  c.del.mockReset().mockResolvedValue(0);
  c.delete.mockReset().mockResolvedValue(0);
  c.pluck.mockReset().mockResolvedValue([]);
  c.ignore.mockReset().mockResolvedValue(undefined);
  c.then.mockReset().mockImplementation((resolve: (v: unknown) => unknown) => Promise.resolve([]).then(resolve));
}

beforeEach(resetChain);

const CHILD_TOKEN = makeChildToken('child-123');
const PARENT_TOKEN = makeParentToken('parent-456');

const CHILD_ROW = {
  id: 'child-123', name: 'Alice', age: 8, gender: 'girl', language: 'en',
  avatar_theme: 'animals', mascot: 'miga', interests: '[]', special_needs: '[]',
  pre_reader: false, bio: null, avatar_config: null, avatar_background: null,
  avatar_url: null, created_at: new Date().toISOString(),
};

// ── POST /children/onboarding ─────────────────────────────────────────────────

describe('POST /children/onboarding', () => {
  it('returns 400 when required fields are missing', async () => {
    const res = await request(app)
      .post('/children/onboarding')
      .send({ name: 'Alice' }); // missing age and parentEmail

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/required/i);
  });

  it('returns 403 when parent approval is missing', async () => {
    getChain().first.mockResolvedValueOnce(null); // no approved enrollment

    const res = await request(app)
      .post('/children/onboarding')
      .send({ name: 'Alice', age: '8', parentEmail: 'parent@example.com' });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/approval/i);
  });

  it('creates child and returns 201 for valid approved enrollment', async () => {
    const chain = getChain();
    // 1. enrollment lookup → found
    chain.first
      .mockResolvedValueOnce({ id: 'enr-1', parent_email: 'parent@example.com', status: 'approved', consent_accepted_at: new Date().toISOString() })
      // 2. parent user lookup → found
      .mockResolvedValueOnce({ id: 'parent-1', email: 'parent@example.com', settings: { language: 'en' } });

    // 3. child insert returning
    chain.returning
      .mockResolvedValueOnce([{ ...CHILD_ROW, id: 'child-new' }]);

    // 4. enrollment stamp (update → await chain)
    // 5. existing friends check → 0 friends (no double-fire guard)
    chain.then
      .mockImplementationOnce((r: (v: unknown) => unknown) => Promise.resolve(1).then(r))
      .mockImplementationOnce((r: (v: unknown) => unknown) => Promise.resolve([{ count: '0' }]).then(r));

    const res = await request(app)
      .post('/children/onboarding')
      .send({
        name: 'Alice', age: '8-9', parentEmail: 'parent@example.com',
        gender: 'girl', language: 'en', interests: ['drawing'],
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('childId');
    expect(res.body).toHaveProperty('assignedFriends');
  });
});

// ── GET /children/me/profile ──────────────────────────────────────────────────

describe('GET /children/me/profile', () => {
  it('returns child profile with stats for authenticated child', async () => {
    const chain = getChain();

    // child row
    chain.first.mockResolvedValueOnce(CHILD_ROW);

    // Promise.all for stats: [postsCount, friendsCount, badgesCount, xpResult]
    // All four queries await the chain → use .then mock
    chain.then
      .mockImplementationOnce((r: (v: unknown) => unknown) => Promise.resolve([{ count: '3' }]).then(r))
      .mockImplementationOnce((r: (v: unknown) => unknown) => Promise.resolve([{ count: '2' }]).then(r))
      .mockImplementationOnce((r: (v: unknown) => unknown) => Promise.resolve([{ count: '5' }]).then(r))
      .mockImplementationOnce((r: (v: unknown) => unknown) => Promise.resolve([{ total_xp: '150' }]).then(r));

    const res = await request(app)
      .get('/children/me/profile')
      .set('Authorization', `Bearer ${CHILD_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: 'child-123', name: 'Alice' });
    expect(res.body.stats).toHaveProperty('totalPosts');
    expect(res.body.stats).toHaveProperty('totalFriends');
  });

  it('returns 401 without auth', async () => {
    const res = await request(app).get('/children/me/profile');
    expect(res.status).toBe(401);
  });

  it('returns 404 when child not found', async () => {
    getChain().first.mockResolvedValueOnce(null);

    const res = await request(app)
      .get('/children/me/profile')
      .set('Authorization', `Bearer ${CHILD_TOKEN}`);

    expect(res.status).toBe(404);
  });
});

// ── GET /children/me/friends-list ─────────────────────────────────────────────

describe('GET /children/me/friends-list', () => {
  it('returns friends array for authenticated child', async () => {
    const chain = getChain();

    // friends query (joined) → array result via .then
    chain.then.mockImplementationOnce((r: (v: unknown) => unknown) =>
      Promise.resolve([
        {
          id: 'friend-1', name: 'Zara', bio: 'Fun friend', cover_emojis: '🌟',
          avatar_url: null, personality: [], interests: [], is_star_friend: false,
          is_teacher: false, age: 9, gender: 'girl', relationship_type: 'friend',
          friendship_level: 1, friendship_xp: 0, activated_at: new Date().toISOString(),
          last_message_at: null,
        },
      ]).then(r),
    );

    const res = await request(app)
      .get('/children/me/friends-list')
      .set('Authorization', `Bearer ${CHILD_TOKEN}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.friends)).toBe(true);
    expect(res.body.friends[0]).toHaveProperty('name', 'Zara');
    expect(res.body.friends[0]).toHaveProperty('level_name');
  });

  it('returns 401 without auth token', async () => {
    const res = await request(app).get('/children/me/friends-list');
    expect(res.status).toBe(401);
  });
});

// ── PATCH /children/me/profile ────────────────────────────────────────────────

describe('PATCH /children/me/profile', () => {
  it('updates bio successfully', async () => {
    const chain = getChain();
    chain.returning.mockResolvedValueOnce([{ ...CHILD_ROW, bio: 'I love art!' }]);

    // interests update catch (no-op)
    chain.catch = jest.fn().mockResolvedValue(undefined);

    const res = await request(app)
      .patch('/children/me/profile')
      .set('Authorization', `Bearer ${CHILD_TOKEN}`)
      .send({ bio: 'I love art!' });

    expect(res.status).toBe(200);
    expect(res.body.bio).toBe('I love art!');
  });

  it('returns 400 if bio is too long', async () => {
    const res = await request(app)
      .patch('/children/me/profile')
      .set('Authorization', `Bearer ${CHILD_TOKEN}`)
      .send({ bio: 'x'.repeat(101) });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/100/);
  });

  it('returns 400 if interests is not an array', async () => {
    const res = await request(app)
      .patch('/children/me/profile')
      .set('Authorization', `Bearer ${CHILD_TOKEN}`)
      .send({ interests: 'not-an-array' });

    expect(res.status).toBe(400);
  });

  it('returns 401 without auth', async () => {
    const res = await request(app).patch('/children/me/profile').send({ bio: 'hi' });
    expect(res.status).toBe(401);
  });
});
