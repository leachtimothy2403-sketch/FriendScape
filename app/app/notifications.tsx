import {
  View, Text, SafeAreaView, FlatList, TouchableOpacity,
  ActivityIndicator, StyleSheet,
} from 'react-native';
import { useState, useEffect } from 'react';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { childNotifications, type NotificationItem } from '@/services/api';
import { useNotificationStore } from '@/store/notificationStore';
import { Colors } from '@/constants/theme';

function firstEmoji(str: string): string {
  return [...str][0] ?? '🌟';
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 2) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return 'Yesterday';
}

function typeLabel(type: NotificationItem['type']): string {
  if (type === 'dm') return 'sent you a message';
  if (type === 'comment') return 'commented on your post';
  return 'Badge earned!';
}

export default function NotificationsScreen() {
  const [items, setItems]     = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [token, setToken]     = useState<string | null>(null);
  const { decrementUnreadCount, setUnreadCount } = useNotificationStore();

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    const childToken = await AsyncStorage.getItem('childToken');
    setToken(childToken);
    if (!childToken) { setLoading(false); return; }
    try {
      const res = await childNotifications.get(childToken);
      setItems(res.data.notifications);
      setUnreadCount(0);
    } catch {
      // show empty state on error
    } finally {
      setLoading(false);
    }
  }

  async function handlePress(item: NotificationItem) {
    setItems((prev) => prev.filter((n) => n.id !== item.id));
    decrementUnreadCount();

    if (token) {
      try {
        await childNotifications.markRead(token, item.id);
      } catch {
        // silently fail marking as read
      }
    }

    if (item.type === 'dm' && item.friendId) {
      router.push(`/dm/${item.friendId}` as never);
    } else {
      router.push('/(tabs)/feed' as never);
    }
  }

  return (
    <SafeAreaView style={s.screen}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Text style={s.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={s.title}>Notifications</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color={Colors.purple} />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => handlePress(item)}
              style={[s.row, !item.read && s.rowUnread]}
              activeOpacity={0.7}
            >
              <View style={s.emojiCircle}>
                <Text style={s.emoji}>{firstEmoji(item.friendEmoji)}</Text>
              </View>
              <View style={s.body}>
                <View style={s.nameRow}>
                  <Text style={s.name}>{item.friendName}</Text>
                  <Text style={s.label}>{typeLabel(item.type)}</Text>
                </View>
                <Text style={s.preview} numberOfLines={2}>{item.preview}</Text>
              </View>
              <Text style={s.time}>{relativeTime(item.createdAt)}</Text>
            </TouchableOpacity>
          )}
          ItemSeparatorComponent={() => <View style={s.sep} />}
          ListEmptyComponent={
            <View style={s.center}>
              <Text style={s.emptyEmoji}>🔔</Text>
              <Text style={s.emptyText}>No notifications yet</Text>
              <Text style={s.emptyHint}>Activity from your friends will show up here</Text>
            </View>
          }
          contentContainerStyle={items.length === 0 ? s.emptyContainer : undefined}
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen:      { flex: 1, backgroundColor: Colors.bg },

  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                 paddingHorizontal: 16, paddingVertical: 12,
                 backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F0EFF8' },
  backBtn:     { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  backArrow:   { fontSize: 22, color: Colors.purple },
  title:       { fontSize: 17, fontWeight: '700', color: '#2C2C2A' },

  center:      { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyContainer: { flex: 1 },
  emptyEmoji:  { fontSize: 56, marginBottom: 12 },
  emptyText:   { fontSize: 17, fontWeight: '700', color: '#2C2C2A', marginBottom: 6 },
  emptyHint:   { fontSize: 14, color: '#B4B2A9', textAlign: 'center', paddingHorizontal: 40 },

  row:         { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 16, paddingVertical: 14,
                 backgroundColor: '#fff' },
  rowUnread:   { backgroundColor: '#F5F4FF' },
  sep:         { height: 1, backgroundColor: '#F0EFF8', marginLeft: 74 },

  emojiCircle: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#EEEDFE',
                 alignItems: 'center', justifyContent: 'center', marginRight: 12, flexShrink: 0 },
  emoji:       { fontSize: 24 },

  body:        { flex: 1, marginRight: 8 },
  nameRow:     { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', gap: 4, marginBottom: 3 },
  name:        { fontSize: 14, fontWeight: '700', color: '#2C2C2A' },
  label:       { fontSize: 12, color: '#888780' },
  preview:     { fontSize: 13, color: '#5A5856', lineHeight: 19 },

  time:        { fontSize: 11, color: '#B4B2A9', flexShrink: 0, marginTop: 2 },
});
