import { AppState, AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { childSession } from '@/services/api';

export function initSessionTracking(): () => void {
  const subscription = AppState.addEventListener('change', (state: AppStateStatus) => {
    if (state === 'background' || state === 'inactive') {
      AsyncStorage.getItem('childToken').then(token => {
        if (token) childSession.end(token).catch(() => {});
      }).catch(() => {});
    } else if (state === 'active') {
      AsyncStorage.getItem('childToken').then(token => {
        if (token) childSession.start(token).catch(() => {});
      }).catch(() => {});
    }
  });

  return () => subscription.remove();
}
