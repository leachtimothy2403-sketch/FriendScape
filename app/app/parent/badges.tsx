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

interface Badge {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  xp_required: number | null;
  earned_at?: string;
}

function BadgeItem({ badge, earned, t }: { badge: Badge; earned: boolean; t: (key: string) => string }) {
  return (
    <View style={[s.badgeCard, !earned && s.badgeCardLocked]}>
      <Text style={[s.badgeIcon, !earned && { opacity: 0.4 }]}>{badge.icon}</Text>
      <View style={{ flex: 1 }}>
        <Text style={s.badgeName}>{badge.name}</Text>
        <Text style={s.badgeDesc} numberOfLines={2}>{badge.description}</Text>
        {earned && badge.earned_at ? (
          <View style={s.earnedRow}>
            <View style={s.greenDot} />
            <Text style={s.earnedText}>
              {new Date(badge.earned_at).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })}
            </Text>
          </View>
        ) : null}
      </View>
      {badge.xp_required && (
        <Text style={s.xp}>+{badge.xp_required} XP</Text>
      )}
    </View>
  );
}

export default function BadgesScreen() {
  const { t } = useTranslation();
  const [earned, setEarned] = useState<Badge[]>([]);
  const [locked, setLocked] = useState<Badge[]>([]);
  const [totalXp, setTotalXp] = useState(0);
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
        const res = await api.get(`/parent/badges/${cid}`, {
          headers: { Authorization: `Bearer ${authToken[1]}` },
        });
        setEarned(res.data.earned ?? []);
        setLocked(res.data.locked ?? []);
        setTotalXp(res.data.totalXp ?? 0);
      } catch {}
      setLoading(false);
    }
    void load();
  }, []);

  const total = earned.length + locked.length;
  const fraction = total > 0 ? earned.length / total : 0;

  if (loading) {
    return (
      <SafeAreaView style={s.screen}>
        <View style={s.header}><Text style={s.title}>{t('parent.badges.title')}</Text></View>
        <View style={s.center}><ActivityIndicator color={Colors.purple} size="large" /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.screen}>
      <View style={s.header}><Text style={s.title}>{t('parent.badges.title')}</Text></View>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* Stats row */}
        <View style={s.statsRow}>
          <View style={s.statCard}>
            <Text style={[s.statValue, { color: Colors.purple }]}>{earned.length}</Text>
            <Text style={s.statLabel}>{t('parent.badges.earned')}</Text>
          </View>
          <View style={s.statCard}>
            <Text style={[s.statValue, { color: Colors.gray[400] }]}>{locked.length}</Text>
            <Text style={s.statLabel}>{t('parent.badges.toEarn')}</Text>
          </View>
          <View style={s.statCard}>
            <Text style={[s.statValue, { color: '#F59E0B' }]}>⭐ {totalXp}</Text>
            <Text style={s.statLabel}>{t('parent.badges.totalXp')}</Text>
          </View>
        </View>

        {/* Progress bar */}
        {total > 0 && (
          <View style={s.progressCard}>
            <View style={s.progressTop}>
              <Text style={s.progressLabel}>{t('parent.badges.overallProgress')}</Text>
              <Text style={s.progressCount}>{earned.length}/{total}</Text>
            </View>
            <View style={s.barTrack}>
              <View style={[s.barFill, { width: `${Math.round(fraction * 100)}%` as `${number}%` }]} />
            </View>
          </View>
        )}

        {/* Earned */}
        {earned.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>{t('parent.badges.earnedSection')} ({earned.length})</Text>
            {earned.map((b) => <BadgeItem key={b.id} badge={b} earned t={t} />)}
          </View>
        )}

        {/* Locked */}
        {locked.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>{t('parent.badges.lockedSection')} ({locked.length})</Text>
            {locked.map((b) => <BadgeItem key={b.id} badge={b} earned={false} t={t} />)}
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 14, paddingBottom: 40 },

  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  statCard: {
    flex: 1, backgroundColor: '#fff', borderRadius: 16, padding: 14,
    alignItems: 'center', borderWidth: 1, borderColor: '#F0EFF8',
  },
  statValue: { fontSize: 20, fontWeight: '800', marginBottom: 2 },
  statLabel: { fontSize: 11, color: Colors.gray[500] },

  progressCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 14, marginBottom: 14,
    borderWidth: 1, borderColor: '#F0EFF8',
  },
  progressTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  progressLabel: { fontSize: 13, fontWeight: '700', color: '#2C2C2A' },
  progressCount: { fontSize: 13, fontWeight: '700', color: Colors.purple },
  barTrack: { height: 10, backgroundColor: Colors.gray[200], borderRadius: 99, overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: Colors.purple, borderRadius: 99 },

  section: { marginBottom: 16 },
  sectionTitle: { fontSize: 14, fontWeight: '800', color: '#2C2C2A', marginBottom: 10 },

  badgeCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 14, marginBottom: 8,
    flexDirection: 'row', gap: 12, alignItems: 'flex-start',
    borderWidth: 1, borderColor: '#F0EFF8',
    shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 4, elevation: 1,
  },
  badgeCardLocked: { opacity: 0.65 },
  badgeIcon: { fontSize: 34, width: 42, textAlign: 'center' },
  badgeName: { fontSize: 14, fontWeight: '700', color: '#2C2C2A', marginBottom: 2 },
  badgeDesc: { fontSize: 12, color: Colors.gray[500], lineHeight: 17, marginBottom: 6 },
  earnedRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  greenDot: { width: 7, height: 7, borderRadius: 99, backgroundColor: Colors.green },
  earnedText: { fontSize: 11, color: Colors.green, fontWeight: '600' },
  lockedText: { fontSize: 11, color: Colors.gray[400] },
  xp: { fontSize: 11, color: Colors.purple, fontWeight: '700', flexShrink: 0 },
});
