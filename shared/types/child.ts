import type { AvatarConfig } from './avatar';

export type Gender = 'boy' | 'girl' | 'nonbinary' | 'preferNotToSay';
export type Language = 'en' | 'es' | 'fr' | 'de' | 'pt' | 'zh' | 'ar';
export type AvatarTheme = 'animals' | 'space' | 'fantasy' | 'ocean' | 'jungle';
export type Mascot = 'luna' | 'cosmo' | 'pip' | 'finn' | 'sunny';

export interface Child {
  id: string;
  parentId: string;
  name: string;
  age: number;
  gender: Gender;
  language: Language;
  specialNeeds: string[];       // e.g. ['autism', 'dyslexia', 'adhd']
  preReader: boolean;
  avatarTheme: AvatarTheme;
  mascot: Mascot;
  interests: string[];          // e.g. ['dinosaurs', 'art', 'music']
  selectedPack: string;         // friend pack ID
  avatarUrl: string | null;
  personalityTraits?: string[]; // e.g. ['quiet_listener', 'feels_deeply']
  personalityFreeText?: string;
  personalityCompleted?: boolean;
  schoolGrade?: string;         // e.g. 'CP', 'CE1', 'CE2', 'CM1', 'CM2', '6eme', '5eme', '4eme', '3eme'
  schoolCountry?: string;       // default 'FR'
  learningSessionsCount?: number;
  lastSubject?: string;
  avatarConfig?: AvatarConfig;
  avatarBackground?: string;
  createdAt: Date;
  updatedAt: Date;
}
