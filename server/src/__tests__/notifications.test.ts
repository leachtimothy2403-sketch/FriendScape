import express from 'express';
import request from 'supertest';

jest.mock('../db', () => require('./helpers/mockDb').dbFactory());
jest.mock('../services/redis.service', () => ({
  default: { status: 'not_ready' },
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue(undefined),
}));

import notificationsRoutes from '../routes/notifications';
import { makeChildToken } from './helpers/mockAuth';

const app = express();
app.use(express.json());
app.use('/notifications', notificationsRoutes);

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

// ── GET /notifications ────────────────────────────────────────────────────────

describe('GET /notifications', () => {
  it('returns empty notifications array when DB is empty', async () => {
    // All three parallel queries (dm, comment, badge) resolve to []
    // The default chain.then returns [] — fine for all three

    const res = await request(app)
      .get('/notifications')
      .set('Authorization', `Bearer ${CHILD_TOKEN}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.notifications)).toBe(true);
    expect(res.body.notifications).toHaveLength(0);
  });

  it('returns notifications with correct shape for DMs', async () => {
    const now = new Date().toISOString();
    const chain = getChain();

    // The controller does Promise.all on three queries.
    // We configure .then to return results in order: dm, comment, badge.
    chain.then
      .mockImplementationOnce((r: (v: unknown) => unknown) =>
        Promise.resolve([
          {
            id: 'msg-1',
            content: 'Hey there!',
            created_at: now,
            read: false,
            friend_id: 'friend-1',
            friend_name: 'Zara',
            friend_emoji: '🌟🌟',
          },
        ]).then(r),
      )
      .mockImplementationOnce((r: (v: unknown) => unknown) => Promise.resolve([]).then(r))
      .mockImplementationOnce((r: (v: unknown) => unknown) => Promise.resolve([]).then(r));

    const res = await request(app)
      .get('/notifications')
      .set('Authorization', `Bearer ${CHILD_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.notifications).toHaveLength(1);
    expect(res.body.notifications[0]).toMatchObject({
      type: 'dm',
      friendName: 'Zara',
      preview: 'Hey there!',
      read: false,
    });
  });

  it('returns badge notifications with correct shape', async () => {
    const now = new Date().toISOString();
    const chain = getChain();

    chain.then
      .mockImplementationOnce((r: (v: unknown) => unknown) => Promise.resolve([]).then(r))
      .mockImplementationOnce((r: (v: unknown) => unknown) => Promise.resolve([]).then(r))
      .mockImplementationOnce((r: (v: unknown) => unknown) =>
        Promise.resolve([
          {
            id: 'cb-1', earned_at: now, seen: false,
            name: 'First Post', name_fr: null,
            badge_icon: '✏️',
            description: 'Share your first post', description_fr: null,
            language: 'en',
          },
        ]).then(r),
      );

    const res = await request(app)
      .get('/notifications')
      .set('Authorization', `Bearer ${CHILD_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.notifications).toHaveLength(1);
    expect(res.body.notifications[0]).toMatchObject({
      type: 'badge',
      friendName: 'First Post',
      friendEmoji: '✏️',
      read: false,
    });
  });

  it('returns 401 without auth', async () => {
    const res = await request(app).get('/notifications');
    expect(res.status).toBe(401);
  });
});

// ── PUT /notifications/:id ────────────────────────────────────────────────────

describe('PUT /notifications/:id', () => {
  it('marks a DM notification as read', async () => {
    getChain().returning.mockResolvedValueOnce([{ id: 'msg-1', read: true }]);

    const res = await request(app)
      .put('/notifications/msg-1')
      .set('Authorization', `Bearer ${CHILD_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('marks a comment notification as read', async () => {
    const res = await request(app)
      .put('/notifications/comment-abc123')
      .set('Authorization', `Bearer ${CHILD_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('marks a badge notification as read', async () => {
    const res = await request(app)
      .put('/notifications/badge-xyz789')
      .set('Authorization', `Bearer ${CHILD_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('returns 401 without auth', async () => {
    const res = await request(app).put('/notifications/msg-1');
    expect(res.status).toBe(401);
  });
});
