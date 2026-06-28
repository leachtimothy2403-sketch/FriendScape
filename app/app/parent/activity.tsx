import {
  View, Text, SafeAreaView, FlatList, TouchableOpacity,
  ActivityIndicator, StyleSheet,
} from 'react-native';
import { useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import { router, useFocusEffect } from 'expo-router';
import { Colors } from '@/constants/theme';
import api from '@/services/api';

interface TimelineEvent {
  type: string;
  timestamp: string;
  summary: string;
  icon: string;
}

const TYPE_COLORS: Record<string, string> = {
  post:     '#7F77DD',
  messages: '#60A5FA',
  badge:    '#F59E0B',
  friend:   '#5DCAA5',
};

const FILTERS = ['all', 'post', 'messages', 'badge', 'friend'] as const;

function fmt(iso: string, lang: string) {
  return new Date(iso).toLocaleDateString(lang, { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function ActivityScreen() {
  const { t, i18n } = useTranslation();
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');
  const [childId, setChildId] = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    async function load() {
      setLoading(true);
      const [authToken, profileStr] = await AsyncStorage.multiGet(['authToken', 'selectedChild']);
      if (!authToken[1]) { router.replace('/landing'); return; }
      let cid: string | null = null;
      try { cid = JSON.parse(profileStr[1] ?? '{}').childId ?? null; } catch {}
      if (!cid) { router.replace('/parent-children'); return; }
      setChildId(cid);

      try {
        const res = await api.get(`/parent/timeline/${cid}`, {
          headers: { Authorization: `Bearer ${authToken[1]}` },
        });
        setEvents(res.data.events ?? []);
      } catch {}
      setLoading(false);
    }
    void load();
  }, []));

  const visible = filter === 'all' ? events : events.filter((e) => e.type === filter);

  const renderItem = useCallback(({ item, index }: { item: TimelineEvent; index: number }) => (
    <View style={s.row}>
      <View style={[s.dot, { backgroundColor: TYPE_COLORS[item.type] ?? Colors.gray[300] }]}>
        <Text style={s.dotIcon}>{item.icon}</Text>
      </View>
      {index < visible.length - 1 && <View style={s.line} />}
      <View style={s.card}>
        <Text style={s.cardText} numberOfLines={3}>{item.summary}</Text>
        <Text style={s.cardTime}>{fmt(item.timestamp, i18n.language)}</Text>
      </View>
    </View>
  ), [visible.length]);

  const FILTER_LABELS: Record<string, string> = {
    all: t('parent.activity.filterAll'),
    post: t('parent.activity.filterPosts'),
    messages: t('parent.activity.filterMessages'),
    badge: t('parent.activity.filterBadges'),
    friend: t('parent.activity.filterFriends'),
  };

  if (loading) {
    return (
      <SafeAreaView style={s.screen}>
        <View style={s.header}><Text style={s.title}>{t('parent.activity.title')}</Text></View>
        <View style={s.center}><ActivityIndicator color={Colors.purple} size="large" /></View>
      </SafeAreaView>
    );
  }

  if (!childId) {
    return (
      <SafeAreaView style={s.screen}>
        <View style={s.header}><Text style={s.title}>{t('parent.activity.title')}</Text></View>
        <View style={s.center}>
          <Text style={s.empty}>{t('parent.noChildProfile')}</Text>
          <Text style={[s.empty, { fontSize: 12, marginTop: 4 }]}>{t('parent.noChildProfileDesc')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.screen}>
      <View style={s.header}>
        <Text style={s.title}>{t('parent.activity.title')}</Text>
      </View>

      <View style={s.filterBar}>
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={f}
            onPress={() => setFilter(f)}
            style={[s.filterChip, filter === f && s.filterChipActive]}
          >
            <Text style={[s.filterText, filter === f && s.filterTextActive]}>{FILTER_LABELS[f]}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {visible.length === 0 ? (
        <View style={s.center}>
          <Text style={s.emptyIcon}>📭</Text>
          <Text style={s.empty}>{t('parent.activity.empty')}</Text>
        </View>
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(_, i) => String(i)}
          renderItem={renderItem}
          contentContainerStyle={s.list}
          showsVerticalScrollIndicator={false}
        />
      )}
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  emptyIcon: { fontSize: 40, marginBottom: 10 },
  empty: { fontSize: 14, color: Colors.gray[500], textAlign: 'center' },
  filterBar: {
    flexDirection: 'row', gap: 6, paddingHorizontal: 14, paddingVertical: 10,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F5F5F5',
  },
  filterChip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 99,
    backgroundColor: Colors.gray[100],
  },
  filterChipActive: { backgroundColor: Colors.purple },
  filterText: { fontSize: 12, fontWeight: '600', color: Colors.gray[600] },
  filterTextActive: { color: '#fff' },
  list: { padding: 14, paddingBottom: 40 },
  row: { flexDirection: 'row', marginBottom: 16, alignItems: 'flex-start' },
  dot: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0, zIndex: 1,
  },
  dotIcon: { fontSize: 18 },
  line: {
    position: 'absolute', left: 19, top: 40, bottom: -16,
    width: 2, backgroundColor: '#F0EFF8',
  },
  card: {
    flex: 1, backgroundColor: '#fff', borderRadius: 16, padding: 12,
    marginLeft: 10, borderWidth: 1, borderColor: '#F0EFF8',
    shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 4, elevation: 1,
  },
  cardText: { fontSize: 13, color: '#2C2C2A', lineHeight: 18, marginBottom: 4 },
  cardTime: { fontSize: 11, color: Colors.gray[400] },
});
