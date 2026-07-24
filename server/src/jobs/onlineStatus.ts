import cron from 'node-cron';
import db from '../db';

const ENERGETIC_FRIENDS = ['Jake', 'Hugo', 'Nico'];
const QUIET_FRIENDS     = ['Sage', 'Ms. Luna', 'Prof Max'];

function onlineChance(name: string): number {
  if (ENERGETIC_FRIENDS.includes(name)) return 0.8;
  if (QUIET_FRIENDS.includes(name))     return 0.5;
  return 0.7;
}

async function updateOnlineStatuses(): Promise<void> {
  const currentHour = new Date().getHours();

  const friends = await db('ai_friends').select(
    'id', 'name', 'online_hours_start', 'online_hours_end',
  ) as Array<{
    id: string;
    name: string;
    online_hours_start: number;
    online_hours_end: number;
  }>;

  const updates = friends.map((f) => {
    const inHours = currentHour >= f.online_hours_start && currentHour < f.online_hours_end;
    const is_online = inHours && Math.random() < onlineChance(f.name);
    return { id: f.id, is_online };
  });

  // Ensure at least one friend is online — force the one with the earliest start hour
  const anyOnline = updates.some((u) => u.is_online);
  if (!anyOnline && friends.length > 0) {
    const earliest = friends.reduce((a, b) =>
      a.online_hours_start <= b.online_hours_start ? a : b,
    );
    const target = updates.find((u) => u.id === earliest.id);
    if (target) target.is_online = true;
  }

  await Promise.all(
    updates.map((u) => db('ai_friends').where({ id: u.id }).update({ is_online: u.is_online })),
  );

  const onlineCount = updates.filter((u) => u.is_online).length;
  console.log(`[online] 📡 Updated ${friends.length} friends status — ${onlineCount} online`);
}

cron.schedule('*/5 * * * *', () => {
  updateOnlineStatuses().catch((err: unknown) =>
    console.error('[online] ❌ Status update failed:', err),
  );
});

console.log('[online] 📡 Online status job scheduled');
