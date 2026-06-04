import { Child, PersonalityTrait, EmotionalEntry, Milestone } from '../../../shared/types';
import { FriendForAI, ExtendedMemory } from '../services/ai.service';

export function toChildType(row: Record<string, unknown>): Child {
  return {
    id:           String(row.id),
    parentId:     String(row.parent_id),
    name:         String(row.name),
    age:          Number(row.age),
    gender:       (row.gender as Child['gender'])       || 'preferNotToSay',
    language:     (row.language as Child['language'])   || 'en',
    specialNeeds: (row.special_needs as string[])       || [],
    preReader:    Boolean(row.pre_reader),
    avatarTheme:  (row.avatar_theme as Child['avatarTheme']) || 'animals',
    mascot:       (row.mascot as Child['mascot'])       || 'luna',
    interests:    (row.interests as string[])           || [],
    selectedPack:        String(row.selected_pack ?? ''),
    avatarUrl:           row.avatar_url ? String(row.avatar_url) : null,
    personalityTraits:   Array.isArray(row.personality_traits) ? (row.personality_traits as string[]) : undefined,
    personalityFreeText: row.personality_free_text ? String(row.personality_free_text) : undefined,
    personalityCompleted: Boolean(row.personality_completed),
    schoolGrade:          row.school_grade ? String(row.school_grade) : undefined,
    schoolCountry:        row.school_country ? String(row.school_country) : undefined,
    learningSessionsCount: row.learning_sessions_count !== undefined ? Number(row.learning_sessions_count) : undefined,
    lastSubject:          row.last_subject ? String(row.last_subject) : undefined,
    createdAt:    row.created_at as Date,
    updatedAt:    row.updated_at as Date,
  };
}

export function toFriendType(row: Record<string, unknown>): FriendForAI {
  return {
    id:           String(row.id),
    name:         String(row.name),
    personality:  (row.personality as PersonalityTrait[]) || [],
    interests:    (row.interests as string[])             || [],
    avatarStyle:  (row.avatar_style as FriendForAI['avatarStyle']) || 'cartoon',
    avatarUrl:    String(row.avatar_url ?? ''),
    isStarFriend: Boolean(row.is_star_friend),
    isTeacher:    Boolean(row.is_teacher),
    bio:          String(row.bio ?? ''),
    greeting:     String(row.greeting ?? ''),
    packId:       row.pack_id ? String(row.pack_id) : null,
    age:          row.age    ? Number(row.age)    : undefined,
    subject:      row.subject ? String(row.subject) : undefined,
  };
}

export function toMemoryType(row: Record<string, unknown>): ExtendedMemory {
  return {
    facts:            (row.facts as string[])           || [],
    emotionalHistory: (row.emotional_history as EmotionalEntry[]) || [],
    milestones:       (row.milestones as Milestone[])            || [],
  };
}
