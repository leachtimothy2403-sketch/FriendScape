import {
  View, Text, SafeAreaView, ScrollView,
  ActivityIndicator, StyleSheet,
} from 'react-native';
import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import { router } from 'expo-router';
import { Colors } from '@/constants/theme';
import api from '@/services/api';

interface MoodDay {
  date: string;
  mood: string;
  intensity: number;
  note: string;
}

const MOOD_EMOJI: Record<string, string> = {
  happy: '😊', excited: '🤩', curious: '🤔', funny: '😂',
  caring: '💛', neutral: '😐', lonely: '😶',
  sad: '😔', worried: '😟', angry: '😤',
};

const MOOD_COLOR: Record<string, string> = {
  excited: Colors.green, happy: Colors.green, funny: Colors.green, caring: Colors.green,
  curious: Colors.purple, neutral: Colors.gray[400],
  lonely: Colors.orange, sad: Colors.orange,
  worried: Colors.red, angry: Colors.red,
};

const MOOD_BG: Record<string, string> = {
  excited: '#E1F5EE', happy: '#E1F5EE', funny: '#E1F5EE', caring: '#E1F5EE',
  curious: '#EEEDFE', neutral: '#F5F5F5',
  lonely: '#FFF4E5', sad: '#FFF4E5',
  worried: '#FDEEE9', angry: '#FDEEE9',
};

export default function MoodScreen() {
  const { t } = useTranslation();
  const [moodHistory, setMoodHistory] = useState<MoodDay[]>([]);
  const [hasCrisisFlag, setCrisisFlag] = useState(false);
  const [loading, setLoading] = useState(true);
  const [childId, setChildId] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const [authToken, profileStr] = await AsyncStorage.multiGet(['authToken', 'childProfile']);
      if (!authToken[1]) { router.replace('/landing'); return; }
      let cid: string | null = null;
      try { cid = JSON.parse(profileStr[1] ?? '{}').childId ?? null; } catch {}
      if (!cid) { setLoading(false); return; }
      setChildId(cid);
      try {
        const res = await api.get(`/parent/mood/${cid}`, {
          headers: { Authorization: `Bearer ${authToken[1]}` },
        });
        setMoodHistory(res.data.moodHistory ?? []);
        setCrisisFlag(res.data.hasCrisisFlag ?? false);
      } catch {}
      setLoading(false);
    }
    void load();
  }, []);

  const week = moodHistory.slice(-7);

  if (loading) {
    return (
      <SafeAreaView style={s.screen}>
        <View style={s.header}><Text style={s.title}>{t('parent.mood.title')}</Text></View>
        <View style={s.center}><ActivityIndicator color={Colors.purple} size="large" /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.screen}>
      <View style={s.header}><Text style={s.title}>{t('parent.mood.title')}</Text></View>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {hasCrisisFlag && (
          <View style={s.crisisCard}>
            <Text style={s.crisisIcon}>🚨</Text>
            <View style={{ flex: 1 }}>
              <Text style={s.crisisTitle}>{t('parent.mood.crisisTitle')}</Text>
              <Text style={s.crisisDesc}>{t('parent.mood.crisisDesc')}</Text>
            </View>
          </View>
        )}

        {/* Last 7 days row */}
        <View style={s.sectionCard}>
          <Text style={s.sectionTitle}>{t('parent.mood.last7Days')}</Text>
          {week.length === 0 ? (
            <Text style={s.empty}>{t('parent.mood.empty')}</Text>
          ) : (
            <View style={s.weekRow}>
              {week.map((d) => (
                <View key={d.date} style={s.dayCol}>
                  <View style={[s.moodCircle, { backgroundColor: MOOD_BG[d.mood] ?? '#F5F5F5' }]}>
                    <Text style={s.moodEmoji}>{MOOD_EMOJI[d.mood] ?? '😐'}</Text>
                  </View>
                  <Text style={s.dayLabel}>
                    {new Date(d.date).toLocaleDateString('en', { weekday: 'narrow' })}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* 30-day breakdown */}
        {moodHistory.length > 0 && (
          <View style={s.sectionCard}>
            <Text style={s.sectionTitle}>{t('parent.mood.thirtyDayDetail')}</Text>
            {[...moodHistory].reverse().map((d) => (
              <View key={d.date} style={s.moodRow}>
                <Text style={s.moodRowEmoji}>{MOOD_EMOJI[d.mood] ?? '😐'}</Text>
                <View style={{ flex: 1 }}>
                  <View style={s.moodRowTop}>
                    <Text style={[s.moodName, { color: MOOD_COLOR[d.mood] ?? Colors.gray[600] }]}>
                      {d.mood.charAt(0).toUpperCase() + d.mood.slice(1)}
                    </Text>
                    <Text style={s.moodNote}>{d.note}</Text>
                  </View>
                  <View style={s.barTrack}>
                    <View style={[s.barFill, { width: `${Math.round(d.intensity * 100)}%` as `${number}%`, backgroundColor: MOOD_COLOR[d.mood] ?? Colors.gray[400] }]} />
                  </View>
                </View>
                <Text style={s.moodDate}>
                  {new Date(d.date).toLocaleDateString('en', { month: 'short', day: 'numeric' })}
                </Text>
              </View>
            ))}
          </View>
        )}

        {moodHistory.length === 0 && !loading && (
          <View style={s.center}>
            <Text style={{ fontSize: 40, marginBottom: 10 }}>😶</Text>
            <Text style={s.empty}>{t('parent.mood.empty')}</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.bg },
  header: {
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F0EFF8',
    paddingHorizontal: 16, paddingVertical: 14,
  },
  title: { fontSize: 17, fontWeight: '800', color: '#2C2C2A' },
  scroll: { padding: 14, paddingBottom: 40 },
  center: { alignItems: 'center', justifyContent: 'center', padding: 40 },
  empty: { fontSize: 13, color: Colors.gray[500], textAlign: 'center' },

  crisisCard: {
    flexDirection: 'row', gap: 10, backgroundColor: '#FDEEE9',
    borderRadius: 16, padding: 14, marginBottom: 14, alignItems: 'flex-start',
    borderWidth: 1, borderColor: Colors.red + '33',
  },
  crisisIcon: { fontSize: 22 },
  crisisTitle: { fontSize: 13, fontWeight: '700', color: Colors.red, marginBottom: 2 },
  crisisDesc: { fontSize: 11, color: Colors.red + 'AA', lineHeight: 16 },

  sectionCard: {
    backgroundColor: '#fff', borderRadius: 18, padding: 16, marginBottom: 14,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 2,
  },
  sectionTitle: { fontSize: 14, fontWeight: '800', color: '#2C2C2A', marginBottom: 14 },

  weekRow: { flexDirection: 'row', justifyContent: 'space-between' },
  dayCol: { alignItems: 'center', gap: 6 },
  moodCircle: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center',
  },
  moodEmoji: { fontSize: 22 },
  dayLabel: { fontSize: 10, color: Colors.gray[500], fontWeight: '600' },

  moodRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  moodRowEmoji: { fontSize: 22, width: 30, textAlign: 'center' },
  moodRowTop: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  moodName: { fontSize: 13, fontWeight: '700' },
  moodNote: { fontSize: 11, color: Colors.gray[500] },
  moodDate: { fontSize: 11, color: Colors.gray[400], flexShrink: 0 },
  barTrack: { height: 5, backgroundColor: Colors.gray[200], borderRadius: 99, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 99 },
});
