import knex from 'knex';
import config from '../src/db/knexfile';

const db = knex((config as Record<string, unknown>).development as Parameters<typeof knex>[0]);

const DAY_MS = 24 * 60 * 60 * 1000;

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * DAY_MS);
}

async function run() {
  console.log('\n═══════════════════════════════════════════════');
  console.log('  myMigo — Beta Metrics (rough pass)');
  console.log('═══════════════════════════════════════════════\n');

  const children = await db('children')
    .select('id', 'name', 'created_at', 'safety_class_level')
    .orderBy('created_at', 'asc') as Array<{
      id: string; name: string; created_at: string; safety_class_level: number | null;
    }>;

  if (children.length === 0) {
    console.log('No children onboarded yet.\n');
    await db.destroy();
    return;
  }

  const childIds = children.map(c => c.id);

  const [
    sessionAgg,
    lastSession,
    postAgg,
    messageAgg,
    friendAgg,
    badgeAgg,
  ] = await Promise.all([
    db('child_sessions')
      .whereIn('child_id', childIds)
      .groupBy('child_id')
      .select('child_id', db.raw('count(*) as session_count'), db.raw('coalesce(sum(duration_minutes), 0) as total_minutes')),

    db('child_sessions')
      .whereIn('child_id', childIds)
      .groupBy('child_id')
      .select('child_id', db.raw('max(session_start) as last_session')),

    db('posts')
      .whereIn('child_id', childIds)
      .where({ author_type: 'child' })
      .groupBy('child_id')
      .select('child_id', db.raw('count(*) as post_count')),

    db('messages')
      .join('conversations', 'conversations.id', 'messages.conversation_id')
      .whereIn('conversations.child_id', childIds)
      .where('messages.sender_type', 'child')
      .groupBy('conversations.child_id')
      .select('conversations.child_id as child_id', db.raw('count(*) as message_count')),

    db('child_friends')
      .whereIn('child_id', childIds)
      .groupBy('child_id')
      .select('child_id', db.raw('count(*) as friend_count')),

    db('child_badges')
      .whereIn('child_id', childIds)
      .groupBy('child_id')
      .select('child_id', db.raw('count(*) as badge_count')),
  ]) as [
    Array<{ child_id: string; session_count: string; total_minutes: string }>,
    Array<{ child_id: string; last_session: string }>,
    Array<{ child_id: string; post_count: string }>,
    Array<{ child_id: string; message_count: string }>,
    Array<{ child_id: string; friend_count: string }>,
    Array<{ child_id: string; badge_count: string }>,
  ];

  const asMap = <T extends { child_id: string }>(rows: T[]) =>
    new Map(rows.map(r => [r.child_id, r]));

  const sessM  = asMap(sessionAgg);
  const lastM  = asMap(lastSession);
  const postM  = asMap(postAgg);
  const msgM   = asMap(messageAgg);
  const friM   = asMap(friendAgg);
  const badM   = asMap(badgeAgg);

  type Row = {
    id: string; name: string; signedUp: string; daysSince: number;
    sessions: number; minutes: number; lastActive: string;
    posts: number; messages: number; friends: number; badges: number;
    safetyLevel: number;
  };

  const rows: Row[] = children.map(c => {
    const signedUpDate = new Date(c.created_at);
    const daysSince = Math.floor((Date.now() - signedUpDate.getTime()) / DAY_MS);
    const last = lastM.get(c.id)?.last_session;
    return {
      id:          c.id,
      name:        c.name,
      signedUp:    signedUpDate.toISOString().slice(0, 10),
      daysSince,
      sessions:    Number(sessM.get(c.id)?.session_count ?? 0),
      minutes:     Math.round(Number(sessM.get(c.id)?.total_minutes ?? 0)),
      lastActive:  last ? new Date(last).toISOString().slice(0, 16).replace('T', ' ') : 'never',
      posts:       Number(postM.get(c.id)?.post_count ?? 0),
      messages:    Number(msgM.get(c.id)?.message_count ?? 0),
      friends:     Number(friM.get(c.id)?.friend_count ?? 0),
      badges:      Number(badM.get(c.id)?.badge_count ?? 0),
      safetyLevel: c.safety_class_level ?? 0,
    };
  });

  // ── Per-child table ────────────────────────────────────────────────────────
  console.log('Per-child summary');
  console.log('─────────────────────────────────────────────────────────────────────────────────────────');
  console.log(
    'name'.padEnd(12) + 'signed up'.padEnd(12) + 'days'.padEnd(6) + 'sessions'.padEnd(10) +
    'minutes'.padEnd(9) + 'last active'.padEnd(18) + 'posts'.padEnd(7) + 'msgs'.padEnd(7) +
    'friends'.padEnd(9) + 'badges'.padEnd(8) + 'safety',
  );
  rows.forEach(r => {
    console.log(
      r.name.slice(0, 11).padEnd(12) + r.signedUp.padEnd(12) + String(r.daysSince).padEnd(6) +
      String(r.sessions).padEnd(10) + String(r.minutes).padEnd(9) + r.lastActive.padEnd(18) +
      String(r.posts).padEnd(7) + String(r.messages).padEnd(7) + String(r.friends).padEnd(9) +
      String(r.badges).padEnd(8) + `${r.safetyLevel}/3`,
    );
  });
  console.log('');

  // ── Aggregate stats ──────────────────────────────────────────────────────────
  const total = children.length;

  const activeSince = async (since: Date) =>
    (await db('child_sessions')
      .whereIn('child_id', childIds)
      .where('session_start', '>=', since)
      .countDistinct('child_id as c')
      .first() as { c: string } | undefined)?.c ?? '0';

  const activeToday = Number(await activeSince(daysAgo(1)));
  const activeWeek  = Number(await activeSince(daysAgo(7)));

  const eligibleForRetention = rows.filter(r => r.daysSince >= 7);
  const retained7d = eligibleForRetention.filter(r => {
    const last = lastM.get(r.id)?.last_session;
    return last && new Date(last) >= daysAgo(7);
  }).length;

  const pct = (n: number, d: number) => d === 0 ? 'n/a' : `${Math.round((n / d) * 100)}%`;

  const postedAtLeastOnce   = rows.filter(r => r.posts > 0).length;
  const messagedAtLeastOnce = rows.filter(r => r.messages > 0).length;
  const addedFriend         = rows.filter(r => r.friends > 0).length;
  const earnedBadge         = rows.filter(r => r.badges > 0).length;
  const completedSafety     = rows.filter(r => r.safetyLevel >= 3).length;

  const avgSessions = rows.reduce((s, r) => s + r.sessions, 0) / total;
  const avgMinutes  = rows.reduce((s, r) => s + r.minutes, 0) / total;

  console.log('Aggregate');
  console.log('─────────────────────────────────────────────────────────────────────────────────────────');
  console.log(`  Onboarded (total children):        ${total}`);
  console.log(`  Active in last 24h:                 ${activeToday} (${pct(activeToday, total)})`);
  console.log(`  Active in last 7 days:               ${activeWeek} (${pct(activeWeek, total)})`);
  console.log(`  7-day retention (of those old enough): ${retained7d}/${eligibleForRetention.length} (${pct(retained7d, eligibleForRetention.length)})`);
  console.log(`  Avg sessions per child:              ${avgSessions.toFixed(1)}`);
  console.log(`  Avg total minutes per child:          ${avgMinutes.toFixed(0)}`);
  console.log(`  Posted at least once:                ${postedAtLeastOnce} (${pct(postedAtLeastOnce, total)})`);
  console.log(`  Sent at least one message:            ${messagedAtLeastOnce} (${pct(messagedAtLeastOnce, total)})`);
  console.log(`  Added at least one friend:            ${addedFriend} (${pct(addedFriend, total)})`);
  console.log(`  Earned at least one badge:            ${earnedBadge} (${pct(earnedBadge, total)})`);
  console.log(`  Completed all 3 Sophie safety levels:  ${completedSafety} (${pct(completedSafety, total)})`);
  console.log('═══════════════════════════════════════════════\n');
}

run()
  .catch((err) => { console.error('Beta metrics failed:', err); process.exit(1); })
  .finally(() => db.destroy());
