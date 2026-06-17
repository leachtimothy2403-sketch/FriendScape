import express from 'express';
import request from 'supertest';

jest.mock('../db', () => require('./helpers/mockDb').dbFactory());
jest.mock('../services/redis.service', () => ({
  default: { status: 'not_ready' },
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../services/ai.service', () => ({
  generateDailyPosts: jest.fn().mockResolvedValue({ posts: [], inputTokens: 0, outputTokens: 0 }),
  generatePostComment: jest.fn().mockResolvedValue({ text: 'Nice!', inputTokens: 0, outputTokens: 0 }),
  buildMemoryBrief: jest.fn().mockReturnValue(null),
}));
jest.mock('../services/avatar.service', () => ({
  generatePostImage: jest.fn().mockResolvedValue('https://example.com/post.png'),
}));
jest.mock('../controllers/badges.controller', () => ({
  checkBadgesForChild: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../utils/db-mappers', () => ({
  toChildType: jest.fn((row) => row),
  toFriendType: jest.fn((row) => row),
  toMemoryType: jest.fn((row) => row),
}));

jest.useFakeTimers();

import postsRoutes from '../routes/posts';
import { makeChildToken } from './helpers/mockAuth';

const app = express();
app.use(express.json());
app.use('/posts', postsRoutes);

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
afterEach(() => jest.clearAllTimers());

const CHILD_TOKEN = makeChildToken('child-123');

// ── GET /posts/feed ───────────────────────────────────────────────────────────

describe('GET /posts/feed', () => {
  it('returns posts array with correct shape', async () => {
    const chain = getChain();

    // posts query → via .then
    chain.then
      .mockImplementationOnce((r: (v: unknown) => unknown) =>
        Promise.resolve([
          { id: 'post-1', content: 'Hello!', author_type: 'ai', child_id: 'child-123',
            author_id: 'friend-1', mood: 'happy', scene_emojis: '🌟', image_url: null,
            created_at: new Date().toISOString(), friend_name: 'Zara',
            friend_cover_emojis: '🌟', friend_avatar_url: null },
        ]).then(r),
      )
      // reactions query (postIds.length > 0)
      .mockImplementationOnce((r: (v: unknown) => unknown) => Promise.resolve([]).then(r))
      // comments query
      .mockImplementationOnce((r: (v: unknown) => unknown) => Promise.resolve([]).then(r));

    const res = await request(app)
      .get('/posts/feed')
      .set('Authorization', `Bearer ${CHILD_TOKEN}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.posts)).toBe(true);
    expect(res.body.posts[0]).toHaveProperty('reactions');
    expect(res.body.posts[0]).toHaveProperty('comments');
  });

  it('returns empty array when no posts', async () => {
    const res = await request(app)
      .get('/posts/feed')
      .set('Authorization', `Bearer ${CHILD_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.posts).toEqual([]);
  });

  it('returns 401 without auth', async () => {
    const res = await request(app).get('/posts/feed');
    expect(res.status).toBe(401);
  });
});

// ── POST /posts ───────────────────────────────────────────────────────────────

describe('POST /posts', () => {
  it('creates a post and returns 201', async () => {
    const postRow = {
      id: 'post-new', content: 'My first post!', author_type: 'child',
      child_id: 'child-123', author_id: 'child-123', mood: null,
      created_at: new Date().toISOString(),
    };
    getChain().returning.mockResolvedValueOnce([postRow]);

    const res = await request(app)
      .post('/posts')
      .set('Authorization', `Bearer ${CHILD_TOKEN}`)
      .send({ content: 'My first post!' });

    expect(res.status).toBe(201);
    expect(res.body.post).toMatchObject({ content: 'My first post!' });
  });

  it('returns 400 when content is missing', async () => {
    const res = await request(app)
      .post('/posts')
      .set('Authorization', `Bearer ${CHILD_TOKEN}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/content/i);
  });

  it('returns 400 when content is empty string', async () => {
    const res = await request(app)
      .post('/posts')
      .set('Authorization', `Bearer ${CHILD_TOKEN}`)
      .send({ content: '   ' });

    expect(res.status).toBe(400);
  });

  it('returns 401 without auth', async () => {
    const res = await request(app).post('/posts').send({ content: 'hi' });
    expect(res.status).toBe(401);
  });
});

// ── POST /posts/:id/react ─────────────────────────────────────────────────────

describe('POST /posts/:id/react', () => {
  it('adds a reaction and returns reactions map', async () => {
    const chain = getChain();

    // No existing reaction → toggle adds
    chain.first.mockResolvedValueOnce(null);
    // reactions grouped query
    chain.then.mockImplementationOnce((r: (v: unknown) => unknown) =>
      Promise.resolve([{ emoji: '❤️', count: 1 }]).then(r),
    );

    const res = await request(app)
      .post('/posts/post-1/react')
      .set('Authorization', `Bearer ${CHILD_TOKEN}`)
      .send({ emoji: '❤️' });

    expect(res.status).toBe(200);
    expect(res.body.toggled).toBe(true);
    expect(res.body.reactions).toHaveProperty('❤️');
  });

  it('removes reaction on second call (toggle)', async () => {
    const chain = getChain();

    // Existing reaction found → toggle removes
    chain.first.mockResolvedValueOnce({ id: 'react-1', emoji: '❤️' });
    // reactions after delete
    chain.then.mockImplementationOnce((r: (v: unknown) => unknown) =>
      Promise.resolve([]).then(r),
    );

    const res = await request(app)
      .post('/posts/post-1/react')
      .set('Authorization', `Bearer ${CHILD_TOKEN}`)
      .send({ emoji: '❤️' });

    expect(res.status).toBe(200);
    expect(res.body.toggled).toBe(false);
    expect(res.body.reactions).toEqual({});
  });

  it('returns 400 when emoji is missing', async () => {
    const res = await request(app)
      .post('/posts/post-1/react')
      .set('Authorization', `Bearer ${CHILD_TOKEN}`)
      .send({});

    expect(res.status).toBe(400);
  });
});

// ── POST /posts/:id/comments ──────────────────────────────────────────────────

describe('POST /posts/:id/comments', () => {
  it('adds a comment to a post', async () => {
    const chain = getChain();
    // post ownership check
    chain.first.mockResolvedValueOnce({
      id: 'post-1', child_id: 'child-123', author_type: 'child', author_id: 'child-123',
    });
    const commentRow = {
      id: 'comment-1', post_id: 'post-1', author_id: 'child-123',
      author_type: 'child', content: 'Great day!', created_at: new Date().toISOString(),
    };
    chain.returning.mockResolvedValueOnce([commentRow]);

    const res = await request(app)
      .post('/posts/post-1/comments')
      .set('Authorization', `Bearer ${CHILD_TOKEN}`)
      .send({ text: 'Great day!' });

    expect(res.status).toBe(201);
    expect(res.body.comment).toMatchObject({ content: 'Great day!' });
  });

  it('returns 404 when post not found', async () => {
    getChain().first.mockResolvedValueOnce(null);

    const res = await request(app)
      .post('/posts/missing-post/comments')
      .set('Authorization', `Bearer ${CHILD_TOKEN}`)
      .send({ text: 'Hi!' });

    expect(res.status).toBe(404);
  });

  it('returns 400 when text is missing', async () => {
    const res = await request(app)
      .post('/posts/post-1/comments')
      .set('Authorization', `Bearer ${CHILD_TOKEN}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/text/i);
  });
});
