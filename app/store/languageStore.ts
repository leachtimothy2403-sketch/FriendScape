import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocales } from 'expo-localization';
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
    if (stored === 'fr' || stored === 'en') {
      const lang = stored;
      set({ language: lang });
      await i18n.changeLanguage(lang);
    } else {
      // No stored preference — use device locale
      const deviceLocale = getLocales()[0]?.languageCode ?? 'en';
      const lang: 'en' | 'fr' = deviceLocale.startsWith('fr') ? 'fr' : 'en';
      set({ language: lang });
      await i18n.changeLanguage(lang);
      // Don't persist to AsyncStorage yet — let the user's explicit
      // choice during enrollment/login become the first stored value
    }
  },
}));
