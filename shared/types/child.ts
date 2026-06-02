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
  createdAt: Date;
  updatedAt: Date;
}
