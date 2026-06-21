import {
  View, Text, SafeAreaView, FlatList, TouchableOpacity,
  ActivityIndicator, StyleSheet,
} from 'react-native';
import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import { router } from 'expo-router';
import { Colors } from '@/constants/theme';
import api from '@/services/api';

interface Alert {
  id: string;
  type: string;
  message: string;
  severity: 'info' | 'warning' | 'urgent';
  read: boolean;
  created_at: string;
}

const SEVERITY: Record<string, { bg: string; border: string; label: string; labelColor: string }> = {
  urgent:  { bg: '#FDEEE9', border: Colors.red + '44',    label: '🚨 Crisis',  labelColor: Colors.red },
  warning: { bg: '#FFF4E5', border: Colors.orange + '44', label: '⚠️ Warning', labelColor: Colors.orange },
  info:    { bg: '#EEEDFE', border: Colors.purple + '33', label: 'ℹ️ Info',    labelColor: Colors.purple },
};

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function AlertsScreen() {
  const { t } = useTranslation();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState<Set<string>>(new Set());
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [childId, setChildId] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const [tok, profileStr] = await AsyncStorage.multiGet(['authToken', 'childProfile']);
      if (!tok[1]) { router.replace('/landing'); return; }
      setAuthToken(tok[1]);
      let cid: string | null = null;
      try { cid = JSON.parse(profileStr[1] ?? '{}').childId ?? null; } catch {}
      if (!cid) { setLoading(false); return; }
      setChildId(cid);
      try {
        const res = await api.get(`/parent/alerts/${cid}`, {
          headers: { Authorization: `Bearer ${tok[1]}` },
        });
        setAlerts(res.data.alerts ?? []);
      } catch {}
      setLoading(false);
    }
    void load();
  }, []);

  const markRead = useCallback(async (id: string) => {
    if (!authToken) return;
    setMarking((prev) => new Set(prev).add(id));
    try {
      await api.patch(`/parent/alerts/${id}/read`, {}, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      setAlerts((prev) => prev.map((a) => a.id === id ? { ...a, read: true } : a));
    } catch {}
    setMarking((prev) => { const n = new Set(prev); n.delete(id); return n; });
  }, [authToken]);

  const unreadCount = alerts.filter((a) => !a.read).length;

  const renderItem = useCallback(({ item }: { item: Alert }) => {
    const style = SEVERITY[item.severity] ?? SEVERITY.info;
    return (
      <View style={[s.card, { backgroundColor: style.bg, borderColor: style.border }, item.read && s.cardRead]}>
        <View style={s.cardTop}>
          <Text style={[s.severityLabel, { color: style.labelColor }]}>{style.label}</Text>
          <Text style={s.typeTag}>{item.type}</Text>
          {item.read && <Text style={s.readTag}>{t('parent.alerts.read')}</Text>}
        </View>
        <Text style={s.message}>{item.message}</Text>
        <View style={s.cardBottom}>
          <Text style={s.time}>{fmt(item.created_at)}</Text>
          {!item.read && (
            <TouchableOpacity
              onPress={() => markRead(item.id)}
              disabled={marking.has(item.id)}
              style={s.markBtn}
            >
              <Text style={s.markBtnText}>{marking.has(item.id) ? '…' : t('parent.alerts.markRead')}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }, [markRead, marking, t]);

  if (loading) {
    return (
      <SafeAreaView style={s.screen}>
        <View style={s.header}><Text style={s.title}>{t('parent.alerts.title')}</Text></View>
        <View style={s.center}><ActivityIndicator color={Colors.purple} size="large" /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.screen}>
      <View style={s.header}>
        <Text style={s.title}>
          {t('parent.alerts.title')}{unreadCount > 0 ? ` (${unreadCount})` : ''}
        </Text>
      </View>

      {alerts.length === 0 ? (
        <View style={s.center}>
          <Text style={{ fontSize: 44, marginBottom: 12 }}>🌟</Text>
          <Text style={s.emptyTitle}>{t('parent.alerts.emptyTitle')}</Text>
          <Text style={s.emptyDesc}>{t('parent.alerts.emptyDesc')}</Text>
        </View>
      ) : (
        <FlatList
          data={alerts}
          keyExtractor={(a) => a.id}
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: '#2C2C2A', marginBottom: 6 },
  emptyDesc: { fontSize: 13, color: Colors.gray[500], textAlign: 'center' },
  list: { padding: 14, paddingBottom: 40 },
  card: {
    borderRadius: 18, padding: 14, marginBottom: 10,
    borderWidth: 1.5,
    shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 4, elevation: 1,
  },
  cardRead: { opacity: 0.65 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' },
  severityLabel: { fontSize: 12, fontWeight: '800' },
  typeTag: { fontSize: 11, color: Colors.gray[500] },
  readTag: { fontSize: 11, color: Colors.gray[400] },
  message: { fontSize: 14, color: '#2C2C2A', lineHeight: 20, marginBottom: 10 },
  cardBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  time: { fontSize: 11, color: Colors.gray[400] },
  markBtn: {
    backgroundColor: 'rgba(255,255,255,0.7)', borderRadius: 99,
    paddingHorizontal: 12, paddingVertical: 5,
  },
  markBtnText: { fontSize: 11, fontWeight: '700', color: Colors.gray[600] },
});
