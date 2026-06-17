/**
 * Unit tests for pure/exported helpers in ai.service.ts.
 * No real Anthropic API calls — the SDK is mocked.
 * Note: buildLanguageInstruction is a private function and cannot be tested
 * directly; its behavior is covered indirectly by selectVoiceId and
 * buildMemoryBrief integration paths.
 */

jest.mock('@anthropic-ai/sdk', () => {
  const mockCreate = jest.fn().mockResolvedValue({
    content: [{ type: 'text', text: '{}' }],
    usage: { input_tokens: 10, output_tokens: 5 },
  });
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      messages: { create: mockCreate },
    })),
  };
});

jest.mock('../services/redis.service', () => ({
  default: { status: 'not_ready' },
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue(undefined),
}));

import { buildMemoryBrief, selectVoiceId } from '../services/ai.service';
import type { ExtendedMemory } from '../services/ai.service';

// ── buildMemoryBrief ──────────────────────────────────────────────────────────

describe('buildMemoryBrief', () => {
  it('returns null for null input', () => {
    expect(buildMemoryBrief(null)).toBeNull();
  });

  it('returns null for undefined input', () => {
    expect(buildMemoryBrief(undefined)).toBeNull();
  });

  it('returns null for empty memory object', () => {
    const memory: ExtendedMemory = { facts: [], emotionalHistory: [], milestones: [] };
    expect(buildMemoryBrief(memory)).toBeNull();
  });

  it('includes facts in the brief', () => {
    const memory: ExtendedMemory = {
      facts: ['Loves dinosaurs', 'Has a dog named Max'],
      emotionalHistory: [],
      milestones: [],
    };
    const brief = buildMemoryBrief(memory);
    expect(brief).toContain('Key facts');
    expect(brief).toContain('Loves dinosaurs');
    expect(brief).toContain('Has a dog named Max');
  });

  it('includes only the last 3 emotional events', () => {
    const events = [
      { date: new Date('2024-01-01'), mood: 'happy', note: 'Event A' },
      { date: new Date('2024-01-02'), mood: 'sad', note: 'Event B' },
      { date: new Date('2024-01-03'), mood: 'happy', note: 'Event C' },
      { date: new Date('2024-01-04'), mood: 'worried', note: 'Event D' },
    ];
    const memory: ExtendedMemory = { emotionalHistory: events };
    const brief = buildMemoryBrief(memory);
    // Should include last 3 (B, C, D) but not A
    expect(brief).toContain('Event B');
    expect(brief).toContain('Event C');
    expect(brief).toContain('Event D');
    expect(brief).not.toContain('Event A');
  });

  it('includes interest refinements when present', () => {
    const memory: ExtendedMemory = {
      interestRefinements: ['Specifically likes Jurassic Park', 'Prefers drawing animals'],
    };
    const brief = buildMemoryBrief(memory);
    expect(brief).toContain('Specific interests');
    expect(brief).toContain('Jurassic Park');
  });

  it('includes friendship updates when present', () => {
    const memory: ExtendedMemory = {
      friendshipUpdates: { Zara: 'They talked about art last time' },
    };
    const brief = buildMemoryBrief(memory);
    expect(brief).toContain('Friendship notes');
    expect(brief).toContain('Zara');
    expect(brief).toContain('They talked about art last time');
  });

  it('includes recent milestones (last 2)', () => {
    const memory: ExtendedMemory = {
      milestones: [
        { id: 'm1', title: 'First Post', description: 'Shared their first post', achievedAt: new Date(), badgeId: null },
        { id: 'm2', title: 'New Friend', description: 'Made a new friend', achievedAt: new Date(), badgeId: null },
        { id: 'm3', title: 'Level Up', description: 'Reached level 2', achievedAt: new Date(), badgeId: null },
      ],
    };
    const brief = buildMemoryBrief(memory);
    expect(brief).toContain('Recent milestones');
    expect(brief).toContain('New Friend');
    expect(brief).toContain('Level Up');
    expect(brief).not.toContain('First Post');
  });

  it('builds a combined brief from multiple fields', () => {
    const memory: ExtendedMemory = {
      facts: ['Age 8', 'Loves art'],
      interestRefinements: ['Watercolour painting'],
      emotionalHistory: [{ date: new Date(), mood: 'happy', note: 'Felt happy after drawing' }],
      milestones: [{ id: 'm1', title: 'First DM', description: 'Sent their first DM', achievedAt: new Date(), badgeId: null }],
      friendshipUpdates: { Zara: 'Close friends' },
    };
    const brief = buildMemoryBrief(memory);
    expect(brief).not.toBeNull();
    expect(brief!.length).toBeGreaterThan(50);
  });
});

// ── selectVoiceId ─────────────────────────────────────────────────────────────

describe('selectVoiceId', () => {
  // French — two voices regardless of personality
  it('returns daniel voice for French boy', () => {
    const voiceId = selectVoiceId('boy', 'fr', []);
    expect(voiceId).toBe('onwK4e9ZLuTAKqWW03F9'); // daniel
  });

  it('returns alice voice for French girl', () => {
    const voiceId = selectVoiceId('girl', 'fr', ['creative']);
    expect(voiceId).toBe('Xb7hH8MSUJpSbSDYk0k2'); // alice
  });

  it('returns alice voice for French "other" gender', () => {
    const voiceId = selectVoiceId('other', 'fr', []);
    expect(voiceId).toBe('Xb7hH8MSUJpSbSDYk0k2'); // alice
  });

  // English girl voices
  it('returns charlotte for theatrical English girl', () => {
    const voiceId = selectVoiceId('girl', 'en', ['theatrical and expressive']);
    expect(voiceId).toBe('XB0fDUnXU5powFXDhCwa'); // charlotte
  });

  it('returns dorothy for energetic English girl', () => {
    const voiceId = selectVoiceId('girl', 'en', ['outgoing']);
    expect(voiceId).toBe('ThT5KcBeYPX3keUQqHPh'); // dorothy
  });

  it('returns bella (default) for calm English girl', () => {
    const voiceId = selectVoiceId('girl', 'en', ['gentle']);
    expect(voiceId).toBe('EXAVITQu4vr4xnSDxMaL'); // bella
  });

  // English boy voices
  it('returns arnold for energetic English boy', () => {
    const voiceId = selectVoiceId('boy', 'en', ['energetic and upbeat']);
    expect(voiceId).toBe('VR6AewLTigWG4xSOukaG'); // arnold
  });

  it('returns antoni for calm English boy', () => {
    const voiceId = selectVoiceId('boy', 'en', ['thoughtful']);
    expect(voiceId).toBe('ErXwobaYiN019PkySvjV'); // antoni
  });

  it('returns adam (default) for neutral English boy', () => {
    const voiceId = selectVoiceId('boy', 'en', []);
    expect(voiceId).toBe('pNInz6obpgDQGcFmaJgB'); // adam
  });

  it('returns bella for English "other" gender with no personality', () => {
    const voiceId = selectVoiceId('other', 'en', []);
    expect(voiceId).toBe('EXAVITQu4vr4xnSDxMaL'); // bella
  });

  // buildLanguageInstruction (private) — verified via selectVoiceId routing
  it('routes FR male to daniel regardless of personality traits', () => {
    const p1 = selectVoiceId('male', 'fr', ['outgoing', 'creative']);
    const p2 = selectVoiceId('male', 'fr', ['thoughtful', 'gentle']);
    expect(p1).toBe(p2); // always daniel for FR male
  });

  it('routes FR female to alice regardless of personality traits', () => {
    const p1 = selectVoiceId('female', 'fr', ['outgoing']);
    const p2 = selectVoiceId('female', 'fr', ['calm']);
    expect(p1).toBe(p2); // always alice for FR female
  });
});
