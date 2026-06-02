import Redis from 'ioredis';

const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

const redis = new Redis(redisUrl, { lazyConnect: true });

redis.on('error', (err) => console.error('❌ Redis error:', err));

export async function connectRedis(): Promise<void> {
  try {
    await redis.connect();
    console.log('✅ Redis connected');
  } catch (err) {
    if (process.env.NODE_ENV === 'production') {
      throw err;
    }
    console.warn('⚠️  Redis unavailable — caching disabled for this session:', (err as Error).message);
  }
}

export async function set(key: string, value: string, ttlSeconds?: number): Promise<void> {
  if (redis.status !== 'ready') return;
  if (ttlSeconds) {
    await redis.set(key, value, 'EX', ttlSeconds);
  } else {
    await redis.set(key, value);
  }
}

export async function get(key: string): Promise<string | null> {
  if (redis.status !== 'ready') return null;
  return redis.get(key);
}

export async function del(key: string): Promise<void> {
  if (redis.status !== 'ready') return;
  await redis.del(key);
}

export async function exists(key: string): Promise<boolean> {
  if (redis.status !== 'ready') return false;
  return (await redis.exists(key)) === 1;
}

export default redis;
