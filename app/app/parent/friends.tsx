import {
  View, Text, SafeAreaView, FlatList, Image,
  ActivityIndicator, StyleSheet,
} from 'react-native';
import { useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import { router, useFocusEffect } from 'expo-router';
import { Colors } from '@/constants/theme';
import api from '@/services/api';

interface Friend {
  id: string;
  name: string;
  avatar_url: string | null;
  cover_emojis: string | null;
  is_teacher: boolean;
  friendship_level: number;
  friendship_xp: number;
  message_count: number;
  last_active: string | null;
}

const LEVEL_KEYS = ['', 'levelAcquaintance', 'levelFriend', 'levelGoodFriend', 'levelBestFriend', 'levelBFF'];

function FriendRow({ item }: { item: Friend }) {
  const { t, i18n } = useTranslation();
  return (
    <View style={s.card}>
      <View style={s.avatar}>
        {item.avatar_url ? (
          <Image source={{ uri: item.avatar_url }} style={s.avatarImg} />
        ) : (
          <Text style={s.avatarEmoji}>{(item.cover_emojis ?? '🤖').charAt(0)}</Text>
        )}
      </View>
      <View style={{ flex: 1 }}>
        <View style={s.nameRow}>
          <Text style={s.name}>{item.name}</Text>
          {item.is_teacher && (
            <View style={s.teacherBadge}>
              <Text style={s.teacherText}>{t('parent.friends.teacherBadge')}</Text>
            </View>
          )}
        </View>
        <View style={s.levelRow}>
          <View style={s.levelBadge}>
            <Text style={s.levelText}>Lv {item.friendship_level} · {t(`parent.friends.${LEVEL_KEYS[item.friendship_level] ?? 'levelFriend'}`)}</Text>
          </View>
        </View>
        <View style={s.statsRow}>
          <Text style={s.stat}>💬 {item.message_count} msgs</Text>
          {item.last_active && (
            <Text style={s.stat}>
              🕐 {new Date(item.last_active).toLocaleDateString(i18n.language, { month: 'short', day: 'numeric' })}
            </Text>
          )}
        </View>
        <View style={s.aiBadge}>
          <Text style={s.aiText}>{t('parent.friends.aiBadge')}</Text>
        </View>
      </View>
    </View>
  );
}

export default function FriendsScreen() {
  const { t, i18n } = useTranslation();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(true);
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
        const res = await api.get(`/parent/friends/${cid}`, {
          headers: { Authorization: `Bearer ${authToken[1]}` },
        });
        setFriends(res.data.friends ?? []);
      } catch {}
      setLoading(false);
    }
    void load();
  }, []));

  if (loading) {
    return (
      <SafeAreaView style={s.screen}>
        <View style={s.header}><Text style={s.title}>{t('parent.friends.title')}</Text></View>
        <View style={s.center}><ActivityIndicator color={Colors.purple} size="large" /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.screen}>
      <View style={s.header}>
        <Text style={s.title}>{t('parent.friends.title')}</Text>
        <Text style={s.subtitle}>{t('parent.friends.friendCount', { count: friends.length })}</Text>
      </View>

      {friends.length === 0 ? (
        <View style={s.center}>
          <Text style={{ fontSize: 40, marginBottom: 10 }}>👥</Text>
          <Text style={s.empty}>{t('parent.friends.empty')}</Text>
        </View>
      ) : (
        <FlatList
          data={friends}
          keyExtractor={(f) => f.id}
          renderItem={({ item }) => <FriendRow item={item} />}
          contentContainerStyle={s.list}
          showsVerticalScrollIndicator={false}
          ListFooterComponent={
            <View style={s.infoBox}>
              <Text style={s.infoTitle}>{t('parent.friends.infoTitle')}</Text>
              <Text style={s.infoText}>
                {t('parent.friends.infoText')}
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.bg },
  header: {
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F0EFF8',
    paddingHorizontal: 16, paddingVertical: 14, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'space-between',
  },
  title: { fontSize: 17, fontWeight: '800', color: '#2C2C2A' },
  subtitle: { fontSize: 12, color: Colors.gray[500] },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { fontSize: 14, color: Colors.gray[500] },
  list: { padding: 14, paddingBottom: 40 },
  card: {
    backgroundColor: '#fff', borderRadius: 18, padding: 14, marginBottom: 10,
    flexDirection: 'row', gap: 12, alignItems: 'flex-start',
    borderWidth: 1, borderColor: '#F0EFF8',
    shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 4, elevation: 1,
  },
  avatar: {
    width: 52, height: 52, borderRadius: 14,
    backgroundColor: Colors.purple + '18',
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden', flexShrink: 0,
  },
  avatarImg: { width: 52, height: 52 },
  avatarEmoji: { fontSize: 28 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' },
  name: { fontSize: 15, fontWeight: '700', color: '#2C2C2A' },
  teacherBadge: { backgroundColor: Colors.purple, borderRadius: 99, paddingHorizontal: 8, paddingVertical: 2 },
  teacherText: { fontSize: 10, color: '#fff', fontWeight: '700' },
  levelRow: { marginBottom: 6 },
  levelBadge: { backgroundColor: Colors.purple + '15', borderRadius: 99, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3 },
  levelText: { fontSize: 11, color: Colors.purple, fontWeight: '700' },
  statsRow: { flexDirection: 'row', gap: 12, marginBottom: 6 },
  stat: { fontSize: 11, color: Colors.gray[500] },
  aiBadge: { backgroundColor: Colors.gray[100], borderRadius: 99, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3 },
  aiText: { fontSize: 10, color: Colors.gray[500], fontWeight: '600' },
  infoBox: {
    backgroundColor: Colors.purple + '0D', borderRadius: 16, padding: 14,
    borderWidth: 1, borderColor: Colors.purple + '22', marginTop: 4,
  },
  infoTitle: { fontSize: 13, fontWeight: '700', color: Colors.purple, marginBottom: 4 },
  infoText: { fontSize: 12, color: Colors.gray[600], lineHeight: 18 },
});
