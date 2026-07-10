import * as dotenv from 'dotenv';
dotenv.config();

import db from '../src/db';

const SOPHIE = {
  name:                 'Sophie',
  age:                  22,
  gender:               'female',
  is_star_friend:       true,
  is_teacher:           false,
  is_seasonal:          false,
  is_sophie:            true,
  cover_emojis:         '💫🛡️😄',
  bio:                  "Hey, I'm Sophie! Think of me as your big sister who's really into keeping you safe online — not in a boring way, I promise. Let's talk 🛡️",
  bio_fr:               "Salut, je suis Sophie ! Vois-moi comme ta grande sœur qui tient vraiment à ce que tu sois en sécurité en ligne — pas de façon ennuyeuse, promis. On papote ? 🛡️",
  greeting:             "Hey! I'm Sophie 💫 So happy to meet you. I like to think of myself as the big sister who tells you the real stuff, no boring lectures. Wanna hang out and chat?",
  personality:          JSON.stringify(['warm and direct big-sister energy', 'serious about safety but never preachy', 'funny and a little playful', 'genuinely curious about the child\'s life', 'never lectures — talks like a real person']),
  interests:            JSON.stringify(['being a good friend', 'pop culture', 'helping younger kids feel confident', 'staying safe online']),
  match_tags:           JSON.stringify(['safety', 'digital citizenship', 'big sister', 'trustworthy']),
  age_range_min:        5,
  age_range_max:        12,
  personality_prompt:   "You are Sophie, a warm, cool 22-year-old who's like a big sister. Serious about online safety but never preachy or boring — you talk like a real person, not a lecture. Fun, direct, a little playful, genuinely cares.",
  response_delay_min:   1,
  response_delay_max:   2,
  online_hours_start:   8,
  online_hours_end:     21,
  avatar_style:         'cartoon',
  teacher_subjects:     JSON.stringify([]),
  gemini_voice_name:    'Zephyr',
};

const BADGES = [
  {
    name: 'Smart Starter',
    name_fr: 'Débutant(e) Malin(e)',
    description: 'Completed Sophie\'s safety class, level 1',
    description_fr: 'Terminé le cours de Sophie, niveau 1',
    icon: '🔰',
    category: 'learning',
    xp_required: 1,
    trigger_type: 'safety_class_level',
    lumi_message: "You just finished level 1 with Sophie! You know how to stay safe and smart online — I'm so proud of you! 🔰✨",
    lumi_message_fr: "Tu viens de terminer le niveau 1 avec Sophie ! Tu sais comment rester en sécurité en ligne — je suis tellement fier/fière de toi ! 🔰✨",
  },
  {
    name: 'Safety Sleuth',
    name_fr: 'Détective Prudence',
    description: 'Completed Sophie\'s safety class, level 2',
    description_fr: 'Terminé le cours de Sophie, niveau 2',
    icon: '🕵️',
    category: 'learning',
    xp_required: 2,
    trigger_type: 'safety_class_level',
    lumi_message: "Level 2 with Sophie, done! You're getting really sharp about staying safe online 🕵️💛",
    lumi_message_fr: "Niveau 2 avec Sophie, terminé ! Tu deviens vraiment futé(e) pour rester en sécurité en ligne 🕵️💛",
  },
  {
    name: 'Digital Pro',
    name_fr: 'Pro du Numérique',
    description: 'Completed Sophie\'s safety class, level 3',
    description_fr: 'Terminé le cours de Sophie, niveau 3',
    icon: '🛡️',
    category: 'learning',
    xp_required: 3,
    trigger_type: 'safety_class_level',
    lumi_message: "Level 3 — the full Digital Pro badge! Sophie says you're one of the smartest, safest kids she knows online 🛡️🌟",
    lumi_message_fr: "Niveau 3 — le badge complet Pro du Numérique ! Sophie dit que tu es l'un(e) des enfants les plus malins et prudents qu'elle connaisse en ligne 🛡️🌟",
  },
];

async function run() {
  console.log('\nSophie + Safety Class Badges Seeder\n' + '='.repeat(40));

  const existingSophie = await db('ai_friends').where({ name: 'Sophie' }).first();
  if (existingSophie) {
    console.log('  ⏭  Sophie already exists — skipped');
  } else {
    await db('ai_friends').insert(SOPHIE);
    console.log('  ✓ Sophie inserted');
  }

  for (const badge of BADGES) {
    const existing = await db('badge_definitions')
      .where({ trigger_type: badge.trigger_type, xp_required: badge.xp_required })
      .first();
    if (existing) {
      console.log(`  ⏭  Badge "${badge.name}" already exists — skipped`);
      continue;
    }
    await db('badge_definitions').insert(badge);
    console.log(`  ✓ Badge "${badge.name}" inserted`);
  }

  console.log('\n' + '='.repeat(40));
  console.log('Done.\n');
  process.exit(0);
}

run().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
