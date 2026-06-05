import {
  View, Text, TouchableOpacity, Alert,
  ActivityIndicator, StyleSheet,
} from 'react-native';
import { useState } from 'react';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { devApi } from '@/services/api';

export default function DevResetButton() {
  const [resetting, setResetting]   = useState(false);
  const [clearing, setClearing]     = useState(false);
  const [result, setResult]         = useState<{ text: string; color: string } | null>(null);

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
      setResult({
        text:  `✅ Reset complete — ${deleted.children} children deleted`,
        color: '#2D7D46',
      });
      setTimeout(() => {
        setResetting(false);
        router.replace('/enroll' as never);
      }, 2000);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? String(err);
      setResult({ text: `❌ Reset failed: ${msg}`, color: '#C0392B' });
      setResetting(false);
    }
  }

  async function clearCache() {
    setClearing(true);
    setResult(null);
    try {
      await AsyncStorage.clear();
      setResult({ text: '✅ Cache cleared', color: '#2D7D46' });
      setTimeout(() => {
        setClearing(false);
        router.replace('/enroll' as never);
      }, 1000);
    } catch {
      setResult({ text: '❌ Clear failed', color: '#C0392B' });
      setClearing(false);
    }
  }

  return (
    <View style={s.card}>
      <Text style={s.header}>🛠️ DEV TOOLS</Text>

      {resetting ? (
        <View style={s.loadingRow}>
          <ActivityIndicator size="small" color="#888780" />
          <Text style={s.loadingText}>Resetting...</Text>
        </View>
      ) : (
        <TouchableOpacity style={s.btn} onPress={confirmReset} disabled={clearing}>
          <Text style={s.btnText}>🗑️ Reset Database</Text>
        </TouchableOpacity>
      )}

      {clearing ? (
        <View style={s.loadingRow}>
          <ActivityIndicator size="small" color="#888780" />
          <Text style={s.loadingText}>Clearing cache...</Text>
        </View>
      ) : (
        <TouchableOpacity style={[s.btn, s.btnSecondary]} onPress={() => void clearCache()} disabled={resetting}>
          <Text style={s.btnText}>🧹 Clear App Cache</Text>
        </TouchableOpacity>
      )}

      {result && (
        <Text style={[s.result, { color: result.color }]}>{result.text}</Text>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    marginTop: 24,
    marginBottom: 20,
    marginHorizontal: 4,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#D3D1C7',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    gap: 10,
  },
  header: {
    fontSize: 11,
    fontWeight: '700',
    color: '#B4B2A9',
    letterSpacing: 1,
    marginBottom: 2,
  },
  btn: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#D3D1C7',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 9,
    alignItems: 'center',
    width: '100%',
  },
  btnSecondary: {
    backgroundColor: '#F8F7F5',
  },
  btnText: {
    fontSize: 13,
    color: '#888780',
    fontWeight: '600',
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 9,
  },
  loadingText: {
    fontSize: 13,
    color: '#888780',
  },
  result: {
    fontSize: 12,
    textAlign: 'center',
    fontWeight: '600',
  },
});
