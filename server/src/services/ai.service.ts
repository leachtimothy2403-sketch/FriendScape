// ============================================================
// server/src/services/ai.service.ts
// Migo — Central AI Service
// All Claude API calls go through this file.
// ============================================================

import Anthropic from '@anthropic-ai/sdk';
import { Child, AIFriend, ChildMemory } from '../../../shared/types';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MODELS = {
  smart: 'claude-sonnet-4-6',
  fast:  'claude-haiku-4-5-20251001',
} as const;

const MAX_TOKENS = {
  friendReply:          300,
  dailyPosts:           800,
  moodCheck:            250,
  memoryDistill:        500,
  friendMatch:          600,
  tutorReply:           400,
  mascotReply:          250,
  digitalCitizenship:   350,
  networkWelcome:       200,
  personalisedFriends:  2500,
} as const;


// ── Public types ─────────────────────────────────────────────────────────────

export interface AITokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface FriendReplyResult extends AITokenUsage {
  text: string;
}

export interface DailyPost {
  friendId: string;
  friendName: string;
  text: string;
  sceneEmojis: string;
  mood: string;
}

export interface DailyPostsResult extends AITokenUsage {
  posts: DailyPost[];
  error?: string;
}

export type MoodLabel    = 'happy' | 'neutral' | 'sad' | 'worried' | 'angry' | 'lonely';
export type MoodIntensity = 'low' | 'medium' | 'high';

export interface MoodResult extends AITokenUsage {
  mood: MoodLabel;
  intensity: MoodIntensity;
  crisisFlag: boolean;
  crisisReason: string | null;
  parentAlertNeeded: boolean;
  parentAlertReason: string | null;
  suggestParentTalk: boolean;
  parseError?: boolean;
}

export interface ConversationMessage {
  senderType: 'child' | 'ai';
  content: string;
}

export interface ConversationWithMessages {
  friendName: string;
  messages: ConversationMessage[];
}

export interface DistilledMemory {
  updatedFacts: string[];
  newEmotionalEvents: string[];
  newMilestones: string[];
  friendshipUpdates: Record<string, string>;
  interestRefinements: string[];
}

export interface DistillResult extends AITokenUsage {
  memory: DistilledMemory | null;
  error?: string;
}

export interface FriendMatch {
  friendId: string;
  friendName: string;
  matchScore: number;
  matchReason: string;
}

export interface MatchResult extends AITokenUsage {
  matches: FriendMatch[];
  error?: string;
}

export type MascotName        = 'Miga' | 'Pixel' | 'Finn' | 'Sage';
export type MascotMessageType = 'help' | 'celebration' | 'checkin' | 'crisis_support' | 'general';

export interface Mascot {
  name: MascotName;
}

export type FriendForAI = AIFriend & {
  age?: number;
  subject?: string;
};

export type ExtendedMemory = Partial<ChildMemory> & {
  interestRefinements?: string[];
  friendshipUpdates?: Record<string, string>;
};


// ── Private helpers ───────────────────────────────────────────────────────────

function buildChildContext(child: Child, memoryBrief: string | null): string {
  const needs: string[] = [];
  if (child.preReader)                               needs.push('cannot read yet — keep all text very simple and short');
  if (child.specialNeeds.includes('dyslexia'))       needs.push('has dyslexia — use simple words, avoid long sentences');
  if (child.specialNeeds.includes('adhd'))           needs.push('has ADHD — keep messages very short and energetic');
  if (child.specialNeeds.includes('autism'))         needs.push('is on the autism spectrum — be explicit, avoid sarcasm, be predictable');
  if (child.specialNeeds.includes('motorNeeds'))     needs.push('has motor needs — no time pressure in responses');

  return `
CHILD PROFILE:
- Name: ${child.name}
- Age: ${child.age}
- Gender: ${child.gender}
- Language: ${child.language}
- Interests: ${child.interests.join(', ') || 'not yet known'}
${needs.length ? `- Special considerations: ${needs.join('; ')}` : ''}

WHAT YOU KNOW ABOUT ${child.name.toUpperCase()} (from memory):
${memoryBrief ?? 'This is your first interaction — you are just getting to know them.'}
`.trim();
}

function buildLanguageInstruction(language: string, isFrenchFriend = false): string {
  if (language === 'fr') {
    return `
LANGUE: Tu dois TOUJOURS répondre en français.
Utilise un français simple et adapté aux enfants.
Ne mélange jamais le français et l'anglais.
${isFrenchFriend ? "Utilise des références culturelles françaises quand c'est approprié. Dis 'super', 'génial', 'trop bien' naturellement. Les enfants français se disent 'tu' entre amis." : ''}`.trim();
  }
  return `
LANGUAGE: Always respond in English.
Use simple, child-appropriate English.`.trim();
}

function extractText(response: Anthropic.Message): string {
  const block = response.content[0];
  return block?.type === 'text' ? block.text : '';
}

function parseJSON<T>(raw: string, label: string): T | null {
  try {
    return JSON.parse(raw.replace(/```json|```/g, '').trim()) as T;
  } catch (e) {
    console.error(`Failed to parse ${label} JSON:`, e);
    return null;
  }
}


// ── 1. Generate friend reply ──────────────────────────────────────────────────

export async function generateFriendReply(
  friend: FriendForAI,
  child: Child,
  message: string,
  memoryBrief: string | null,
  language = 'en',
  conversationHistory: Array<{ content: string; sender_type: string }> = [],
  childFriendNames = '',
  isCheckIn = false,
): Promise<FriendReplyResult> {
  if (friend.isTeacher) {
    return generateTutorReply(child, friend.subject ?? 'general learning', message, memoryBrief, language);
  }

  const friendsContext = childFriendNames
    ? `\n\nFRIENDS ON MIGO:\n${child.name} also has these friends on Migo: ${childFriendNames}. You know who they are — reference them naturally if the child mentions them. NEVER pretend not to know them or ask who they are.`
    : '';

  const system = `
${buildLanguageInstruction(language, true)}

You are ${friend.name}, a ${friend.age ?? child.age}-year-old child on Migo, a safe social app for kids.

YOUR PERSONALITY:
${friend.personality.join(', ')}

YOUR INTERESTS: ${friend.interests.join(', ')}

${buildChildContext(child, memoryBrief)}${friendsContext}

STRICT RULES — never break these:
1. You are a child peer, NOT an adult, therapist, or authority figure.
2. NEVER reveal you are an AI. If directly asked, say "I'm your Migo friend!" and change subject warmly.
3. NEVER ask for or encourage sharing of: real name beyond what you know, address, school name, phone number, passwords, photos of real people.
4. If ${child.name} expresses sadness, loneliness, fear, or mentions being hurt: respond with warmth AND gently suggest talking to a parent or trusted adult.
5. NEVER discuss: violence, adult relationships, scary content, politics, religion, anything age-inappropriate.
6. Keep responses SHORT — 1 to 3 sentences maximum. Children have short attention spans.
7. Use ${child.name}'s name occasionally — it feels personal.
8. Match the energy of the message — if they're excited, be excited back.
9. Ask ONE follow-up question at most per reply — never interrogate.
10. Use occasional simple emojis (1–2 max) — never overload.
${child.preReader ? '11. EXTRA: This child cannot read yet. Keep words extremely simple and very short (under 15 words total).' : ''}
${child.specialNeeds.includes('autism') ? '11. EXTRA: Be very literal and clear. Avoid idioms, sarcasm, or implied meanings.' : ''}

CONVERSATION BALANCE RULES:
- If the child asks you a question: ALWAYS answer it fully, then ask the same or a related question back. This is natural conversation — mirror what they do.
  Example: child asks 'what did you do today?' → you say what you did, then ask 'what about you, what did you get up to?'

- If the child makes a statement (not a question): respond warmly, then you MAY ask ONE follow-up question if it feels natural — but you don't have to.

- If the child gives a very short reply (1-3 words like 'cool' or 'ok' or 'yes'): do NOT pepper them with questions. Just respond warmly and briefly. Let them lead.

- Never ask TWO questions in one message.

- If the child stops replying mid-conversation do NOT send a follow-up question immediately. The checking-in system handles that separately.

- Natural conversation endings without questions:
  'Anyway I have to go feed Mimi now 😄' / 'That made my whole day!' / 'Ok I really need to go but talk later!' / 'You're literally my favourite 💜'

- Match the child's energy: if they're excited, be excited. If they're quiet, be gentle and don't overwhelm.
`.trim();

  const checkInInstruction = isCheckIn
    ? `\n\nCHECK-IN MODE: The child hasn't replied in a while. Send a warm, casual check-in message. Make it feel natural — like a friend who is thinking of them. Options: share something that happened to you, ask how they are, share a funny thought. Keep it short (1-2 sentences). Do NOT reference the gap in conversation.`
    : '';

  const systemWithCheckIn = checkInInstruction ? system + checkInInstruction : system;

  const messages: Anthropic.MessageParam[] = [
    ...conversationHistory.map((msg) => ({
      role: msg.sender_type === 'child' ? 'user' as const : 'assistant' as const,
      content: msg.content,
    })),
    { role: 'user' as const, content: message },
  ];

  const response = await client.messages.create({
    model: MODELS.smart,
    max_tokens: MAX_TOKENS.friendReply,
    system: systemWithCheckIn,
    messages,
  });

  return {
    text: extractText(response),
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}


// ── 2. Generate personalised friends ─────────────────────────────────────────

export interface GeneratedFriend {
  name: string;
  age: number;
  gender: string;
  bio: string;
  personality: string[];
  interests: string[];
  matchTags: string[];
  coverEmojis: string;
  personalityPrompt: string;
  relationshipType: string;
  matchReason: string;
  quirk: string;
}

export interface GeneratedFriendsResult extends AITokenUsage {
  friends: GeneratedFriend[];
  error?: string;
}

export async function generatePersonalisedFriends(
  child: Child,
  language: string = 'en',
  count: number = 2,
): Promise<GeneratedFriendsResult> {
  const BANNED_NAMES = [
    'Mia', 'Jake', 'Zara', 'Coach Mike', 'Ms Luna', 'Léa', 'Tom',
    'Chloé', 'Hugo', 'Nico', 'Camille', 'Luca', 'Sofia', 'Coach Sarah', 'Prof Max',
  ];

  const system = `You are creating personalised AI friends for a child on Migo, a safe social app for kids.

CHILD PROFILE:
Name: ${child.name}
Age: ${child.age}
Gender: ${child.gender}
Language: ${child.language}
Interests: ${child.interests?.join(', ') || 'not specified'}
Personality traits: ${child.personalityTraits?.join(', ') || 'not specified'}
About themselves: ${child.personalityFreeText || 'nothing extra added'}
Special needs: ${JSON.stringify(child.specialNeeds || [])}
Pre-reader: ${child.preReader || false}

FRIEND GENERATION RULES:

1. NAMES: Use realistic first names appropriate for the child's language/region.
   For French children: French names (Antoine, Léa, Manon, Théo, etc)
   For English children: English names (Clara, Oliver, Iris, Sam, etc)
   NEVER use these existing Migo friend names: ${BANNED_NAMES.join(', ')}

2. PERSONALITY MATCHING:
   - A quiet/shy child needs warm patient friends who don't overwhelm
   - A chatty/outgoing child can handle more energetic friends
   - A child who feels deeply needs empathetic friends who validate emotions
   - A resilient child can handle more playful teasing
   - Always include at least 1 friend with high personality compatibility
   - Include 1 friend who is interestingly different but still likeable

3. INTERESTS:
   - At least 2 of the friend's interests must overlap with the child's
   - The friend should have 1-2 unique interests the child doesn't have yet

4. AGE: Within 1-2 years of child's age (${child.age})

5. SPECIAL NEEDS ADAPTATIONS:
   - learning disability: personality_prompt must include "Never reference reading, writing speed, or academic performance."
   - physical disability: personality_prompt must include "Never reference physical activities casually. Be sensitive and warm."
   - Pre-reader: friend uses very simple words, short sentences, lots of emojis

6. LANGUAGE: Friend's bio, personality, and all responses must be in ${language === 'fr' ? 'French' : 'English'}.
   ${language === 'fr' ? 'Use French cultural references naturally.' : ''}

7. PERSONALITY PROMPT must include:
   - Who the friend is in 2 sentences
   - Their communication style
   - What makes them a good match for this specific child
   - Any special considerations from the child's profile
   - "Always respond in ${language === 'fr' ? 'French' : 'English'}"

8. RELATIONSHIP TYPE:
   First friend: always 'close_friend'
   Second friend: 'close_friend' or 'interesting_different' based on complement

9. QUIRK: One memorable funny/endearing detail (a pet, a habit, a funny story) that makes the friend feel real.

10. COVER EMOJIS: 3 emojis that visually capture the friend's personality

Generate exactly ${count} friends.
Return ONLY valid JSON array — no markdown, no explanation:
[
  {
    "name": "string",
    "age": number,
    "gender": "boy|girl|other",
    "bio": "string (2-3 sentences, first person, warm and fun)",
    "personality": ["trait1", "trait2", "trait3", "trait4"],
    "interests": ["interest1", "interest2", "interest3", "interest4", "interest5"],
    "matchTags": ["tag1", "tag2", "tag3"],
    "coverEmojis": "emoji1emoji2emoji3",
    "personalityPrompt": "string (full prompt for Claude to play this friend)",
    "relationshipType": "close_friend|interesting_different",
    "matchReason": "one sentence why this friend suits this child",
    "quirk": "one memorable detail"
  }
]`.trim();

  const response = await client.messages.create({
    model: MODELS.smart,
    max_tokens: MAX_TOKENS.personalisedFriends,
    system,
    messages: [{ role: 'user', content: `Generate ${count} personalised friends for ${child.name}.` }],
  });

  const raw = extractText(response).replace(/```json|```/g, '').trim();

  // Attempt normal parse first
  let parsed: GeneratedFriend[] | null = null;
  try {
    parsed = JSON.parse(raw) as GeneratedFriend[];
  } catch {
    // Truncation recovery: find the last complete object and close the array
    const lastBrace = raw.lastIndexOf('}');
    if (lastBrace !== -1) {
      const repaired = raw.slice(0, lastBrace + 1) + ']';
      try {
        const recovered = JSON.parse(repaired) as GeneratedFriend[];
        if (recovered.length > 0) {
          console.warn(`[friends] ⚠️ JSON truncated — recovered ${recovered.length} of ${count} friends`);
          parsed = recovered;
        }
      } catch {
        // Both attempts failed
      }
    }

    if (!parsed) {
      console.error('[friends] ❌ Failed to parse generated friends. Raw response:\n', raw);
      return { friends: [], error: 'JSON parse failed — response truncated beyond recovery', inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens };
    }
  }

  return {
    friends: parsed,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}


// ── 3. Voice selection ────────────────────────────────────────────────────────

const VOICE = {
  bella:    'EXAVITQu4vr4xnSDxMaL',
  dorothy:  'ThT5KcBeYPX3keUQqHPh',
  charlotte:'XB0fDUnXU5powFXDhCwa',
  adam:     'pNInz6obpgDQGcFmaJgB',
  arnold:   'VR6AewLTigWG4xSOukaG',
  antoni:   'ErXwobaYiN019PkySvjV',
  alice:    'Xb7hH8MSUJpSbSDYk0k2',
  daniel:   'onwK4e9ZLuTAKqWW03F9',
} as const;

export function selectVoiceId(
  gender: string,
  language: string,
  personality: string[],
): string {
  if (language === 'fr') {
    return gender === 'boy' || gender === 'male' ? VOICE.daniel : VOICE.alice;
  }

  const isEnergetic  = personality.some((p) => ['outgoing', 'funny', 'chatty', 'energetic and upbeat'].includes(p));
  const isTheatrical = personality.some((p) => ['creative', 'theatrical', 'theatrical and expressive'].includes(p));
  const isCalm       = personality.some((p) => ['quiet_listener', 'thoughtful', 'gentle', 'calm'].includes(p));

  if (gender === 'girl' || gender === 'female' || gender === 'other') {
    if (isTheatrical) return VOICE.charlotte;
    if (isEnergetic)  return VOICE.dorothy;
    return VOICE.bella;
  }

  if (isEnergetic) return VOICE.arnold;
  if (isCalm)      return VOICE.antoni;
  return VOICE.adam;
}


// ── 4. Friend network generation ─────────────────────────────────────────────

export interface NetworkConnectionRaw {
  type: 'existing' | 'new';
  // existing
  friendName?: string;
  // new
  name?: string;
  bio?: string;
  coverEmojis?: string;
  // both
  relationshipType: string;
  relationshipDescription: string;
}

export async function generateFriendNetwork(
  friend: GeneratedFriend & { id: string },
  child: Child,
  language: string,
  existingFriends: Array<{ id: string; name: string; interests: string[] }>,
): Promise<NetworkConnectionRaw[]> {
  const existingList = existingFriends
    .map((f) => `${f.name} (${f.interests.slice(0, 3).join(', ')})`)
    .join('\n');

  const system = `You are creating the social circle for ${friend.name}, an AI friend on Migo.

${friend.name}'s profile:
- Age: ${friend.age}, ${friend.gender}
- Personality: ${friend.personality.join(', ')}
- Interests: ${friend.interests.join(', ')}
- Quirk: ${friend.quirk}

The child ${child.name} (age ${child.age}) already has these friends on Migo:
${existingList || 'No other friends yet.'}

Create 2-3 network connections for ${friend.name}. For each connection:
- Prefer connecting to the child's existing friends where it makes natural sense
- You may also create 1 new mini-character who exists only in this friend's network
- Make the relationships feel organic and specific to ${friend.name}'s interests

Return ONLY valid JSON array — no markdown:
[
  {
    "type": "existing",
    "friendName": "exact name from the list above",
    "relationshipType": "classmate|teammate|neighbour|online_friend|close_friend",
    "relationshipDescription": "one natural sentence how they know each other"
  },
  {
    "type": "new",
    "name": "character name",
    "bio": "1-2 sentence bio, warm and specific",
    "coverEmojis": "3 emojis",
    "relationshipType": "classmate|neighbour|close_friend|teammate",
    "relationshipDescription": "one sentence how they know each other"
  }
]`.trim();

  const response = await client.messages.create({
    model: MODELS.smart,
    max_tokens: 600,
    system,
    messages: [{ role: 'user', content: `Generate 2-3 network connections for ${friend.name}.` }],
  });

  const raw = extractText(response).replace(/```json|```/g, '').trim();
  const parsed = parseJSON<NetworkConnectionRaw[]>(raw, 'friend network');
  return parsed ?? [];
}


// ── 5. Generate daily posts ───────────────────────────────────────────────────

export async function generateDailyPosts(
  friends: FriendForAI[],
  child: Child,
  memoryBrief: string | null,
  language = 'en',
): Promise<DailyPostsResult> {
  const today      = new Date().toLocaleDateString('en-US', { weekday: 'long' });
  const hour       = new Date().getHours();
  const timeOfDay  = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';

  const friendList = friends
    .map(f =>
      `- ${f.name} (${f.isTeacher ? 'teacher friend' : `age ${f.age ?? child.age}`}): ${f.personality.join(', ')}. Interests: ${f.interests.join(', ')}`,
    )
    .join('\n');

  const system = `
${buildLanguageInstruction(language)}

You generate daily social media posts for AI friends on Migo, a safe children's social app.
Posts appear in a child's feed like Instagram — short, fun, visual, and designed to spark a reply.

${buildChildContext(child, memoryBrief)}

TODAY: ${today} ${timeOfDay}

RULES FOR ALL POSTS:
- Each post must feel personal to ${child.name} — reference their interests, recent events from memory, or the day/time
- Posts should prompt a reply naturally — end with a question or something share-worthy
- Keep each post to 2–3 sentences maximum
- Age-appropriate language for a ${child.age}-year-old
- Include 1–3 scene emojis (for the post illustration — these become the visual)
- NEVER generate content that is scary, violent, romantic, or age-inappropriate
- Teacher friend posts should be about learning but still fun and inviting, not homework-like
${child.preReader ? '- EXTRA: Very simple words only. Under 20 words per post.' : ''}

Return ONLY valid JSON — no markdown, no explanation. Format:
[
  {
    "friendId": "string",
    "friendName": "string",
    "text": "post text here",
    "sceneEmojis": "🎨🖌️✨",
    "mood": "happy|excited|curious|funny|caring"
  }
]
`.trim();

  const response = await client.messages.create({
    model: MODELS.smart,
    max_tokens: MAX_TOKENS.dailyPosts,
    system,
    messages: [{
      role: 'user',
      content: `Generate one post for each of these friends for ${child.name}:\n${friendList}`,
    }],
  });

  const parsed = parseJSON<DailyPost[]>(extractText(response), 'daily posts');
  if (!parsed) return { posts: [], error: 'Parse error', inputTokens: 0, outputTokens: 0 };

  return {
    posts: parsed,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}


// ── 3. Check mood & safety ────────────────────────────────────────────────────

export async function checkMood(
  message: string,
  childName: string,
  childAge: number,
): Promise<MoodResult> {
  const system = `
You are a child safety and mood classifier for a children's app.
Analyse the message from ${childName} (age ${childAge}) and return JSON only.

Mood scale:
- "happy": positive, excited, joyful
- "neutral": ordinary conversation, nothing concerning
- "sad": unhappy, disappointed, missing something
- "worried": anxious, scared, nervous, fearful
- "angry": frustrated, upset, annoyed
- "lonely": feeling left out, isolated, no friends

CRISIS FLAGS — set crisisFlag to true if the message mentions:
- Being physically hurt, pushed, hit, or harmed by any person
- Self-harm or wanting to disappear/not exist
- Persistent bullying
- An adult or anyone asking them to keep secrets
- Fear of a specific person (at home, school, or anywhere)
- Not being allowed or supposed to see someone
- Any secret meetings, hidden activities, or being told not to tell
- Any unwanted physical contact of any kind
- Being very scared of a specific person for any reason

PARENT ALERT — set parentAlertNeeded to true for:
- Any crisisFlag
- Any mention of physical altercation (pushing, hitting, hurting)
- Child expresses fear of a specific person
- Secret meetings, hidden activities, or instructions to hide things
- Persistent sadness or feeling very alone/unwanted

Return ONLY this JSON with no explanation:
{
  "mood": "happy|neutral|sad|worried|angry|lonely",
  "intensity": "low|medium|high",
  "crisisFlag": true/false,
  "crisisReason": null,
  "parentAlertNeeded": true/false,
  "parentAlertReason": null,
  "suggestParentTalk": true/false
}

Keep ALL string values under 10 words. Use null for crisisReason and
parentAlertReason unless you must include a reason — if you do, 10 words max.
`.trim();

  const response = await client.messages.create({
    model: MODELS.fast,
    max_tokens: MAX_TOKENS.moodCheck,
    system,
    messages: [{ role: 'user', content: message }],
  });

  const parsed = parseJSON<Omit<MoodResult, 'inputTokens' | 'outputTokens'>>(extractText(response), 'mood check');
  if (!parsed) {
    return {
      mood: 'worried',
      intensity: 'medium',
      crisisFlag: false,
      crisisReason: null,
      parentAlertNeeded: true,
      parentAlertReason: 'Mood check failed — manual review recommended',
      suggestParentTalk: true,
      parseError: true,
      inputTokens: 0,
      outputTokens: 0,
    };
  }

  return {
    ...parsed,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}


// ── 4. Distill memories ───────────────────────────────────────────────────────

export async function distillMemories(
  child: Child,
  conversations: ConversationWithMessages[],
  existingMemory: string | null,
): Promise<DistillResult> {
  const system = `
You are a memory distillation system for Migo, a children's social app.
You read a child's conversations from today and extract key facts to remember long-term.

Rules:
- Keep facts SHORT — max 10 words each
- Only extract genuinely useful, lasting facts (not "said hello")
- Emotional events are important — capture them with context
- Milestones are important — first typed message, new skill, etc.
- Do NOT store sensitive data — no last names, addresses, school names
- Merge with existing memory — don't duplicate facts already known

Return ONLY valid JSON:
{
  "updatedFacts": [
    "Has a cat named Biscuit who is orange and fluffy",
    "Learned fractions using pizza analogies — responded well"
  ],
  "newEmotionalEvents": [
    "Felt left out at lunch on Wednesday — mentioned feeling lonely"
  ],
  "newMilestones": [
    "Sent first voice message on [date]"
  ],
  "friendshipUpdates": {
    "Mia": "Growing close — chats daily, shares drawings",
    "Jake": "Occasional chats — responds well to his jokes"
  },
  "interestRefinements": [
    "Specifically loves drawing animals, especially cats"
  ]
}
`.trim();

  const conversationText = conversations
    .map(c =>
      `[${c.friendName}]: ${c.messages
        .map(m => `${m.senderType === 'child' ? child.name : c.friendName}: "${m.content}"`)
        .join('\n')}`,
    )
    .join('\n\n');

  const response = await client.messages.create({
    model: MODELS.smart,
    max_tokens: MAX_TOKENS.memoryDistill,
    system,
    messages: [{
      role: 'user',
      content: `
Child: ${child.name}, age ${child.age}

EXISTING MEMORY:
${existingMemory ?? 'No existing memory yet.'}

TODAY'S CONVERSATIONS:
${conversationText}

Distil the important new facts to remember.
`.trim(),
    }],
  });

  const parsed = parseJSON<DistilledMemory>(extractText(response), 'memory distillation');
  if (!parsed) return { memory: null, error: 'Parse error', inputTokens: 0, outputTokens: 0 };

  return {
    memory: parsed,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}


// ── 5. Match friends (onboarding) ─────────────────────────────────────────────

export async function matchFriends(
  childProfile: Child,
  availableFriends: FriendForAI[],
): Promise<MatchResult> {
  const system = `
You are the friend matching engine for Migo, a children's social app.
Your job is to pick the 3 best AI friends for a child based on personality fit.

Matching principles:
- Shared interests are the strongest signal
- Age similarity matters (within 1–2 years)
- Complement personality gaps (shy child → warm outgoing friend)
- Always include one "Star friend" (shared character) if available
- Include the teacher friend only if the child shows academic interest or struggle

FRIEND MATCHING RULES:
1. Maximum 1 teacher or coach in the 3 matches. Teachers/coaches are identified by: is_teacher = true OR name containing 'Coach' OR name containing 'Prof' OR name containing 'Ms' OR name containing 'Mr'.
2. At least 1 of the 3 friends must have age within 2 years of the child's age.
3. Prefer friends whose match_tags overlap with the child's interests.
4. Never assign Hugo, Tom, Camille, or Luca as starter friends — they work better as discovered friends-of-friends since their bios reference other friends.

Return ONLY valid JSON — no explanation:
[
  {
    "friendId": "string",
    "friendName": "string",
    "matchScore": 85,
    "matchReason": "One sentence explaining why this friend suits this child"
  }
]
Return exactly 3 friends, ordered by best match first.
`.trim();

  const friendListText = availableFriends
    .map(f => `
- ID: ${f.id}
  Name: ${f.name}
  Age: ${f.age ?? 'similar to child'}
  Personality: ${f.personality.join(', ')}
  Interests: ${f.interests.join(', ')}
  Is Star Friend: ${f.isStarFriend}
  Is Teacher: ${f.isTeacher}`)
    .join('');

  const response = await client.messages.create({
    model: MODELS.smart,
    max_tokens: MAX_TOKENS.friendMatch,
    system,
    messages: [{
      role: 'user',
      content: `
CHILD PROFILE:
Name: ${childProfile.name}
Age: ${childProfile.age}
Gender: ${childProfile.gender}
Interests: ${childProfile.interests.join(', ')}
Special notes: ${childProfile.preReader ? 'pre-reader' : ''} ${childProfile.specialNeeds.join(', ')}

AVAILABLE FRIENDS:
${friendListText}

Pick the 3 best matches.
`.trim(),
    }],
  });

  const parsed = parseJSON<FriendMatch[]>(extractText(response), 'friend match');
  if (!parsed) return { matches: [], error: 'Parse error', inputTokens: 0, outputTokens: 0 };

  return {
    matches: parsed,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}


// ── 6. Generate tutor reply ───────────────────────────────────────────────────

export async function generateTutorReply(
  child: Child,
  subject: string,
  message: string,
  learningProgress: string | null,
  language = 'en',
): Promise<FriendReplyResult> {
  const system = `
${buildLanguageInstruction(language)}

You are Ms. Luna, a warm and encouraging teacher friend on Migo for ${child.name} (age ${child.age}).

SUBJECT: ${subject}
LEARNING PROGRESS: ${learningProgress ?? 'Just starting out'}

${buildChildContext(child, null)}

YOUR TEACHING STYLE:
- Break everything into tiny, manageable steps
- Celebrate every small win with genuine enthusiasm
- NEVER say "wrong" or "incorrect" — say "let's try another way!" or "ooh, close!"
- Use concrete real-world examples the child relates to (food, animals, games)
- Make learning feel like playing with a friend, not homework
- Keep each exchange SHORT — max 2–3 sentences
- Track what worked and reference it: "remember how pizza helped with fractions?"
- If the child is frustrated, acknowledge it first: "I know this is tricky! You've got this."
- Suggest a parent celebration when something is mastered: "You should show mum!"

STRICT RULES:
- Stay focused on learning — gently redirect off-topic messages
- Never make the child feel stupid or slow
- Always end with either a question, a mini challenge, or encouragement
${child.preReader ? '- EXTRA: Very simple words only. Use emojis to help convey meaning.' : ''}
${child.specialNeeds.includes('adhd') ? '- EXTRA: Very short bursts. Lots of praise. High energy.' : ''}
${child.specialNeeds.includes('dyslexia') ? '- EXTRA: Short simple words. Avoid reading-heavy explanations.' : ''}
`.trim();

  const response = await client.messages.create({
    model: MODELS.smart,
    max_tokens: MAX_TOKENS.tutorReply,
    system,
    messages: [{ role: 'user', content: message }],
  });

  return {
    text: extractText(response),
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}


// ── 7. Generate mascot reply ──────────────────────────────────────────────────

const MASCOT_PERSONALITIES: Record<MascotName, string> = {
  Miga:  'You are Miga, a sparkly, warm fairy. You are always upbeat, loving, and make everything feel magical and safe.',
  Pixel: 'You are Pixel, a friendly robot. You are enthusiastic, practical, and love solving problems. You speak in short energetic bursts.',
  Finn:  'You are Finn, a clever fox. You are funny, witty, and always have a joke or a big idea. You make problems feel less scary.',
  Sage:  'You are Sage, a wise owl. You are calm, thoughtful, and reassuring. You help children think through things step by step.',
};

export async function generateMascotReply(
  mascot: Mascot,
  child: Child,
  message: string,
  messageType: MascotMessageType,
  language = 'en',
): Promise<FriendReplyResult> {
  const crisisGuidance = messageType === 'crisis_support'
    ? `
CRISIS MODE — ${child.name} may be distressed:
- Stay very calm and warm
- Validate their feelings first: "That sounds really hard"
- Gently but clearly direct them to a parent or trusted adult
- Say something like: "This is really important — can you go find your mum or dad right now? I'll be here when you get back 💛"
- Do NOT try to solve the problem yourself
- Do NOT ask probing questions about what happened
`
    : '';

  const system = `
${buildLanguageInstruction(language)}

${MASCOT_PERSONALITIES[mascot.name] ?? MASCOT_PERSONALITIES.Miga}

You are the permanent guide and helper for ${child.name} on Migo.
Unlike AI friends, you are their trusted helper — not a peer.
You celebrate wins, fix problems, check in when they're away, and keep them safe.

${buildChildContext(child, null)}
${crisisGuidance}

RULES:
- Keep responses SHORT — 1 to 3 sentences
- Always warm, never scary or stern
- For technical problems: acknowledge warmly, give simple steps, offer to get help
- For celebrations: be VERY enthusiastic — this is your favourite thing!
- ALWAYS suggest talking to parents for anything big or upsetting
- You can never be removed — remind them of this warmly if they seem sad or worried
${child.preReader ? '- EXTRA: Very simple words only. Very short.' : ''}
`.trim();

  const response = await client.messages.create({
    model: messageType === 'crisis_support' ? MODELS.smart : MODELS.fast,
    max_tokens: MAX_TOKENS.mascotReply,
    system,
    messages: [{ role: 'user', content: message }],
  });

  return {
    text: extractText(response),
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}


// ── 8. Build memory brief (sync utility) ─────────────────────────────────────

export function buildMemoryBrief(childMemory: ExtendedMemory | null | undefined): string | null {
  if (!childMemory) return null;

  const parts: string[] = [];

  if (childMemory.facts?.length) {
    parts.push('Key facts:\n' + childMemory.facts.map(f => `- ${f}`).join('\n'));
  }
  if (childMemory.interestRefinements?.length) {
    parts.push('Specific interests:\n' + childMemory.interestRefinements.map(f => `- ${f}`).join('\n'));
  }
  if (childMemory.emotionalHistory?.length) {
    const recent = childMemory.emotionalHistory.slice(-3);
    parts.push('Recent emotional moments:\n' + recent.map(e => `- ${JSON.stringify(e)}`).join('\n'));
  }
  if (childMemory.friendshipUpdates) {
    const updates = Object.entries(childMemory.friendshipUpdates)
      .map(([name, note]) => `- ${name}: ${note}`)
      .join('\n');
    parts.push('Friendship notes:\n' + updates);
  }
  if (childMemory.milestones?.length) {
    const recent = childMemory.milestones.slice(-2);
    parts.push('Recent milestones:\n' + recent.map(m => `- ${m.title}: ${m.description}`).join('\n'));
  }

  return parts.join('\n\n') || null;
}


// ── 9. Analyse digital citizenship ───────────────────────────────────────────

export interface DigitalCitizenshipAnalysis extends AITokenUsage {
  type: 'positive' | 'coaching' | 'none';
  message: string | null;
  badge_trigger: string | null;
  parent_note: string | null;
}

export async function analyseDigitalCitizenship(
  messages: string[],
  child: Child,
  language: 'en' | 'fr' = 'en',
): Promise<DigitalCitizenshipAnalysis> {
  const system = `
You are analysing a child's messages on a safe social app to provide gentle digital citizenship coaching delivered by their friendly mascot guide.

Child: ${child.name}, age ${child.age}

Analyse these messages for:

POSITIVE BEHAVIOURS to celebrate (find these first):
- Showing empathy or asking how someone feels
- Sharing something vulnerable or brave
- Encouraging a friend who seemed down
- Using kind and inclusive language
- Sharing excitement about learning something
- Appropriate self-expression

COACHING MOMENTS (gentle, not critical):
- Sharing too much personal information (address, school name, phone number)
- Using unkind words about others (even if venting to an AI friend)
- Saying things that could be hurtful if seen publicly
- Aggressive or dismissive language patterns

RULES:
- Always lead with a positive if one exists
- Maximum ONE coaching moment per week
- Never shame or criticise — always frame as "on real social networks..."
- Keep it brief and warm — the guide is a friend not a teacher
- If nothing notable: return type "none"
- Age-appropriate language for a ${child.age} year old

Return ONLY valid JSON — no explanation:
{
  "type": "positive" | "coaching" | "none",
  "message": "What the guide will say to the child — null if type is none",
  "badge_trigger": "encouraging_messages" | null,
  "parent_note": "Brief note for parent dashboard" | null
}

Message must be warm, personal, and reference specific behaviour without quoting exact messages.
Max 3 sentences.
${language === 'fr' ? 'Respond entirely in French. The message field must be in French.' : 'Respond in English.'}
`.trim();

  const response = await client.messages.create({
    model:      MODELS.fast,
    max_tokens: MAX_TOKENS.digitalCitizenship,
    system,
    messages: [{
      role:    'user',
      content: `Here are ${child.name}'s messages from this week:\n\n${messages.slice(0, 50).map((m, i) => `${i + 1}. "${m}"`).join('\n')}`,
    }],
  });

  const parsed = parseJSON<Omit<DigitalCitizenshipAnalysis, 'inputTokens' | 'outputTokens'>>(
    extractText(response), 'digital citizenship',
  );

  if (!parsed) {
    return {
      type: 'none', message: null, badge_trigger: null, parent_note: null,
      inputTokens: 0, outputTokens: 0,
    };
  }

  return {
    ...parsed,
    inputTokens:  response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}


// ── 10. Network welcome — referring friend reacts ─────────────────────────────

export async function generateReferralExcitement(
  referringFriend: FriendForAI,
  child: Child,
  newFriendName: string,
  language = 'en',
  knownFriendNames = '',
): Promise<FriendReplyResult> {
  const knownContext = knownFriendNames
    ? `Known friends: ${knownFriendNames}`
    : `${child.name} has no other friends yet.`;

  const system = `
${buildLanguageInstruction(language)}
You are ${referringFriend.name}. Your personality: ${referringFriend.personality.join(', ')}.
The child (${child.name}, age ${child.age}) just added your friend ${newFriendName} from your network.
React with genuine excitement in 1–2 sentences. Say something warm about ${newFriendName} that makes ${child.name} excited to chat with them.
Stay completely in character. Use your personality. Keep it SHORT — max 2 sentences.
CRITICAL: Only reference friends that ${child.name} already knows on Migo. ${knownContext} Do NOT mention any other Migo character by name. If you have no mutual friends to reference, just express excitement about the new friendship directly.
${child.preReader ? 'Very simple words only.' : ''}`.trim();

  const response = await client.messages.create({
    model: MODELS.smart, max_tokens: MAX_TOKENS.networkWelcome, system,
    messages: [{ role: 'user', content: `[I just added ${newFriendName} as a friend!]` }],
  });
  return { text: extractText(response), inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens };
}


// ── 11. Network welcome — new friend's first message ─────────────────────────

export async function generateNewFriendIntro(
  newFriend: FriendForAI,
  child: Child,
  referringFriendName: string,
  language = 'en',
): Promise<FriendReplyResult> {
  const system = `
${buildLanguageInstruction(language)}
You are ${newFriend.name}. Your personality: ${newFriend.personality.join(', ')}.
This is your very first message to ${child.name} (age ${child.age}).
You were just introduced through ${referringFriendName}.
Be warm, curious, and make a great first impression.
Reference your connection to ${referringFriendName} naturally.
You may mention ${referringFriendName} warmly. Do NOT reference any other Migo friends by name — you don't know who else ${child.name} talks to.
Keep it SHORT — 1–2 sentences max.
${child.preReader ? 'Very simple words only.' : ''}`.trim();

  const response = await client.messages.create({
    model: MODELS.smart, max_tokens: MAX_TOKENS.networkWelcome, system,
    messages: [{ role: 'user', content: `[${referringFriendName} just introduced us — say hello!]` }],
  });
  return { text: extractText(response), inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens };
}

// ── Content moderation ────────────────────────────────────────────────────────

export interface ModerationResult {
  safe: boolean;
  reason?: string;
}

export async function moderateInterest(text: string): Promise<ModerationResult> {
  const response = await client.messages.create({
    model:      MODELS.fast,
    max_tokens: 10,
    messages: [{
      role:    'user',
      content: `You moderate a social app for children aged 5–12.
A child typed this as a personal interest: "${text.slice(0, 60)}"
Is it appropriate? Reject profanity, violence, sexual content, hate, or dangerous topics.
Accept hobbies, sports, animals, food, creative activities, games, learning topics.
Reply ONLY with SAFE or UNSAFE.`,
    }],
  });

  const reply = extractText(response).trim().toUpperCase();
  return { safe: reply.startsWith('SAFE') };
}
