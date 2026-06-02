import db from '../db';

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
