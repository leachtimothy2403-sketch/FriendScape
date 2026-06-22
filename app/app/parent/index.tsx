import {
  View, Text, SafeAreaView, ScrollView, TouchableOpacity,
  ActivityIndicator, StyleSheet,
} from 'react-native';
import { useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import { router, useFocusEffect } from 'expo-router';
import { Colors } from '@/constants/theme';
import { parent as parentApi } from '@/services/api';

const MOOD_EMOJI: Record<string, string> = {
  happy:    '😊',
  sad:      '😢',
  excited:  '🎉',
  worried:  '😟',
  angry:    '😠',
  neutral:  '😐',
};

interface Stats {
  totalPosts: number;
  totalMessages: number;
  topMoodThisWeek: string;
  messagesToday: number;
  screenTimeToday: number;
  screenTimeWeeklyAvg: number;
}

interface AlertsData {
  alerts: { id: string; type: string; message: string; severity: string; read: boolean; created_at: string }[];
  unreadCount: number;
}

function StatCard({
  emoji, value, subtitle, onPress, accent,
}: {
  emoji: string;
  value: string;
  subtitle: string;
  onPress?: () => void;
  accent?: boolean;
}) {
  const inner = (
    <View style={[s.card, accent && s.cardAccent]}>
      <Text style={s.cardEmoji}>{emoji}</Text>
      <Text style={[s.cardValue, accent && s.cardValueAccent]}>{value}</Text>
      <Text style={[s.cardSub, accent && s.cardSubAccent]}>{subtitle}</Text>
    </View>
  );
  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={s.halfCell}>
        {inner}
      </TouchableOpacity>
    );
  }
  return <View style={s.halfCell}>{inner}</View>;
}

export default function OverviewScreen() {
  const { t } = useTranslation();
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(false);
  const [stats, setStats]       = useState<Stats | null>(null);
  const [alertsData, setAlertsData] = useState<AlertsData | null>(null);
  const [friendCount, setFriendCount] = useState<number>(0);

  useFocusEffect(useCallback(() => {
    async function load() {
      setLoading(true);
      setError(false);
      const [authPair, childPair] = await AsyncStorage.multiGet(['authToken', 'selectedChild']);
      if (!authPair[1]) { router.replace('/landing'); return; }
      let cid: string | null = null;
      try { cid = JSON.parse(childPair[1] ?? '{}').childId ?? null; } catch {}
      if (!cid) { router.replace('/parent-children'); return; }

      try {
        const [statsRes, alertsRes, friendsRes] = await Promise.all([
          parentApi.childStats(cid),
          parentApi.childAlerts(cid),
          parentApi.friends(cid),
        ]);
        setStats(statsRes.data as Stats);
        setAlertsData(alertsRes.data as AlertsData);
        const friends = (friendsRes.data as { friends?: unknown[] }).friends ?? [];
        setFriendCount(friends.length);
      } catch {
        setError(true);
      }
      setLoading(false);
    }
    void load();
  }, []));

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-bg">
        <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
          <View style={s.center}><ActivityIndicator color={Colors.purple} size="large" /></View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (error || !stats) {
    return (
      <SafeAreaView className="flex-1 bg-bg">
        <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
          <View style={s.center}>
            <Text style={s.errorText}>{t('common.error')}</Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  const moodEmoji  = MOOD_EMOJI[stats.topMoodThisWeek] ?? '😐';
  const unread = (alertsData?.alerts ?? []).filter((a: { read: boolean }) => !a.read).length;

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 16, paddingBottom: 40 }}>

        {/* Mood — full-width prominent card */}
        <View style={[s.card, s.cardAccent, s.fullCard]}>
          <Text style={{ fontSize: 56, textAlign: 'center', marginBottom: 8 }}>{moodEmoji}</Text>
          <Text style={[s.cardValue, s.cardValueAccent, { fontSize: 18 }]}>
            {stats.topMoodThisWeek
              ? stats.topMoodThisWeek.charAt(0).toUpperCase() + stats.topMoodThisWeek.slice(1)
              : t('parent.overview.unknown')}
          </Text>
          <Text style={[s.cardSub, s.cardSubAccent]}>{t('parent.overview.moodSub')}</Text>
        </View>

        {/* 2-column grid */}
        <View style={s.row}>
          <StatCard
            emoji="⏱️"
            value={stats.screenTimeToday > 0 ? `${stats.screenTimeToday} min` : t('parent.overview.none')}
            subtitle={t('parent.overview.screenToday')}
          />
          <StatCard
            emoji="📊"
            value={`${stats.screenTimeWeeklyAvg} min`}
            subtitle={t('parent.overview.screenAvg')}
          />
        </View>

        <View style={s.row}>
          <StatCard
            emoji="💬"
            value={String(stats.messagesToday)}
            subtitle={t('parent.overview.messagesToday')}
          />
          <StatCard
            emoji="👥"
            value={String(friendCount)}
            subtitle={t('parent.overview.friends')}
          />
        </View>

        <View style={s.row}>
          <StatCard
            emoji="🔔"
            value={String(unread)}
            subtitle={t('parent.overview.alerts')}
            onPress={() => router.push('/parent/alerts')}
          />
          {/* spacer for alignment */}
          <View style={s.halfCell} />
        </View>

        {/* Total activity — full-width */}
        <View style={[s.card, s.fullCard]}>
          <Text style={s.cardEmoji}>📈</Text>
          <Text style={s.cardValue}>{`${stats.totalPosts} posts · ${stats.totalMessages} messages`}</Text>
          <Text style={s.cardSub}>{t('parent.overview.allTime')}</Text>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  center:  { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorText: { fontSize: 14, color: Colors.gray[500], textAlign: 'center' },

  row:     { flexDirection: 'row', gap: 12, marginBottom: 12 },
  halfCell: { flex: 1 },

  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
    marginBottom: 0,
  },
  cardAccent: {
    backgroundColor: '#7F77DD',
  },
  fullCard: {
    marginBottom: 12,
  },
  cardEmoji:  { fontSize: 28, marginBottom: 6 },
  cardValue:  { fontSize: 20, fontWeight: '800', color: '#2C2C2A', marginBottom: 2 },
  cardValueAccent: { color: '#fff' },
  cardSub:    { fontSize: 12, color: Colors.gray[500], textAlign: 'center' },
  cardSubAccent:   { color: 'rgba(255,255,255,0.8)' },
});
