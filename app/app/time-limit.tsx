import { View, Text, SafeAreaView, ScrollView, TouchableOpacity, Alert, StyleSheet } from 'react-native';
import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import { Colors } from '@/constants/theme';
import { childSession } from '@/services/api';

export default function TimeLimitScreen() {
  const { t } = useTranslation();
  const [childName, setChildName] = useState('');
  const [usedMinutes, setUsedMinutes] = useState<number | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const profile = await AsyncStorage.getItem('childProfile');
        if (profile) {
          const parsed = JSON.parse(profile) as { name?: string };
          if (parsed.name) setChildName(parsed.name);
        }
      } catch {}

      try {
        const token = await AsyncStorage.getItem('childToken');
        if (token) {
          const res = await childSession.status(token);
          setUsedMinutes(res.data.usedMinutes);
        }
      } catch {}
    }
    void load();
  }, []);

  useEffect(() => {
    async function endSession() {
      try {
        const token = await AsyncStorage.getItem('childToken');
        if (token) await childSession.end(token);
      } catch { /* non-fatal */ }
    }
    void endSession();
  }, []);

  function handleAskParent() {
    Alert.alert('', t('timeLimit.parentHint'), [{ text: t('timeLimit.ok') }]);
  }

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
        <View style={s.center}>
          <Text style={s.emoji}>⏰</Text>
          {childName ? <Text style={s.name}>{childName}</Text> : null}
          <Text style={s.title}>{t('timeLimit.title')}</Text>
          <Text style={s.message}>{t('timeLimit.message')}</Text>
          {usedMinutes !== null && (
            <Text style={s.used}>{t('timeLimit.usedMinutes', { count: usedMinutes })}</Text>
          )}
          <TouchableOpacity onPress={handleAskParent} style={s.askParentBtn} activeOpacity={0.6}>
            <Text style={s.askParentText}>{t('timeLimit.askParent')}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push('/parent-login')} style={s.parentLoginBtn} activeOpacity={0.5}>
            <Text style={s.parentLoginText}>{t('timeLimit.parentLogin')}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingVertical: 40,
  },
  emoji: {
    fontSize: 80,
    marginBottom: 24,
    textAlign: 'center',
  },
  name: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.purple,
    marginBottom: 8,
    textAlign: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: Colors.purple,
    textAlign: 'center',
    marginBottom: 16,
  },
  message: {
    fontSize: 16,
    color: '#555',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 12,
  },
  used: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    marginBottom: 40,
  },
  askParentBtn: {
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  askParentText: {
    fontSize: 13,
    color: Colors.gray[400],
    textDecorationLine: 'underline',
    textAlign: 'center',
  },
  parentLoginBtn: {
    marginTop: 16,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  parentLoginText: {
    fontSize: 12,
    color: Colors.gray[400],
    textAlign: 'center',
  },
});
