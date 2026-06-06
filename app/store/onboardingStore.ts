import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import type { AvatarConfig } from '@migo/shared/types/avatar';

interface OnboardingState {
  // Data
  parentEmail: string;
  childName: string;
  age: string;               // "5–6" | "7–8" | "9–10" | "11–12"
  gender: string;            // "girl" | "boy" | "other"
  language: string;          // language code e.g. "en"
  specialNeeds: boolean;
  preReader: boolean;
  specialNeedsDetails: string[];  // e.g. ["autism", "dyslexia"]
  avatarTheme: string;
  mascotId: string;
  interests: string[];
  freeInterest: string;
  avatarPack: string;
  personalityTraits: string[];
  personalityFreeText: string;
  avatarConfig: AvatarConfig | null;
  avatarBackground: string;

  // Actions
  initParentEmail: () => Promise<void>;
  setChildName: (v: string) => void;
  setAge: (v: string) => void;
  setGender: (v: string) => void;
  setLanguage: (v: string) => void;
  setSpecialNeeds: (v: boolean) => void;
  setPreReader: (v: boolean) => void;
  setSpecialNeedsDetails: (v: string[]) => void;
  setAvatarTheme: (v: string) => void;
  setMascotId: (v: string) => void;
  setInterests: (v: string[]) => void;
  setFreeInterest: (v: string) => void;
  setAvatarPack: (v: string) => void;
  setPersonalityTraits: (v: string[]) => void;
  setPersonalityFreeText: (v: string) => void;
  setAvatarConfig: (v: AvatarConfig) => void;
  setAvatarBackground: (v: string) => void;
  resetStore: () => void;
}

const DEFAULTS = {
  parentEmail:         '',
  childName:           '',
  age:                 '',
  gender:              '',
  language:            'en',
  specialNeeds:        false,
  preReader:           false,
  specialNeedsDetails: [] as string[],
  avatarTheme:         '',
  mascotId:            '',
  interests:           [] as string[],
  freeInterest:        '',
  avatarPack:          '',
  personalityTraits:   [] as string[],
  personalityFreeText: '',
  avatarConfig:        null as AvatarConfig | null,
  avatarBackground:    '#EEEDFE',
};

// Use localStorage on web so data survives page reloads; AsyncStorage on native.
const storage = Platform.OS === 'web'
  ? createJSONStorage(() => localStorage)
  : createJSONStorage(() => AsyncStorage);

export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set) => ({
      ...DEFAULTS,

      initParentEmail: async () => {
        const email = await AsyncStorage.getItem('pendingParentEmail');
        if (email) set({ parentEmail: email });
      },

      setChildName:           (v) => set({ childName: v }),
      setAge:                 (v) => set({ age: v }),
      setGender:              (v) => set({ gender: v }),
      setLanguage:            (v) => set({ language: v }),
      setSpecialNeeds:        (v) => set({ specialNeeds: v }),
      setPreReader:           (v) => set({ preReader: v }),
      setSpecialNeedsDetails: (v) => set({ specialNeedsDetails: v }),
      setAvatarTheme:         (v) => set({ avatarTheme: v }),
      setMascotId:            (v) => set({ mascotId: v }),
      setInterests:           (v) => set({ interests: v }),
      setFreeInterest:        (v) => set({ freeInterest: v }),
      setAvatarPack:          (v) => set({ avatarPack: v }),
      setPersonalityTraits:   (v) => set({ personalityTraits: v }),
      setPersonalityFreeText: (v) => set({ personalityFreeText: v }),
      setAvatarConfig:        (v) => set({ avatarConfig: v }),
      setAvatarBackground:    (v) => set({ avatarBackground: v }),
      resetStore:             ()  => set(DEFAULTS),
    }),
    {
      name:    'persist:onboarding',
      storage,
    },
  ),
);
