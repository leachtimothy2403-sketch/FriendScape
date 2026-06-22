import { AppState, AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { childSession } from '@/services/api';

export function initSessionTracking(): () => void {
  const subscription = AppState.addEventListener('change', (state: AppStateStatus) => {
    if (state === 'background' || state === 'inactive') {
      AsyncStorage.getItem('childToken').then(token => {
        if (token) childSession.end(token).catch(() => {});
      }).catch(() => {});
    } else if (state === 'active') {
      AsyncStorage.getItem('childToken').then(async (token) => {
        if (!token) return;
        try { await childSession.start(token); } catch {}
        try {
          const res = await childSession.status(token);
          if (res.data.limitExceeded) {
            router.replace('/time-limit');
          }
        } catch {}
      }).catch(() => {});
    }
  });

  return () => subscription.remove();
}
