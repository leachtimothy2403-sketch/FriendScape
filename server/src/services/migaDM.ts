import db from '../db';

// Creation data for non-Miga mascots
const MASCOT_INIT: Record<string, {
  cover_emojis: string; bio: string; gender: string; personality_prompt: string;
}> = {
  finn: {
    cover_emojis: '🦊😄',
    bio: "Hey! I'm Finn the fox! I know a million jokes and always have big ideas!",
    gender: 'male',
    personality_prompt: 'You are Finn, a funny energetic fox guide on Migo. You love jokes, big ideas, and always make kids smile. Keep responses short, fun, age-appropriate for 5-12 year olds.',
  },
  pixel: {
    cover_emojis: '🤖⚡',
    bio: "Hi! I'm Pixel! I love games and gadgets and always know how to fix things.",
    gender: 'neutral',
    personality_prompt: 'You are Pixel, a clever robot guide on Migo. You love games, gadgets, and solving problems. Keep responses short, fun, age-appropriate for 5-12 year olds.',
  },
  sage: {
    cover_emojis: '🦉📚',
    bio: "Hooo there! I'm Sage, a wise owl who knows something about almost everything!",
    gender: 'female',
    personality_prompt: 'You are Sage, a wise calm owl guide on Migo. You love learning and helping kids discover new things. Keep responses short, warm, age-appropriate for 5-12 year olds.',
  },
};

// Find the Miga guide AI friend, or create her if she doesn't exist yet.
export async function findOrCreateMigaId(): Promise<string> {
  const existing = await db('ai_friends').where({ name: 'Miga' }).first();
  if (existing) return String(existing.id);

  const [miga] = await db('ai_friends')
    .insert({
      name:               'Miga',
      age:                null,
      gender:             'neutral',
      is_star_friend:     false,
      is_teacher:         false,
      cover_emojis:       '🧚✨💜',
      bio:                "Hi! I'm Miga, your magical Migo guide! I celebrate your wins and help you be the best friend you can be.",
      personality:        JSON.stringify(['warm', 'encouraging', 'celebratory', 'wise']),
      interests:          JSON.stringify(['kindness', 'friendship', 'learning']),
      match_tags:         JSON.stringify([]),
      age_range_min:      4,
      age_range_max:      12,
      personality_prompt: 'You are Miga, the warm sparkly fairy guide for Migo. You celebrate wins, teach kindness, and help children be good digital citizens.',
      avatar_style:       'cartoon',
      teacher_subjects:   JSON.stringify([]),
    })
    .returning('*');

  return String(miga.id);
}

// Find or create any mascot by name — creates Finn/Pixel/Sage if not in DB yet.
export async function findOrCreateMascotId(mascotName: string): Promise<string> {
  const key = mascotName.toLowerCase();

  if (key === 'miga') return findOrCreateMigaId();

  const existing = await db('ai_friends').whereRaw('LOWER(name) = ?', [key]).first();
  if (existing) return String(existing.id);

  const init = MASCOT_INIT[key];
  if (!init) return findOrCreateMigaId();

  const capitalizedName = key.charAt(0).toUpperCase() + key.slice(1);

  const [row] = await db('ai_friends')
    .insert({
      name:               capitalizedName,
      age:                null,
      gender:             init.gender,
      is_star_friend:     false,
      is_teacher:         false,
      cover_emojis:       init.cover_emojis,
      bio:                init.bio,
      personality:        JSON.stringify(['warm', 'fun', 'encouraging']),
      interests:          JSON.stringify(['friendship', 'fun']),
      match_tags:         JSON.stringify([]),
      age_range_min:      4,
      age_range_max:      12,
      personality_prompt: init.personality_prompt,
      avatar_style:       'cartoon',
      teacher_subjects:   JSON.stringify([]),
    })
    .returning('*');

  return String(row.id);
}

// Insert a message from the child's chosen mascot into their mascot conversation.
export async function sendMascotDM(childId: string, mascotName: string, message: string): Promise<void> {
  const mascotId = await findOrCreateMascotId(mascotName);

  let conversation = await db('conversations')
    .where({ child_id: childId, friend_id: mascotId })
    .first();

  if (!conversation) {
    [conversation] = await db('conversations')
      .insert({ child_id: childId, friend_id: mascotId })
      .returning('*');
  }

  await db('messages').insert({
    conversation_id: String(conversation.id),
    sender_id:       mascotId,
    sender_type:     'ai',
    content:         message,
  });

  await db('conversations')
    .where({ id: String(conversation.id) })
    .update({ updated_at: new Date() });
}

// Insert a message from Miga into the child's Miga conversation.
export async function sendMigaDM(childId: string, message: string): Promise<void> {
  const migaId = await findOrCreateMigaId();

  let conversation = await db('conversations')
    .where({ child_id: childId, friend_id: migaId })
    .first();

  if (!conversation) {
    [conversation] = await db('conversations')
      .insert({ child_id: childId, friend_id: migaId })
      .returning('*');
  }

  await db('messages').insert({
    conversation_id: String(conversation.id),
    sender_id:       migaId,
    sender_type:     'ai',
    content:         message,
  });

  await db('conversations')
    .where({ id: String(conversation.id) })
    .update({ updated_at: new Date() });
}
