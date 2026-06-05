/**
 * Demo friend generation script.
 * Generates personalised AI friends for 3 demo child profiles via Claude,
 * inserts them into ai_friends (is_generated=true), and logs the results.
 *
 * Usage: npm run demo:generate
 */

import * as dotenv from 'dotenv';
dotenv.config();

import db from '../src/db';
import { generatePersonalisedFriends } from '../src/services/ai.service';
import type { Child } from '../../shared/types';

const DEMO_PROFILES: Child[] = [
  {
    id:           'demo-juliette',
    parentId:     'demo-parent',
    name:         'Juliette',
    age:          12,
    gender:       'girl',
    language:     'en',
    interests:    ['TV shows', 'Animals', 'Nature', 'Theatre', 'Cats'],
    personalityTraits:   ['quiet_listener', 'feels_deeply', 'kind_caring', 'homebody', 'shy'],
    personalityFreeText: 'I love cats more than anything. I am in a theatre band. I have a learning and physical disability so please be patient and kind.',
    specialNeeds: ['learning', 'physical'],
    preReader:    false,
    avatarTheme:  'animals',
    mascot:       'luna',
    selectedPack: '',
    avatarUrl:    null,
    createdAt:    new Date(),
    updatedAt:    new Date(),
  },
  {
    id:           'demo-morgan',
    parentId:     'demo-parent',
    name:         'Morgan',
    age:          11,
    gender:       'boy',
    language:     'fr',
    interests:    ['Football', 'Vélo', 'Lego', 'Jeux vidéo', 'Sport'],
    personalityTraits:   ['quiet_listener', 'resilient_mid', 'thoughtful', 'balanced', 'situational'],
    personalityFreeText: "Je suis fan de football surtout le PSG. J'adore construire des Lego complexes.",
    specialNeeds: [],
    preReader:    false,
    avatarTheme:  'animals',
    mascot:       'luna',
    selectedPack: '',
    avatarUrl:    null,
    createdAt:    new Date(),
    updatedAt:    new Date(),
  },
  {
    id:           'demo-camille',
    parentId:     'demo-parent',
    name:         'Camille',
    age:          8,
    gender:       'girl',
    language:     'fr',
    interests:    ['Princesses', 'Coloriage', 'Cheerleading', 'Danse', 'Art'],
    personalityTraits:   ['outgoing', 'resilient', 'kind_caring', 'adventurous', 'outgoing'],
    personalityFreeText: "J'adore les princesses Disney surtout Raiponce. Je fais du cheerleading et j'ai beaucoup d'amies. Parfois je me mets en colère mais ça passe vite.",
    specialNeeds: [],
    preReader:    false,
    avatarTheme:  'fantasy',
    mascot:       'luna',
    selectedPack: '',
    avatarUrl:    null,
    createdAt:    new Date(),
    updatedAt:    new Date(),
  },
];

const STAR_FRIEND_RULES: Record<string, string> = {
  sports:      'Jake',
  football:    'Jake',
  soccer:      'Jake',
  vélo:        'Jake',
  drama:       'Zara',
  theatre:     'Zara',
  theater:     'Zara',
  art:         'Zara',
  stories:     'Zara',
};

function pickStarFriend(interests: string[]): string {
  const lower = interests.map((i) => i.toLowerCase());
  for (const i of lower) {
    if (STAR_FRIEND_RULES[i]) return STAR_FRIEND_RULES[i];
  }
  return 'Zara';
}

async function run() {
  console.log('\n🚀 Migo Demo Friend Generator\n' + '='.repeat(40));

  for (const profile of DEMO_PROFILES) {
    console.log(`\n👤 Generating for: ${profile.name} (age ${profile.age}, ${profile.language})`);
    console.log(`   Interests:  ${profile.interests?.join(', ')}`);
    console.log(`   Traits:     ${profile.personalityTraits?.join(', ')}`);
    console.log(`   Free text:  ${profile.personalityFreeText}`);
    if (profile.specialNeeds?.length) {
      console.log(`   Needs:      ${profile.specialNeeds.join(', ')}`);
    }

    try {
      const result = await generatePersonalisedFriends(profile, profile.language, 2);

      if (result.error) {
        console.error(`   ❌ Generation failed: ${result.error}`);
        continue;
      }

      console.log(`\n   ✅ Generated ${result.friends.length} friends (${result.inputTokens}→${result.outputTokens} tokens)`);

      for (const f of result.friends) {
        console.log(`\n   ── ${f.name} (${f.gender}, age ${f.age}) ${f.coverEmojis}`);
        console.log(`      Bio:          ${f.bio}`);
        console.log(`      Personality:  ${f.personality.join(', ')}`);
        console.log(`      Interests:    ${f.interests.join(', ')}`);
        console.log(`      Intro message: ${f.introMessage}`);
        console.log(`      Quirk:        ${f.quirk}`);
        console.log(`      Rel type:     ${f.relationshipType}`);

        // Insert into ai_friends
        const [inserted] = await db('ai_friends').insert({
          name:               f.name,
          age:                f.age,
          gender:             f.gender,
          bio:                f.bio,
          personality:        JSON.stringify(f.personality),
          interests:          JSON.stringify(f.interests),
          match_tags:         JSON.stringify(f.matchTags),
          cover_emojis:       f.coverEmojis,
          personality_prompt: f.personalityPrompt,
          relationship_type:  f.relationshipType,
          is_star_friend:     false,
          is_teacher:         false,
          is_generated:       true,
          age_range_min:      Math.max(5, profile.age - 2),
          age_range_max:      Math.min(12, profile.age + 2),
          avatar_style:       'cartoon',
          teacher_subjects:   JSON.stringify([]),
        }).returning('id');

        console.log(`      DB id:        ${(inserted as { id: string }).id}`);
      }

      const starName = pickStarFriend(profile.interests ?? []);
      console.log(`\n   ⭐ Would assign star friend: ${starName}`);

    } catch (err) {
      console.error(`   ❌ Error:`, err);
    }
  }

  console.log('\n' + '='.repeat(40));
  console.log('✅ Done. Check ai_friends WHERE is_generated = true.\n');
  process.exit(0);
}

run().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
