import {
  View, Text, SafeAreaView, ScrollView, TouchableOpacity,
  ActivityIndicator, StyleSheet,
} from 'react-native';
import { useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import { router, useFocusEffect } from 'expo-router';
import { Colors } from '@/constants/theme';
import { parent as parentApi, children as childrenApi } from '@/services/api';

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

interface ChildRecord {
  id: string;
  screen_time_limit_weekday_minutes: number | null;
  screen_time_limit_weekend_minutes: number | null;
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

function stepLimit(current: number | null, delta: number): number | null {
  if (current === null) return delta > 0 ? 15 : null;
  const next = current + delta;
  if (next < 15) return null;
  if (next > 480) return 480;
  return next;
}

function ScreenTimeLimitsSection({
  childId,
  initialWeekday,
  initialWeekend,
}: {
  childId: string;
  initialWeekday: number | null;
  initialWeekend: number | null;
}) {
  const { t } = useTranslation();
  const [weekday, setWeekday] = useState<number | null>(initialWeekday);
  const [weekend, setWeekend] = useState<number | null>(initialWeekend);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');
  const [givingMore, setGivingMore] = useState(false);
  const [gaveMoreMsg, setGaveMoreMsg] = useState('');

  const day = new Date().getDay();
  const isWeekend = day === 0 || day === 6;
  const todayLimit = isWeekend ? weekend : weekday;
  const showGiveMore = todayLimit !== null;

  async function handleSave() {
    setSaving(true);
    setSavedMsg('');
    try {
      await parentApi.updateChildScreenTime(childId, {
        weekdayLimitMinutes: weekday,
        weekendLimitMinutes: weekend,
      });
      setSavedMsg(t('parent.overview.screenTime.saved'));
      setTimeout(() => setSavedMsg(''), 2500);
    } catch {}
    setSaving(false);
  }

  async function handleGiveMore() {
    setGivingMore(true);
    setGaveMoreMsg('');
    try {
      await parentApi.updateChildScreenTime(childId, { extensionMinutes: 5 });
      setGaveMoreMsg(t('parent.overview.screenTime.done'));
      setTimeout(() => setGaveMoreMsg(''), 2500);
    } catch {}
    setGivingMore(false);
  }

  function LimitRow({ label, value, onChange }: { label: string; value: number | null; onChange: (v: number | null) => void }) {
    return (
      <View style={ls.limitRow}>
        <Text style={ls.limitLabel}>{label}</Text>
        <View style={ls.stepper}>
          <TouchableOpacity style={ls.stepBtn} onPress={() => onChange(stepLimit(value, -15))} activeOpacity={0.7}>
            <Text style={ls.stepBtnText}>−</Text>
          </TouchableOpacity>
          <Text style={ls.stepValue}>
            {value === null ? t('parent.overview.screenTime.noLimit') : `${value} min`}
          </Text>
          <TouchableOpacity style={ls.stepBtn} onPress={() => onChange(stepLimit(value, 15))} activeOpacity={0.7}>
            <Text style={ls.stepBtnText}>+</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[s.card, s.fullCard, { alignItems: 'stretch' }]}>
      <Text style={ls.sectionTitle}>{t('parent.overview.screenTime.title')}</Text>

      <LimitRow
        label={t('parent.overview.screenTime.weekdays')}
        value={weekday}
        onChange={setWeekday}
      />
      <LimitRow
        label={t('parent.overview.screenTime.weekends')}
        value={weekend}
        onChange={setWeekend}
      />

      <View style={ls.saveRow}>
        <TouchableOpacity
          style={ls.saveBtn}
          onPress={() => void handleSave()}
          disabled={saving}
          activeOpacity={0.8}
        >
          {saving
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={ls.saveBtnText}>{t('parent.overview.screenTime.save')}</Text>
          }
        </TouchableOpacity>
        {savedMsg ? <Text style={ls.confirmText}>{savedMsg}</Text> : null}
      </View>

      {showGiveMore && (
        <View style={ls.giveMoreRow}>
          <TouchableOpacity
            style={ls.giveMoreBtn}
            onPress={() => void handleGiveMore()}
            disabled={givingMore}
            activeOpacity={0.8}
          >
            {givingMore
              ? <ActivityIndicator color={Colors.purple} size="small" />
              : <Text style={ls.giveMoreText}>{t('parent.overview.screenTime.giveMore')}</Text>
            }
          </TouchableOpacity>
          {gaveMoreMsg ? <Text style={ls.confirmText}>{gaveMoreMsg}</Text> : null}
        </View>
      )}
    </View>
  );
}

export default function OverviewScreen() {
  const { t } = useTranslation();
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(false);
  const [stats, setStats]       = useState<Stats | null>(null);
  const [alertsData, setAlertsData] = useState<AlertsData | null>(null);
  const [friendCount, setFriendCount] = useState<number>(0);
  const [childId, setChildId]   = useState<string | null>(null);
  const [childRecord, setChildRecord] = useState<ChildRecord | null>(null);

  useFocusEffect(useCallback(() => {
    async function load() {
      setLoading(true);
      setError(false);
      const [authPair, childPair] = await AsyncStorage.multiGet(['authToken', 'selectedChild']);
      if (!authPair[1]) { router.replace('/landing'); return; }
      let cid: string | null = null;
      try { cid = JSON.parse(childPair[1] ?? '{}').childId ?? null; } catch {}
      if (!cid) { router.replace('/parent-children'); return; }

      setChildId(cid);

      try {
        const [statsRes, alertsRes, friendsRes, childRes] = await Promise.all([
          parentApi.childStats(cid),
          parentApi.childAlerts(cid),
          parentApi.friends(cid),
          childrenApi.get(cid),
        ]);
        setStats(statsRes.data as Stats);
        setAlertsData(alertsRes.data as AlertsData);
        const friends = (friendsRes.data as { friends?: unknown[] }).friends ?? [];
        setFriendCount(friends.length);
        const rec = (childRes.data as { child: ChildRecord }).child;
        setChildRecord(rec);
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

        {/* Screen Time Limits */}
        {childId && (
          <ScreenTimeLimitsSection
            childId={childId}
            initialWeekday={childRecord?.screen_time_limit_weekday_minutes ?? null}
            initialWeekend={childRecord?.screen_time_limit_weekend_minutes ?? null}
          />
        )}

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

const ls = StyleSheet.create({
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#2C2C2A',
    marginBottom: 14,
    alignSelf: 'flex-start',
  },
  limitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  limitLabel: {
    fontSize: 14,
    color: '#2C2C2A',
    fontWeight: '600',
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stepBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#EEEDFE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnText: {
    fontSize: 18,
    color: Colors.purple,
    fontWeight: '700',
    lineHeight: 22,
  },
  stepValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2C2C2A',
    minWidth: 60,
    textAlign: 'center',
  },
  saveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 4,
    marginBottom: 2,
  },
  saveBtn: {
    backgroundColor: Colors.purple,
    borderRadius: 99,
    paddingHorizontal: 20,
    paddingVertical: 10,
    alignItems: 'center',
    minWidth: 110,
  },
  saveBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
  confirmText: {
    fontSize: 13,
    color: Colors.purple,
    fontWeight: '700',
  },
  giveMoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 10,
  },
  giveMoreBtn: {
    borderWidth: 1.5,
    borderColor: Colors.purple,
    borderRadius: 99,
    paddingHorizontal: 16,
    paddingVertical: 9,
    alignItems: 'center',
  },
  giveMoreText: {
    fontSize: 13,
    color: Colors.purple,
    fontWeight: '600',
  },
});
