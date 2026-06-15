import {
  View, Text, TouchableOpacity, Alert,
  ActivityIndicator, StyleSheet,
} from 'react-native';
import { useState } from 'react';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { devApi } from '@/services/api';
import { useOnboardingStore } from '@/store/onboardingStore';
import { useNotificationStore } from '@/store/notificationStore';

export default function DevResetButton() {
  const resetOnboardingStore  = useOnboardingStore((s) => s.resetStore);
  const clearNotification     = useNotificationStore((s) => s.clearNotification);
  const setUnreadCount        = useNotificationStore((s) => s.setUnreadCount);
  const [resetting, setResetting] = useState(false);
  const [clearing, setClearing]   = useState(false);
  const [result, setResult]       = useState<{ text: string; color: string } | null>(null);

  function confirmReset() {
    Alert.alert(
      'Reset Database?',
      'This will delete ALL children, enrollments, messages and generated friends. Seeded friends and your login are kept.\n\nThis cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Reset', style: 'destructive', onPress: () => void doReset() },
      ],
    );
  }

  async function doReset() {
    setResetting(true);
    setResult(null);
    try {
      const res = await devApi.reset();
      const { deleted } = res.data;
      await AsyncStorage.clear();
      resetOnboardingStore();
      clearNotification();
      setUnreadCount(0);
      const msg = deleted ? `✅ ${deleted.children} children deleted` : '✅ Database reset started';
      setResult({ text: msg, color: '#2D7D46' });
      setTimeout(() => { setResetting(false); router.replace('/enroll' as never); }, 2000);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? String(err);
      setResult({ text: `❌ ${msg}`, color: '#C0392B' });
      setResetting(false);
    }
  }

  async function clearCache() {
    setClearing(true);
    setResult(null);
    try {
      await AsyncStorage.clear();
      resetOnboardingStore();
      clearNotification();
      setUnreadCount(0);
      setResult({ text: '✅ Cache cleared', color: '#2D7D46' });
      setTimeout(() => { setClearing(false); router.replace('/enroll' as never); }, 1000);
    } catch {
      setResult({ text: '❌ Clear failed', color: '#C0392B' });
      setClearing(false);
    }
  }

  const busy = resetting || clearing;

  return (
    <View style={s.container}>
      <View style={s.row}>
        <Text style={s.label}>🛠️ dev</Text>

        <TouchableOpacity style={s.pill} onPress={confirmReset} disabled={busy}>
          {resetting
            ? <ActivityIndicator size="small" color="#888780" />
            : <Text style={s.pillText}>🗑️ DB</Text>}
        </TouchableOpacity>

        <TouchableOpacity style={s.pill} onPress={() => void clearCache()} disabled={busy}>
          {clearing
            ? <ActivityIndicator size="small" color="#888780" />
            : <Text style={s.pillText}>🧹 Cache</Text>}
        </TouchableOpacity>
      </View>

      {result && (
        <Text style={[s.result, { color: result.color }]}>{result.text}</Text>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom:   20,
    left:     16,
    right:    16,
    zIndex:   999,
    alignItems: 'center',
    gap: 6,
  },
  row: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            8,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderWidth:    1,
    borderStyle:    'dashed',
    borderColor:    '#D3D1C7',
    borderRadius:   20,
    paddingVertical:  6,
    paddingHorizontal: 12,
  },
  label: {
    fontSize:   11,
    fontWeight: '700',
    color:      '#B4B2A9',
    marginRight: 2,
  },
  pill: {
    backgroundColor: '#F0EFF8',
    borderRadius:    99,
    paddingHorizontal: 10,
    paddingVertical:   5,
    minWidth: 44,
    alignItems: 'center',
  },
  pillText: {
    fontSize:   12,
    color:      '#888780',
    fontWeight: '600',
  },
  result: {
    fontSize:   11,
    fontWeight: '600',
    textAlign:  'center',
    backgroundColor: 'rgba(255,255,255,0.9)',
    paddingHorizontal: 10,
    paddingVertical:    4,
    borderRadius: 8,
  },
});
