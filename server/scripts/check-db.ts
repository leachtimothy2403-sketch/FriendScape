import knex from 'knex';
import config from '../src/db/knexfile';

const db = knex((config as Record<string, unknown>).development as Parameters<typeof knex>[0]);

async function check() {
  console.log('\n═══════════════════════════════════════════════');
  console.log('  Migo DB Check');
  console.log('═══════════════════════════════════════════════\n');

  // ── enrollments ──────────────────────────────────────────────────────────────
  const enrollments = await db('enrollments')
    .select('id', 'parent_email', 'status', 'child_device_id')
    .orderBy('created_at', 'desc');

  console.log(`enrollments (${enrollments.length} rows)`);
  console.log('─────────────────────────────────────────────');
  if (enrollments.length === 0) {
    console.log('  (empty)');
  } else {
    enrollments.forEach((r, i) => {
      console.log(`  [${i + 1}] id:            ${r.id}`);
      console.log(`       parent_email:  ${r.parent_email}`);
      console.log(`       status:        ${r.status}`);
      console.log(`       child_id:      ${r.child_device_id ?? 'null'}`);
      console.log('');
    });
  }

  // ── children ─────────────────────────────────────────────────────────────────
  const children = await db('children')
    .select('id', 'name', 'age', 'mascot', 'interests')
    .orderBy('created_at', 'desc');

  console.log(`children (${children.length} rows)`);
  console.log('─────────────────────────────────────────────');
  if (children.length === 0) {
    console.log('  (empty)');
  } else {
    children.forEach((r, i) => {
      console.log(`  [${i + 1}] id:        ${r.id}`);
      console.log(`       name:      ${r.name}`);
      console.log(`       age:       ${r.age}`);
      console.log(`       mascot:    ${r.mascot}`);
      console.log(`       interests: ${JSON.stringify(r.interests)}`);
      console.log('');
    });
  }

  // ── child_friends ─────────────────────────────────────────────────────────────
  const childFriends = await db('child_friends')
    .select('child_id', 'friend_id', 'friendship_level', 'friendship_xp', 'activated_at')
    .orderBy('activated_at', 'desc');

  console.log(`child_friends (${childFriends.length} rows)`);
  console.log('─────────────────────────────────────────────');
  if (childFriends.length === 0) {
    console.log('  (empty)');
  } else {
    childFriends.forEach((r, i) => {
      console.log(`  [${i + 1}] child_id:        ${r.child_id}`);
      console.log(`       friend_id:       ${r.friend_id}`);
      console.log(`       friendship_level: ${r.friendship_level}`);
      console.log(`       friendship_xp:    ${r.friendship_xp}`);
      console.log(`       activated_at:     ${r.activated_at ?? 'null'}`);
      console.log('');
    });
  }

  // ── child_memories ────────────────────────────────────────────────────────────
  const memories = await db('child_memories')
    .select('child_id', 'friend_id', 'milestones', 'last_updated')
    .orderBy('last_updated', 'desc');

  console.log(`child_memories (${memories.length} rows)`);
  console.log('─────────────────────────────────────────────');
  if (memories.length === 0) {
    console.log('  (empty)');
  } else {
    memories.forEach((r, i) => {
      console.log(`  [${i + 1}] child_id:     ${r.child_id}`);
      console.log(`       friend_id:    ${r.friend_id}`);
      console.log(`       milestones:   ${JSON.stringify(r.milestones)}`);
      console.log(`       last_updated: ${r.last_updated}`);
      console.log('');
    });
  }

  // ── posts ─────────────────────────────────────────────────────────────────────
  const postCount = await db('posts').count('id as count').first();
  const recentPosts = await db('posts')
    .leftJoin('children', 'children.id', 'posts.child_id')
    .leftJoin('ai_friends', 'ai_friends.id', 'posts.author_id')
    .select(
      'posts.id', 'posts.author_type', 'posts.mood', 'posts.created_at',
      'children.name as child_name', 'ai_friends.name as friend_name',
    )
    .orderBy('posts.created_at', 'desc')
    .limit(3);

  console.log(`posts (${(postCount as { count: string })?.count ?? 0} total, showing last 3)`);
  console.log('─────────────────────────────────────────────');
  if (recentPosts.length === 0) {
    console.log('  (empty)');
  } else {
    recentPosts.forEach((r, i) => {
      console.log(`  [${i + 1}] id:          ${r.id}`);
      console.log(`       author_type: ${r.author_type}`);
      console.log(`       child:       ${r.child_name ?? 'unknown'}`);
      console.log(`       friend:      ${r.friend_name ?? 'n/a'}`);
      console.log(`       mood:        ${r.mood ?? 'none'}`);
      console.log(`       created_at:  ${r.created_at}`);
      console.log('');
    });
  }

  // ── messages ──────────────────────────────────────────────────────────────────
  const msgCount = await db('messages').count('id as count').first();

  console.log(`messages (${(msgCount as { count: string })?.count ?? 0} total)`);
  console.log('─────────────────────────────────────────────');
  console.log('');

  // ── ai_friends ────────────────────────────────────────────────────────────────
  const aiFriends = await db('ai_friends').select('id', 'name').orderBy('name');

  console.log(`ai_friends (${aiFriends.length} rows)`);
  console.log('─────────────────────────────────────────────');
  if (aiFriends.length === 0) {
    console.log('  (empty)');
  } else {
    aiFriends.forEach((r, i) => {
      console.log(`  [${i + 1}] id:   ${r.id}`);
      console.log(`       name: ${r.name}`);
      console.log('');
    });
  }

  // ── parent_alerts ──────────────────────────────────────────────────────────────
  const alerts = await db('parent_alerts')
    .select('id', 'child_id', 'type', 'message', 'severity', 'read', 'created_at')
    .orderBy('created_at', 'desc')
    .limit(20);

  console.log(`parent_alerts (${alerts.length} rows, showing latest 20)`);
  console.log('─────────────────────────────────────────────');
  if (alerts.length === 0) {
    console.log('  (empty)');
  } else {
    alerts.forEach((r, i) => {
      console.log(`  [${i + 1}] id:         ${r.id}`);
      console.log(`       child_id:   ${r.child_id}`);
      console.log(`       type:       ${r.type}`);
      console.log(`       severity:   ${r.severity}`);
      console.log(`       read:       ${r.read}`);
      console.log(`       message:    ${r.message}`);
      console.log(`       created_at: ${r.created_at}`);
      console.log('');
    });
  }

  // ── child_sessions ────────────────────────────────────────────────────────────
  const sessionCount = await db('child_sessions').count('id as count').first();
  const recentSessions = await db('child_sessions')
    .leftJoin('children', 'children.id', 'child_sessions.child_id')
    .select(
      'child_sessions.id', 'child_sessions.session_start', 'child_sessions.session_end',
      'child_sessions.duration_minutes', 'child_sessions.date',
      'children.name as child_name',
    )
    .orderBy('child_sessions.session_start', 'desc')
    .limit(5);

  console.log(`child_sessions (${(sessionCount as { count: string })?.count ?? 0} total, showing last 5)`);
  console.log('─────────────────────────────────────────────');
  if (recentSessions.length === 0) {
    console.log('  (empty)');
  } else {
    recentSessions.forEach((r, i) => {
      console.log(`  [${i + 1}] child:    ${r.child_name ?? 'unknown'}`);
      console.log(`       date:     ${r.date}`);
      console.log(`       start:    ${r.session_start}`);
      console.log(`       end:      ${r.session_end ?? '(open)'}`);
      console.log(`       duration: ${r.duration_minutes != null ? `${Math.round(Number(r.duration_minutes))} min` : 'pending'}`);
      console.log('');
    });
  }

  // ── child_badges ──────────────────────────────────────────────────────────────
  const badgeCount = await db('child_badges').count('id as count').first();
  const recentBadges = await db('child_badges')
    .join('badge_definitions', 'badge_definitions.id', 'child_badges.badge_id')
    .leftJoin('children', 'children.id', 'child_badges.child_id')
    .select(
      'badge_definitions.name as badge_name', 'badge_definitions.icon',
      'children.name as child_name', 'child_badges.earned_at',
    )
    .orderBy('child_badges.earned_at', 'desc')
    .limit(10);

  console.log(`child_badges (${(badgeCount as { count: string })?.count ?? 0} total, showing last 10)`);
  console.log('─────────────────────────────────────────────');
  if (recentBadges.length === 0) {
    console.log('  (empty)');
  } else {
    recentBadges.forEach((r, i) => {
      console.log(`  [${i + 1}] ${r.icon} ${r.badge_name} → ${r.child_name ?? 'unknown'} (${r.earned_at})`);
    });
    console.log('');
  }

  console.log('═══════════════════════════════════════════════');
  const totalPosts    = (postCount as { count: string })?.count ?? '0';
  const totalMessages = (msgCount  as { count: string })?.count ?? '0';
  const totalSessions = (sessionCount as { count: string })?.count ?? '0';
  const totalBadges   = (badgeCount as { count: string })?.count ?? '0';
  console.log(`  Totals: ${enrollments.length} enrollments · ${children.length} children · ${childFriends.length} child_friends · ${memories.length} child_memories · ${totalPosts} posts · ${totalMessages} messages · ${aiFriends.length} ai_friends · ${alerts.length} parent_alerts · ${totalSessions} sessions · ${totalBadges} child_badges`);
  console.log('═══════════════════════════════════════════════\n');
}

check()
  .catch((err) => { console.error('DB check failed:', err); process.exit(1); })
  .finally(() => db.destroy());
