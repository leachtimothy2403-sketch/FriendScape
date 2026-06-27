import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import i18n from '@/i18n';

// Fallback to get device locale without requiring expo-localization
function getDeviceLocale(): string {
  try {
    // Try to use expo-localization if available
    const { getLocales } = require('expo-localization');
    return getLocales()[0]?.languageCode ?? 'en';
  } catch {
    // Fallback: try navigator language
    if (typeof navigator !== 'undefined' && navigator.language) {
      return navigator.language.split('-')[0];
    }
    return 'en';
  }
}

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
      const deviceLocale = getDeviceLocale();
      const lang: 'en' | 'fr' = deviceLocale.startsWith('fr') ? 'fr' : 'en';
      set({ language: lang });
      await i18n.changeLanguage(lang);
      // Don't persist to AsyncStorage yet — let the user's explicit
      // choice during enrollment/login become the first stored value
    }
  },
}));
