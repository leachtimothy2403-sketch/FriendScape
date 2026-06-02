import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import i18n from '@/i18n';

const LANGUAGE_KEY = 'appLanguage';

interface LanguageState {
  language: 'en' | 'fr';
  setLanguage: (lang: 'en' | 'fr') => Promise<void>;
  initLanguage: () => Promise<void>;
}

export const useLanguageStore = create<LanguageState>((set) => ({
  language: 'en',

  setLanguage: async (lang) => {
    set({ language: lang });
    await AsyncStorage.setItem(LANGUAGE_KEY, lang);
    await i18n.changeLanguage(lang);
  },

  initLanguage: async () => {
    const stored = await AsyncStorage.getItem(LANGUAGE_KEY);
    const lang: 'en' | 'fr' = stored === 'fr' ? 'fr' : 'en';
    set({ language: lang });
    await i18n.changeLanguage(lang);
  },
}));
