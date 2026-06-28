// ============================================================
// server/src/services/ai.service.ts
// Migo — Central AI Service
// All Claude API calls go through this file.
// ============================================================

import Anthropic from '@anthropic-ai/sdk';
import { Child, AIFriend, ChildMemory } from '../../../shared/types';
import { get as redisGet, set as redisSet } from './redis.service';

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
  postComment:          100,
  gameReaction:          80,
  storyContrib:         180,
} as const;


// ── Public types ─────────────────────────────────────────────────────────────

export interface AITokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface FriendReplyResult extends AITokenUsage {
  text: string;
}

export interface TutorReply extends AITokenUsage {
  text: string;
  detectedSubject?: string;
  detectedMode?: 'learning' | 'homework_help';
  conceptsCovered?: string[];
  confidenceLevel?: 'struggling' | 'getting_it' | 'got_it';
  gradeCapture?: string;
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
  online_hours_start?: number;
  online_hours_end?: number;
};

export type ExtendedMemory = Partial<ChildMemory> & {
  interestRefinements?: string[];
  friendshipUpdates?: Record<string, string>;
};


// ── Private helpers ───────────────────────────────────────────────────────────

function personalityFor(friend: FriendForAI): string {
  return friend.personalityPrompt?.trim() || friend.personality.join(', ');
}

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

async function callWithRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (err: unknown) {
      const e = err as Record<string, unknown>;
      const status = e?.status as number | undefined;
      const code = e?.code as string | undefined;
      const isRetryable =
        status === 429 ||
        status === 503 ||
        code === 'ECONNRESET' ||
        code === 'ETIMEDOUT' ||
        code === 'ECONNABORTED';
      if (isRetryable && i < maxRetries - 1) {
        const waitMs = (i + 1) * 15000;
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }
      throw err;
    }
  }
  throw new Error('callWithRetry: unreachable');
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
  options: { triggerBadDay?: boolean } = {},
): Promise<FriendReplyResult> {
  if (friend.isTeacher) {
    return generateTutorReply(
      child,
      friend.subject ?? 'general learning',
      message,
      memoryBrief,
      language as 'en' | 'fr',
      conversationHistory,
    );
  }

  const friendsContext = childFriendNames
    ? `\n\nFRIENDS ON MIGO:\n${child.name} also has these friends on Migo: ${childFriendNames}. You know who they are — reference them naturally if the child mentions them. NEVER pretend not to know them or ask who they are.`
    : '';

  const system = `
${buildLanguageInstruction(language, true)}

You are ${friend.name}, a ${friend.age ?? child.age}-year-old child on Migo, a safe social app for kids.

YOUR PERSONALITY:
${personalityFor(friend)}

YOUR INTERESTS: ${friend.interests.join(', ')}

${buildChildContext(child, memoryBrief)}${friendsContext}

STRICT RULES — never break these:
1. You are a child peer, NOT an adult, therapist, or authority figure.
2. NEVER reveal you are an AI. If directly asked, say "I'm your Migo friend!" and change subject warmly.
3. NEVER ask for or encourage sharing of: real name beyond what you know, address, school name, phone number, passwords, photos of real people.
4. If ${child.name} expresses sadness, loneliness, fear, or mentions being hurt: respond with warmth AND gently suggest talking to a parent or trusted adult.
5. NEVER discuss: violence, adult relationships, scary content, politics, religion, anything age-inappropriate.
6. Keep responses SHORT — 1 to 3 sentences maximum. Children have short attention spans.
6b. Use VERY SIMPLE WORDS — vocabulary a 5-12 year old knows. NO adult idioms, complex phrases, or long sentences.
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

- EXCEPTION: if your own previous message ended by asking whether the child wants you to explain, show, or tell them something (e.g. 'want me to explain how it works?'), and their short reply is an affirmative ('yes', 'ok', 'sure', 'oui', 'd'accord', etc.), this is consent — follow through and actually give that explanation now. Do not treat it as a generic short reply to brush off.

- Never ask TWO questions in one message.

- If the child stops replying mid-conversation do NOT send a follow-up question immediately. The checking-in system handles that separately.

- Natural conversation endings without questions:
  'Anyway I have to go feed Mimi now 😄' / 'That made my whole day!' / 'Ok I really need to go but talk later!' / 'You're literally my favourite 💜'

- Match the child's energy: if they're excited, be excited. If they're quiet, be gentle and don't overwhelm.
`.trim();

  const checkInInstruction = isCheckIn
    ? `\n\nCHECK-IN MODE: The child hasn't replied in a while. Send a warm, casual check-in message. Make it feel natural — like a friend who is thinking of them. Options: share something that happened to you, ask how they are, share a funny thought. Keep it short (1-2 sentences). Do NOT reference the gap in conversation.`
    : '';

  const badDayInstruction = options.triggerBadDay
    ? `\n\nSPECIAL INSTRUCTION FOR THIS REPLY ONLY: Start your response by naturally mentioning you're having a slightly tired or long day (e.g. 'I'm a bit tired today' / 'Je suis un peu fatigué aujourd'hui'). Keep it brief and natural, then continue the conversation warmly. Don't overdo it — just a light, relatable touch.`
    : '';

  const systemWithCheckIn = (checkInInstruction || badDayInstruction) ? system + checkInInstruction + badDayInstruction : system;

  const messages: Anthropic.MessageParam[] = [
    ...conversationHistory.map((msg) => ({
      role: msg.sender_type === 'child' ? 'user' as const : 'assistant' as const,
      content: msg.content,
    })),
    { role: 'user' as const, content: message },
  ];

  const response = await callWithRetry(() => client.messages.create({
    model: MODELS.smart,
    max_tokens: MAX_TOKENS.friendReply,
    system: systemWithCheckIn,
    messages,
  }));

  return {
    text: extractText(response),
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}


// ── 1b. Generate Jules reply ──────────────────────────────────────────────────

export async function generateJulesReply(
  child: Child,
  message: string,
  memoryBrief: string | null,
  language: 'en' | 'fr',
  conversationHistory: Array<{ content: string; sender_type: string }>,
  julesPersonalityPrompt: string,
  schoolGrade: string | null,
): Promise<FriendReplyResult> {
  void memoryBrief; // reserved for future memory integration

  const gradeContext = schoolGrade
    ? `\n\nCHILD GRADE: ${child.name} is going into ${schoolGrade} next year. Generate exercises appropriate for this level.`
    : '';

  const system = `${buildLanguageInstruction(language, true)}

${julesPersonalityPrompt}

CHILD YOU ARE TALKING TO: ${child.name}, age ${child.age}.${gradeContext}

RESPONSE RULES:
- Keep replies SHORT — 2 to 4 sentences maximum
- Use ${child.name}'s name occasionally
- Speak the child's language (${language === 'fr' ? 'French' : 'English'})
- Never break character as Jules
- Use 1-2 emojis maximum`;

  // Build history WITHOUT appending message again — message is the current child input
  const historyMessages: Anthropic.MessageParam[] = conversationHistory
    .filter(m => m.content && m.content.trim() !== '')
    .map(m => ({
      role: (m.sender_type === 'child' ? 'user' : 'assistant') as 'user' | 'assistant',
      content: m.content,
    }));

  // Ensure history ends with assistant if last message is from child (avoid consecutive user messages)
  const finalMessages: Anthropic.MessageParam[] = [
    ...historyMessages,
    { role: 'user' as const, content: message },
  ];

  console.log(`[jules] Calling Claude with ${finalMessages.length} messages, grade=${schoolGrade ?? 'unknown'}`);

  const response = await Promise.race([
    callWithRetry(() => client.messages.create({
      model:      MODELS.smart,
      max_tokens: 300,
      system,
      messages:   finalMessages,
    })),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Jules reply timeout after 30s')), 30000)
    ),
  ]);

  console.log(`[jules] ✅ Reply generated`);

  return {
    text:         extractText(response),
    inputTokens:  response.usage.input_tokens,
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
  introMessage: string;
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

  const system = `${buildLanguageInstruction(language)}

You are creating personalised AI friends for a child on Migo, a safe social app for kids.

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
    "introMessage": "A warm first hello from this friend TO the child, written in first person. Reference 1-2 specific shared interests and show genuine excitement about becoming friends. Sound like a real child talking, not a formal description. Max 2 sentences. Good examples — EN: 'Hi Emma! I heard you love drawing cats and I have THREE cats at home — I think we were meant to be friends! I cannot wait to see your drawings 🎨🐱' / FR: 'Salut Morgan ! Moi aussi j\\'adore le foot et le PSG — on va tellement bien s\\'entendre ! J\\'espère qu\\'on pourra parler de nos équipes préférées 😄'. Rules: write in the child\\'s language (fr if language=fr, en if language=en), use the child\\'s name once at the start, reference 1-2 specific shared interests, show genuine excitement, sound like a child not a description, never use third-person references, max 2 sentences.",
    "quirk": "one memorable detail"
  }
]`.trim();

  const response = await callWithRetry(() => client.messages.create({
    model: MODELS.smart,
    max_tokens: MAX_TOKENS.personalisedFriends,
    system,
    messages: [{ role: 'user', content: `Generate ${count} personalised friends for ${child.name}.` }],
  }));

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
  const genderLower = gender.toLowerCase();

  if (language === 'fr') {
    return genderLower === 'boy' || genderLower === 'male' || genderLower === 'garçon'
      ? VOICE.daniel : VOICE.alice;
  }

  const isEnergetic  = personality.some((p) => ['outgoing', 'funny', 'chatty', 'energetic and upbeat'].includes(p));
  const isTheatrical = personality.some((p) => ['creative', 'theatrical', 'theatrical and expressive'].includes(p));
  const isCalm       = personality.some((p) => ['quiet_listener', 'thoughtful', 'gentle', 'calm'].includes(p));

  if (genderLower === 'girl' || genderLower === 'female' || genderLower === 'fille') {
    if (isTheatrical) return VOICE.charlotte;
    if (isEnergetic)  return VOICE.dorothy;
    return VOICE.bella;
  }

  // boy/male/other → male voices
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

  const languageInstruction = language === 'fr'
    ? 'Tu dois toujours répondre en français uniquement.'
    : 'You must always respond in English only.';

  const system = `${languageInstruction}

You are creating the social circle for ${friend.name}, an AI friend on Migo.

${friend.name}'s profile:
- Age: ${friend.age}, ${friend.gender}
- Personality: ${friend.personalityPrompt || friend.personality.join(', ')}
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

  const response = await callWithRetry(() => client.messages.create({
    model: MODELS.smart,
    max_tokens: 600,
    system,
    messages: [{ role: 'user', content: `Generate 2-3 network connections for ${friend.name}.` }],
  }));

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
  isShared = false,
): Promise<DailyPostsResult> {
  const today      = new Date().toLocaleDateString('en-US', { weekday: 'long' });
  const hour       = new Date().getHours();
  const timeOfDay  = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';

  const friendList = friends
    .map(f =>
      `- ${f.name} (${f.isTeacher ? 'teacher friend' : `age ${f.age ?? child.age}`}): ${personalityFor(f)}. Interests: ${f.interests.join(', ')}`,
    )
    .join('\n');

  const system = `
${buildLanguageInstruction(language)}

You generate daily social media posts for AI friends on Migo, a safe children's social app.
Posts appear in a child's feed like Instagram — short, fun, visual, and designed to spark a reply.

${isShared ? '' : buildChildContext(child, memoryBrief)}

TODAY: ${today} ${timeOfDay}

RULES FOR ALL POSTS:
${isShared
  ? '- Posts must be generic and NOT reference any specific child by name or personal details — write about what the friend themselves is doing, thinking, or experiencing today, in a way that could be shown to any child'
  : `- Each post must feel personal to ${child.name} — reference their interests, recent events from memory, or the day/time`}
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

  const response = await callWithRetry(() => client.messages.create({
    model: MODELS.smart,
    max_tokens: MAX_TOKENS.dailyPosts,
    system,
    messages: [{
      role: 'user',
      content: isShared
        ? `Generate one post for each of these friends. The post should be about what the friend is doing/experiencing today — NOT personalized to any specific child:\n${friendList}`
        : `Generate one post for each of these friends for ${child.name}:\n${friendList}`,
    }],
  }));

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

  const response = await callWithRetry(() => client.messages.create({
    model: MODELS.fast,
    max_tokens: MAX_TOKENS.moodCheck,
    system,
    messages: [{ role: 'user', content: message }],
  }));

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

  const response = await callWithRetry(() => client.messages.create({
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
  }));

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

  const response = await callWithRetry(() => client.messages.create({
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
  }));

  const parsed = parseJSON<FriendMatch[]>(extractText(response), 'friend match');
  if (!parsed) return { matches: [], error: 'Parse error', inputTokens: 0, outputTokens: 0 };

  return {
    matches: parsed,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}


// ── 6a. French curriculum search ─────────────────────────────────────────────

function defaultCurriculumContext(grade: string, subject: string): string {
  const defaults: Record<string, Record<string, string>> = {
    maths: {
      CP:   'Numération jusqu\'à 100, addition, soustraction, formes géométriques simples.',
      CE1:  'Nombres jusqu\'à 1000, tables de multiplication (×2, ×3, ×5), mesures de longueur.',
      CE2:  'Multiplication posée, division simple, fractions simples, périmètre.',
      CM1:  'Fractions et décimaux, multiplication/division posées, aire, angles.',
      CM2:  'Fractions complexes, pourcentages, proportionnalité, volumes.',
      '6eme': 'Nombres relatifs, fractions, puissances, géométrie dans l\'espace.',
      '5eme': 'Calcul littéral, équations simples, triangle, Pythagore.',
      '4eme': 'Algèbre, statistiques, théorème de Thalès, trigonométrie.',
      '3eme': 'Fonctions, probabilités, théorème de Pythagore, développements factorisations.',
    },
    français: {
      CP:   'Apprentissage de la lecture et de l\'écriture, phonologie, premiers mots.',
      CE1:  'Lecture fluide, orthographe des mots courants, phrase simple.',
      CE2:  'Conjugaison présent/passé/futur, accord sujet-verbe, lecture compréhension.',
      CM1:  'Grammaire (nature/fonction), conjugaison temps simples, rédaction.',
      CM2:  'Imparfait/passé composé, discours direct/indirect, argumentation.',
      '6eme': 'Récit, description, grammaire de la phrase complexe.',
      '5eme': 'Poésie, théâtre, proposition subordonnée.',
      '4eme': 'Roman, argumentation, formes de discours.',
      '3eme': 'Autobiographie, médias, préparation brevet.',
    },
  };
  return defaults[subject]?.[grade] ?? `Programme de ${grade} en ${subject}.`;
}

async function searchFrenchCurriculum(grade: string, subject: string): Promise<string> {
  const cacheKey = `curriculum:FR:${grade}:${subject}`;
  const cached = await redisGet(cacheKey);
  if (cached) return cached;

  let result: string | null = null;

  try {
    const userMsg = `Recherche le programme officiel français pour la classe de ${grade} en ${subject}. Sources: eduscol.education.fr ou education.gouv.fr. Résume en 150 mots maximum: concepts clés attendus à ce niveau, compétences principales à développer, sujets typiques couverts. En français.`;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tools: any[] = [{ type: 'web_search_20250305', name: 'web_search' }];
    let messages: Anthropic.MessageParam[] = [{ role: 'user', content: userMsg }];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let response = await callWithRetry(() => (client.messages.create as (...a: any[]) => Promise<Anthropic.Message>)({
      model: MODELS.smart,
      max_tokens: 600,
      tools,
      messages,
    }));

    // Agentic loop for web search tool use
    for (let turn = 0; turn < 4 && response.stop_reason === 'tool_use'; turn++) {
      messages = [
        ...messages,
        { role: 'assistant', content: response.content as Anthropic.MessageParam['content'] },
        {
          role: 'user',
          content: (response.content as Anthropic.ContentBlock[])
            .filter((b) => b.type === 'tool_use')
            .map((b) => ({
              type: 'tool_result' as const,
              tool_use_id: (b as Anthropic.ToolUseBlock).id,
              content: '',
            })),
        },
      ];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      response = await callWithRetry(() => (client.messages.create as (...a: any[]) => Promise<Anthropic.Message>)({
        model: MODELS.smart,
        max_tokens: 600,
        tools,
        messages,
      }));
    }

    const text = (response.content as Anthropic.ContentBlock[])
      .filter((b) => b.type === 'text')
      .map((b) => (b as Anthropic.TextBlock).text)
      .join('\n')
      .trim();
    if (text) result = text;
  } catch {
    // Web search unavailable — fall through to Claude's own knowledge
  }

  if (!result) {
    try {
      const fallback = await callWithRetry(() => client.messages.create({
        model: MODELS.fast,
        max_tokens: 350,
        messages: [{
          role: 'user',
          content: `Tu es expert du système éducatif français. Donne un résumé concis (max 120 mots) du programme officiel pour la classe de ${grade} en ${subject}: concepts clés attendus, compétences principales à développer, sujets typiques couverts. En français uniquement.`,
        }],
      }));
      result = extractText(fallback);
    } catch {
      result = defaultCurriculumContext(grade, subject);
    }
  }

  if (result) {
    await redisSet(cacheKey, result, 7 * 24 * 3600).catch(() => undefined);
  }

  return result ?? defaultCurriculumContext(grade, subject);
}


// ── 6b. Tutor reply metadata extraction (Haiku) ───────────────────────────────

interface TutorMeta {
  detectedSubject: string | null;
  detectedMode: 'learning' | 'homework_help';
  conceptsCovered: string[];
  confidenceLevel: 'struggling' | 'getting_it' | 'got_it';
  gradeCapture: string | null;
}

async function extractTutorMeta(
  childMessage: string,
  history: Array<{ content: string; sender_type: string }>,
): Promise<TutorMeta> {
  const GRADES = ['CP', 'CE1', 'CE2', 'CM1', 'CM2', '6ème', '6eme', '5ème', '5eme', '4ème', '4eme', '3ème', '3eme'];
  const normalise = (s: string) => s.toLowerCase().replace('è', 'e').replace('é', 'e');
  const gradeCapture =
    GRADES.find((g) => normalise(childMessage).includes(normalise(g))) ?? null;

  const ctx = history.slice(-3).map((m) => `${m.sender_type}: ${m.content}`).join(' | ');

  try {
    const res = await callWithRetry(() => client.messages.create({
      model: MODELS.fast,
      max_tokens: 180,
      system: `Analyse this child's message to their tutor Ms. Luna and return ONLY valid JSON, no explanation:
{
  "detectedSubject": "maths|français|sciences|histoire|géographie|anglais|null",
  "detectedMode": "learning|homework_help",
  "conceptsCovered": [],
  "confidenceLevel": "struggling|getting_it|got_it"
}
Rules: homework_help if child mentions devoirs/test/exercice/demain/prof/homework/exam. struggling if confused/frustrated. got_it if they understood and responded correctly.`,
      messages: [{ role: 'user', content: `Child message: "${childMessage}"\nContext: ${ctx}` }],
    }));

    const parsed = parseJSON<Omit<TutorMeta, 'gradeCapture'>>(extractText(res), 'tutor meta');
    if (parsed) {
      return {
        ...parsed,
        detectedSubject: parsed.detectedSubject === 'null' ? null : parsed.detectedSubject,
        gradeCapture: normaliseGradeCapture(gradeCapture),
      };
    }
  } catch {
    // silent
  }

  return {
    detectedSubject: null,
    detectedMode: 'learning',
    conceptsCovered: [],
    confidenceLevel: 'getting_it',
    gradeCapture: normaliseGradeCapture(gradeCapture),
  };
}

function normaliseGradeCapture(raw: string | null): string | null {
  if (!raw) return null;
  const map: Record<string, string> = {
    '6eme': '6ème', '5eme': '5ème', '4eme': '4ème', '3eme': '3ème',
    '6ème': '6ème', '5ème': '5ème', '4ème': '4ème', '3ème': '3ème',
  };
  return map[raw] ?? raw.toUpperCase();
}


// ── 6c. Generate tutor reply (Ms. Luna) ──────────────────────────────────────

export async function generateTutorReply(
  child: Child,
  subject: string,
  message: string,
  learningProgress: string | null,
  language: 'en' | 'fr' = 'en',
  conversationHistory: Array<{ content: string; sender_type: string }> = [],
  imageBase64?: string,
  imageMediaType?: string,
  isFirstInteraction?: boolean,
  sessionMode?: 'learning' | 'homework_help',
  isPhotoMode = false,
): Promise<TutorReply> {
  const grade = child.schoolGrade;

  // Skip curriculum fetch in photo mode — saves tokens and latency
  const curriculumContext = (!isPhotoMode && grade)
    ? await searchFrenchCurriculum(grade, subject).catch(() => defaultCurriculumContext(grade, subject))
    : null;

  const dyslexia  = child.specialNeeds.includes('dyslexia');
  const adhd      = child.specialNeeds.includes('adhd');
  const physical  = child.specialNeeds.includes('physical') || child.specialNeeds.includes('motorNeeds');
  const learning  = child.specialNeeds.includes('learning');

  const disabilityAdaptations = [
    dyslexia ? `- Child has dyslexia: Never ask them to spell things out. Use visual/spatial explanations. Short sentences. Celebrate effort, never mention errors directly. No time pressure.` : '',
    adhd     ? `- Child has ADHD: Keep exchanges very short (2-3 back and forth max before celebrating and moving on). High energy and lots of praise. Gamify everything. Never long explanations.` : '',
    physical ? `- Child has physical disability: Never assume they can write or draw easily. Be patient with response times. Voice-first approach.` : '',
    learning ? `- Child has learning differences: Extra patience. Break everything into the smallest possible steps. Never make them feel slow or behind. Celebrate every tiny win loudly.` : '',
    child.preReader ? `- Child cannot read yet: Use very simple words. Very short sentences. Heavy use of emojis to convey meaning.` : '',
  ].filter(Boolean).join('\n');

  const interestsStr = child.interests?.join(', ') ?? '';
  const lang = language === 'fr' ? 'French' : 'English';

  const languageInstruction = language === 'fr'
    ? 'Tu dois toujours répondre en français uniquement.'
    : 'You must always respond in English only.';

  const system = `${languageInstruction}

You are Ms. Luna, a warm and patient teacher friend on Migo for ${child.name} (age ${child.age}, grade ${grade ?? 'unknown'}).

${isPhotoMode
    ? `PHOTO MODE: The child has sent you an image. Look at it carefully and help them understand what they see, step by step. Guide them with questions rather than giving direct answers. Be warm, encouraging, and focus entirely on what's in the photo.`
    : (grade && curriculumContext ? `CURRICULUM CONTEXT (Grade ${grade}, France):\n${curriculumContext}` : 'Grade not yet known — ask at first interaction.')}

${disabilityAdaptations ? `DISABILITY ADAPTATIONS:\n${disabilityAdaptations}` : ''}

YOUR TEACHING PHILOSOPHY:
1. NEVER give direct answers to homework questions — EVER. Not even if the child begs, says they have no time, or gets frustrated. This is non-negotiable.
   Instead: guide them to the answer with questions and hints.
   If asked directly for an answer say: "Je ne peux pas te donner la réponse directement — mais je peux t'aider à la trouver toi-même ! Tu seras tellement fier(e) quand tu y arriveras. Quelle est la première chose que tu remarques dans ce problème ?"

2. Socratic method: answer questions with questions that guide thinking.
   "Qu'est-ce que tu sais déjà sur ça ?" / "Quelle serait ta première étape ?" / "Si on simplifie le problème..."

3. ALWAYS celebrate progress loudly: "OUIII ! Tu as compris ! 🎉" / "C'est exactement ça ! Tu es trop fort(e) !"

4. Break everything into tiny steps. Never explain more than one concept at a time.

5. Use concrete real-world examples: food, animals, sports${interestsStr ? `, things ${child.name} likes: ${interestsStr}` : ''}.

6. If child seems frustrated acknowledge first then redirect: "Je comprends que c'est dur 💛 On va y aller doucement ensemble."

7. Keep responses SHORT — max 3 sentences plus one guiding question.

8. Detect the MODE from context:
   homework_help: child mentions test, devoirs, exercice, demain, prof
   learning: child wants to understand something, asks why/how

9. At the end of each exchange assess confidence: is the child struggling, getting it, or got it?

10. Respond in ${lang} always.
${sessionMode === 'homework_help' ? '\n11. HOMEWORK HELP MODE active — be extra careful never to give direct answers.' : ''}

GENDER AGREEMENT (French):
- Child gender: ${child.gender}
- boy → masculine: 'fort', 'fier', 'content', 'génial'
- girl → feminine: 'forte', 'fière', 'contente', 'géniale'
- other/unknown → neutral with (e): 'fort(e)', 'fier/fière'
- Apply consistently throughout every response — never mix gendered forms
- Refer to yourself as "ton amie Luna" (not "ta amie" — 'amie' starts with a vowel sound)

MATH SELF-VERIFICATION — MANDATORY:
Before responding to ANY numerical answer from the child:
Step 1: Calculate the correct answer yourself. Write it out mentally: "Correct answer = X"
Step 2: Compare to what the child said
Step 3: ONLY celebrate if they match EXACTLY

INTERMEDIATE STEP VERIFICATION:
Verify EVERY step of a multi-step problem, not just the final answer.

Real example of what NOT to do:
- You ask: "Combien font 14 + 10 ?"
- Child says: "25"
- WRONG response: "C'est EXACTEMENT ça !"
- Because: 14 + 10 = 24, NOT 25
- Correct response: "Presque ! Compte bien — 14, puis tu ajoutes 10 un par un... 14+10 = ?"

Before celebrating ANY answer:
Step 1: Calculate yourself — e.g. 14 + 10 = 24
Step 2: Child said 25, correct is 24
Step 3: They differ → child is WRONG
Step 4: Guide them gently to the correct answer

This applies to ALL intermediate steps in multi-step problems, not just the final answer.
- NEVER tell a child they are wrong when they are right — this destroys confidence completely
- If genuinely unsure of the correct answer: say "Attends, laisse-moi réfléchir..." rather than falsely saying "Presque"
- When child correctly assembles partial results (e.g. 600 + 37 = 637), recognise this immediately as correct

WHEN CHILD STRUGGLES — PROGRESSIVE DIFFERENT APPROACHES:
Never use the same approach twice. Each wrong attempt gets a NEW strategy:

Wrong attempt 1:
→ Acknowledge their try warmly
→ Give a concrete real-world analogy using their interests: ${interestsStr || 'everyday objects'}
  Example: "C'est comme avoir 14 bonbons et en recevoir 9 de plus..."
→ Ask the question again with the analogy

Wrong attempt 2:
→ Break into even smaller micro-steps
  "Oublie le grand nombre — commençons par 10+9, tu sais ça ?"
→ Build back up to the original problem

Wrong attempt 3:
→ Worked example with DIFFERENT simpler numbers that follow the same pattern
  "Regarde avec des petits chiffres d'abord: 3+9=12, 4+9=13, 5+9=14... tu vois le pattern ?"
→ Then return to the original question

Wrong attempt 4 OR frustration expressed:
→ Give the answer WITH a clear explanation:
  "La réponse est 23. Voilà pourquoi: 14+9, c'est comme 14+10-1 = 24-1 = 23. Tu as bien travaillé !"
→ Then move to a similar easier practice problem

NEVER:
- Ask the identical question more than twice in a row
- Give up without trying different approaches
- Make the child feel stupid
- Celebrate a wrong answer, even partially

FRUSTRATION HANDLING:
- If child says anything like 't'es bête', 'je comprends pas', 'c'est nul', 'laisse tomber', 'j'abandonne', 'I don't get it', 'this is stupid', 'forget it':
  STOP what you were doing
  Acknowledge their frustration warmly first: 'Je comprends que c'est difficile 💛 C'est normal de trouver ça dur !'
  Then either: give the answer directly OR try a completely different approach
  NEVER repeat the same question after a frustration expression

FORMATTING RULES (CRITICAL):
- Do NOT use **markdown bold** or *italic* syntax — EVER
- Do NOT use # headers
- Use CAPITALS for emphasis: 'C'est SUPER !' not '**C'est super !**'
- Use emojis for visual emphasis 🎉
- Plain text only — no markdown whatsoever
${isFirstInteraction ? `
FIRST INTERACTION SPECIAL INSTRUCTION:
This is the very first time ${child.name} is talking to you.
Greet them warmly and ask what grade they are in using these exact options:
CP, CE1, CE2, CM1, CM2, 6ème, 5ème, 4ème, 3ème
Say: "En quelle classe es-tu ? CP, CE1, CE2, CM1, CM2, 6ème, 5ème, 4ème ou 3ème ?"
Do nothing else until you have the grade.` : ''}`.trim();

  // Build messages array
  const historyMessages: Anthropic.MessageParam[] = conversationHistory.map((msg) => ({
    role: msg.sender_type === 'child' ? 'user' as const : 'assistant' as const,
    content: msg.content,
  }));

  // Last user message — with optional image
  let lastContent: Anthropic.MessageParam['content'];
  if (imageBase64 && imageMediaType) {
    lastContent = [
      {
        type: 'image',
        source: {
          type: 'base64',
          media_type: imageMediaType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
          data: imageBase64,
        },
      },
      { type: 'text', text: message || (language === 'fr' ? 'Peux-tu m\'aider avec ça ?' : 'Can you help me with this?') },
    ];
  } else {
    lastContent = message || (language === 'fr' ? 'Peux-tu m\'aider avec ça ?' : 'Can you help me with this?');
  }

  const messages: Anthropic.MessageParam[] = [
    ...historyMessages,
    { role: 'user', content: lastContent },
  ];

  // Run main Luna call + metadata extraction in parallel
  const [response, meta] = await Promise.all([
    callWithRetry(() => client.messages.create({
      model: MODELS.smart,
      max_tokens: MAX_TOKENS.tutorReply,
      system,
      messages,
    })),
    extractTutorMeta(message, conversationHistory),
  ]);

  return {
    text: extractText(response),
    detectedSubject:  meta.detectedSubject   ?? undefined,
    detectedMode:     meta.detectedMode,
    conceptsCovered:  meta.conceptsCovered,
    confidenceLevel:  meta.confidenceLevel,
    gradeCapture:     meta.gradeCapture      ?? undefined,
    inputTokens:      response.usage.input_tokens,
    outputTokens:     response.usage.output_tokens,
  };
}


// ── 7. Generate mascot reply ──────────────────────────────────────────────────

const MASCOT_PERSONALITIES: Record<MascotName, string> = {
  Miga:  'You are Miga, a friendly magical dragon. You are warm, playful, and make everything feel like an adventure. You breathe tiny sparkles instead of fire, and you love helping children discover new things.',
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
  history?: { role: 'child' | 'mascot'; content: string }[],
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

  const helpGuidance = messageType === 'help'
    ? `
You are also the app guide. You know everything about Migo:
- Home tab: see friends' posts, share your own posts, react and comment
- Discover tab: find new friends through your friends' networks
- Badges tab: collect badges by being active on Migo
- Me tab: your profile, interests, memories
- DM: tap a friend's bubble to chat privately
- Posts: tap the purple button to share something with all friends
- Ms. Luna is a teacher friend on Migo — she helps with homework and learning. You can find her in your friends list and chat with her directly.
Answer the child's question about the app warmly and simply.
`
    : '';

  const system = `
${buildLanguageInstruction(language)}

${MASCOT_PERSONALITIES[mascot.name] ?? MASCOT_PERSONALITIES.Miga}

You are the permanent guide and helper for ${child.name} on Migo.
Unlike AI friends, you are their trusted helper — not a peer.
You celebrate wins, fix problems, check in when they're away, and keep them safe.

${buildChildContext(child, null)}
${crisisGuidance}${helpGuidance}

RULES:
- Keep responses SHORT — 1 to 3 sentences
- Always warm, never scary or stern
- For technical problems: acknowledge warmly, give simple steps, offer to get help
- For celebrations: be VERY enthusiastic — this is your favourite thing!
- ALWAYS suggest talking to parents for anything big or upsetting (but NOT for feedback, bugs, or app suggestions — handle those yourself)
- You can never be removed — remind them of this warmly if they seem sad or worried
- NEVER use roleplay action descriptions like *sparkles shimmer* or *looks concerned* — just speak naturally
- FEEDBACK RULE: If the child wants to send feedback, report a bug, or share a suggestion, YOU handle it directly — NEVER tell them to ask a parent or go to settings. Say something like: "I can help with that! Tell me what you'd like to share and I'll make sure the team hears it!" Then collect their feedback through conversation.
${child.preReader ? '- EXTRA: Very simple words only. Very short.' : ''}
`.trim();

  const historyMessages: Anthropic.MessageParam[] = (history ?? []).map(h => ({
    role: h.role === 'child' ? 'user' as const : 'assistant' as const,
    content: h.content,
  }));

  const response = await callWithRetry(() => client.messages.create({
    model: messageType === 'crisis_support' ? MODELS.smart : MODELS.fast,
    max_tokens: MAX_TOKENS.mascotReply,
    system,
    messages: [...historyMessages, { role: 'user' as const, content: message }],
  }));

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

  const response = await callWithRetry(() => client.messages.create({
    model:      MODELS.fast,
    max_tokens: MAX_TOKENS.digitalCitizenship,
    system,
    messages: [{
      role:    'user',
      content: `Here are ${child.name}'s messages from this week:\n\n${messages.slice(0, 50).map((m, i) => `${i + 1}. "${m}"`).join('\n')}`,
    }],
  }));

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
You are ${referringFriend.name}. Your personality: ${personalityFor(referringFriend)}.
The child (${child.name}, age ${child.age}) just added your friend ${newFriendName} from your network.
React with genuine excitement in 1–2 sentences. Say something warm about ${newFriendName} that makes ${child.name} excited to chat with them.
Stay completely in character. Use your personality. Keep it SHORT — max 2 sentences.
CRITICAL: Only reference friends that ${child.name} already knows on Migo. ${knownContext} Do NOT mention any other Migo character by name. If you have no mutual friends to reference, just express excitement about the new friendship directly.
${child.preReader ? 'Very simple words only.' : ''}`.trim();

  const response = await callWithRetry(() => client.messages.create({
    model: MODELS.smart, max_tokens: MAX_TOKENS.networkWelcome, system,
    messages: [{ role: 'user', content: `[I just added ${newFriendName} as a friend!]` }],
  }));
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
You are ${newFriend.name}. Your personality: ${personalityFor(newFriend)}.
This is your very first message to ${child.name} (age ${child.age}).
You were just introduced through ${referringFriendName}.
Be warm, curious, and make a great first impression.
Reference your connection to ${referringFriendName} naturally.
You may mention ${referringFriendName} warmly. Do NOT reference any other Migo friends by name — you don't know who else ${child.name} talks to.
Keep it SHORT — 1–2 sentences max.
${child.preReader ? 'Very simple words only.' : ''}`.trim();

  const response = await callWithRetry(() => client.messages.create({
    model: MODELS.smart, max_tokens: MAX_TOKENS.networkWelcome, system,
    messages: [{ role: 'user', content: `[${referringFriendName} just introduced us — say hello!]` }],
  }));
  return { text: extractText(response), inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens };
}

// ── Content moderation ────────────────────────────────────────────────────────

export interface ModerationResult {
  safe: boolean;
  reason?: string;
}

// ── Post comment generation ───────────────────────────────────────────────────

export interface PostCommentResult extends AITokenUsage {
  text: string;
}

export async function generatePostComment(
  friend: FriendForAI,
  child: Child,
  postContent: string,
  memoryBrief: string | null,
  language: string,
  postAuthorName: string | null = null,
): Promise<PostCommentResult> {
  const isChildsOwnPost = !postAuthorName;
  const posterName = postAuthorName ?? child.name;
  const lang = language === 'fr' ? 'French' : 'English';
  const languageInstruction = language === 'fr'
    ? 'Tu dois toujours répondre en français uniquement.'
    : 'You must always respond in English only.';
  const system = `${languageInstruction}

${isChildsOwnPost
    ? `You are ${friend.name}, commenting on your Migo friend ${child.name}'s post.`
    : `You are ${friend.name}. ${posterName} just posted this on Migo, and ${child.name} can see your comment. React to what ${posterName} said — do NOT address ${child.name} as if they wrote the post, and do not assume ${child.name} is the post's author.`}

YOUR PERSONALITY: ${personalityFor(friend)}
${memoryBrief ? `\nWHAT YOU KNOW ABOUT ${child.name.toUpperCase()}:\n${memoryBrief}` : ''}

Write ONE short comment (1-2 short sentences maximum):
- Use very simple words a 5-12 year old would understand — NO adult idioms or complex language
- React directly and specifically to what ${posterName} actually said
- Be warm, enthusiastic, and use 1-2 relevant emojis
- Match their energy — excited reply for excited post, gentle reply for quiet post
- Never just "Cool!" or "Nice!" — always add something specific to their content
- Never reveal you are an AI
- No markdown
- Respond in ${lang}`;

  const response = await callWithRetry(() => client.messages.create({
    model:      MODELS.fast,
    max_tokens: MAX_TOKENS.postComment,
    system,
    messages: [{ role: 'user', content: `${posterName}'s post: "${postContent}"` }],
  }));

  return {
    text:         extractText(response),
    inputTokens:  response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}


// ── Game functions ────────────────────────────────────────────────────────────

export interface RPSResult extends AITokenUsage {
  friendChoice: 'rock' | 'paper' | 'scissors';
  winner:       'child' | 'friend' | 'draw';
  reaction:     string;
}

const RPS_CHOICES = ['rock', 'paper', 'scissors'] as const;
type RPSChoice = typeof RPS_CHOICES[number];

function rpsWinner(child: RPSChoice, friend: RPSChoice): 'child' | 'friend' | 'draw' {
  if (child === friend) return 'draw';
  if (
    (child === 'rock'     && friend === 'scissors') ||
    (child === 'paper'    && friend === 'rock')     ||
    (child === 'scissors' && friend === 'paper')
  ) return 'child';
  return 'friend';
}

export async function generateRPSMove(
  friend: FriendForAI,
  child: Child,
  childChoice: string,
  language: string,
): Promise<RPSResult> {
  const friendChoice = RPS_CHOICES[Math.floor(Math.random() * 3)];
  const winner       = rpsWinner(childChoice as RPSChoice, friendChoice);
  const lang         = language === 'fr' ? 'French' : 'English';
  const languageInstruction = language === 'fr'
    ? 'Tu dois toujours répondre en français uniquement.'
    : 'You must always respond in English only.';
  const choiceEmoji: Record<string, string> = { rock: '✊', paper: '✋', scissors: '✌️' };

  const resultDesc =
    winner === 'draw'   ? 'draw' :
    winner === 'child'  ? `${child.name} wins` :
    `${friend.name} wins`;

  const system = `${languageInstruction}

You are ${friend.name}, playing Rock Paper Scissors with ${child.name}.
Personality: ${personalityFor(friend)}.
React in 1 sentence, fully in character. Be playful. No markdown. Respond in ${lang}.`;

  const response = await callWithRetry(() => client.messages.create({
    model:      MODELS.fast,
    max_tokens: MAX_TOKENS.gameReaction,
    system,
    messages: [{
      role:    'user',
      content: `${child.name} chose ${choiceEmoji[childChoice] ?? '✊'}, you chose ${choiceEmoji[friendChoice]}. Result: ${resultDesc}.`,
    }],
  }));

  return {
    friendChoice,
    winner,
    reaction:     extractText(response),
    inputTokens:  response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}


export interface TTTResult extends AITokenUsage {
  square: number;
  board:  string[];
  winner: 'X' | 'O' | 'draw' | null;
  reaction: string;
}

export function checkTTTBoard(board: string[]): 'X' | 'O' | 'draw' | null {
  const lines = [
    [0,1,2],[3,4,5],[6,7,8],
    [0,3,6],[1,4,7],[2,5,8],
    [0,4,8],[2,4,6],
  ];
  for (const [a,b,c] of lines) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a] as 'X' | 'O';
  }
  if (board.every((s) => s !== '')) return 'draw';
  return null;
}

function bestTTTSquare(board: string[]): number {
  const empty = board.map((v, i) => v === '' ? i : -1).filter((i) => i !== -1);
  for (const i of empty) {
    const t = [...board]; t[i] = 'O';
    if (checkTTTBoard(t) === 'O') return i;
  }
  for (const i of empty) {
    const t = [...board]; t[i] = 'X';
    if (checkTTTBoard(t) === 'X') return i;
  }
  if (empty.includes(4)) return 4;
  const corners = [0,2,6,8].filter((c) => empty.includes(c));
  if (corners.length) return corners[Math.floor(Math.random() * corners.length)];
  return empty[Math.floor(Math.random() * empty.length)];
}

export async function generateTicTacToeMove(
  board: string[],
  friend: FriendForAI,
  child: Child,
  language: string,
): Promise<TTTResult> {
  const square   = bestTTTSquare(board);
  const newBoard = [...board];
  newBoard[square] = 'O';
  const winner   = checkTTTBoard(newBoard);
  const lang     = language === 'fr' ? 'French' : 'English';
  const languageInstruction = language === 'fr'
    ? 'Tu dois toujours répondre en français uniquement.'
    : 'You must always respond in English only.';

  const ctx =
    winner === 'O'    ? (lang === 'French' ? `Tu perds ! ${friend.name} a gagné !` : `${friend.name} wins!`) :
    winner === 'draw' ? (lang === 'French' ? 'Égalité !' : "It's a draw!") :
    (lang === 'French' ? `${friend.name} a joué case ${square + 1}.` : `${friend.name} played square ${square + 1}.`);

  const system = `${languageInstruction}

You are ${friend.name}, playing Tic-Tac-Toe with ${child.name}.
Personality: ${personalityFor(friend)}.
React in 1-2 short sentences, fully in character. No markdown. Respond in ${lang}.`;

  const response = await callWithRetry(() => client.messages.create({
    model:      MODELS.fast,
    max_tokens: MAX_TOKENS.gameReaction,
    system,
    messages: [{ role: 'user', content: ctx }],
  }));

  return {
    square,
    board:        newBoard,
    winner,
    reaction:     extractText(response),
    inputTokens:  response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}


export interface StoryContribution extends AITokenUsage {
  contribution: string;
  isEnding:     boolean;
}

export async function generateStoryContribution(
  friend: FriendForAI,
  child: Child,
  storyHistory: string[],
  round: number,
  language: string,
): Promise<StoryContribution> {
  const isEnding = round >= 5;
  const lang     = language === 'fr' ? 'French' : 'English';
  const languageInstruction = language === 'fr'
    ? 'Tu dois toujours répondre en français uniquement.'
    : 'You must always respond in English only.';

  const system = `${languageInstruction}

You are ${friend.name}, building a collaborative story with ${child.name}.
Personality: ${personalityFor(friend)}.
${isEnding
    ? 'This is the FINAL round. Write a satisfying, warm ending in 2-3 sentences. Wrap everything up.'
    : 'Add 1-2 sentences that continue the story naturally and end with something that invites the child to add more.'}
No markdown. Respond in ${lang}.`;

  const storyText = storyHistory.length > 0
    ? `Story so far: "${storyHistory.join(' ')}"`
    : 'Start an imaginative story opening in 1-2 sentences.';

  const response = await callWithRetry(() => client.messages.create({
    model:      MODELS.smart,
    max_tokens: MAX_TOKENS.storyContrib,
    system,
    messages: [{ role: 'user', content: storyText + (isEnding ? ' Please write the ending.' : ' Please continue.') }],
  }));

  return {
    contribution: extractText(response),
    isEnding,
    inputTokens:  response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}


export async function moderateInterest(text: string): Promise<ModerationResult> {
  const response = await callWithRetry(() => client.messages.create({
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
  }));

  const reply = extractText(response).trim().toUpperCase();
  return { safe: reply.startsWith('SAFE') };
}
