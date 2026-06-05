import {
  View, Text, SafeAreaView, ScrollView, FlatList, TouchableOpacity,
  Modal, TextInput, RefreshControl, ActivityIndicator, Animated,
  AppState, AppStateStatus, StyleSheet, Platform,
} from 'react-native';
import { useState, useEffect, useRef, useCallback } from 'react';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import { childAuth, childPosts, childSession } from '@/services/api';
import { useOnboardingStore } from '@/store/onboardingStore';
import { Colors, Mascots } from '@/constants/theme';
import AudioPlayer from '@/components/AudioPlayer';
import { requestPermission } from '@/utils/webNotifications';

interface PostComment {
  authorName:  string;
  authorEmoji: string;
  content:     string;
  createdAt:   string;
}

interface FeedPost {
  id: string;
  author_id: string;
  author_type: 'child' | 'ai';
  content: string;
  mood: string | null;
  scene_emojis: string | null;
  created_at: string;
  friend_name: string | null;
  friend_cover_emojis: string | null;
  reactions: Record<string, number>;
  comments: PostComment[];
}

const THEME_EMOJI: Record<string, string> = {
  animals: '🐻',
  space:   '🚀',
  fantasy: '🧚',
  ocean:   '🐬',
  jungle:  '🦁',
};

const FRIEND_BG: Record<string, string> = {
  Mia:  '#EEEDFE',
  Jake: '#E1F5EE',
  Zara: '#FAECE7',
};

const FRIEND_TINT: Record<string, string> = {
  Mia:  '#F0EFFF',
  Jake: '#E8F9F3',
  Zara: '#FFF0EB',
};

const MOOD_EMOJIS  = ['😊', '😄', '😔', '😴', '🤩', '😂'];
const REACT_EMOJIS = ['💛', '😂', '🤩'];

function firstEmoji(str: string | null | undefined): string {
  if (!str) return '🌟';
  return [...str][0] ?? '🌟';
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 2) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  if (hrs < 48) return 'Yesterday';
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function FeedScreen() {
  const { t } = useTranslation();
  const [posts, setPosts]             = useState<FeedPost[]>([]);
  const [loading, setLoading]         = useState(true);
  const [refreshing, setRefreshing]   = useState(false);
  const [reloading, setReloading]     = useState(false);
  const [childToken, setChildToken]   = useState<string | null>(null);
  const [showNewPost, setShowNewPost] = useState(false);
  const [newPostText, setNewPostText] = useState('');
  const [newPostMood, setNewPostMood] = useState('');
  const [posting, setPosting]         = useState(false);

  const childTokenRef = useRef<string | null>(null);
  const refreshTimer  = useRef<ReturnType<typeof setInterval> | null>(null);

  const avatarTheme = useOnboardingStore((s) => s.avatarTheme);
  const mascotId    = useOnboardingStore((s) => s.mascotId);
  const resetStore  = useOnboardingStore((s) => s.resetStore);

  const avatarEmoji = THEME_EMOJI[avatarTheme] || '🐻';
  const mascotEmoji = Mascots[mascotId]?.emoji  || '🌟';

  useEffect(() => {
    let cancelled = false;

    async function init() {
      const id    = await AsyncStorage.getItem('childId');
      let   token = await AsyncStorage.getItem('childToken');

      console.log('[feed] childId:', id);
      console.log('[feed] token:', token ? 'exists' : 'missing');

      if (!token && id) {
        try {
          const res = await childAuth.login(id);
          token = res.data.token;
          await AsyncStorage.setItem('childToken', token);
        } catch (e) {
          console.error('[feed] child-login failed:', e);
        }
      }

      if (!cancelled && token) {
        childTokenRef.current = token;
        setChildToken(token);
        childSession.start(token).catch(() => {});
        console.log('[feed] generating posts...');
        await loadFeed(token, true);
      }

      if (!cancelled) setLoading(false);

      if (Platform.OS === 'web') {
        void requestPermission();
      }
    }

    void init();
    return () => { cancelled = true; };
  }, []);

  // End session when app goes to background
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if ((state === 'background' || state === 'inactive') && childTokenRef.current) {
        childSession.end(childTokenRef.current).catch(() => {});
      }
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (posts.length === 0 && childToken && !loading) {
      refreshTimer.current = setInterval(() => {
        if (childTokenRef.current) void loadFeed(childTokenRef.current, true);
      }, 10000);
    } else if (refreshTimer.current) {
      clearInterval(refreshTimer.current);
      refreshTimer.current = null;
    }
    return () => {
      if (refreshTimer.current) { clearInterval(refreshTimer.current); refreshTimer.current = null; }
    };
  }, [posts.length, childToken, loading]);

  async function loadFeed(token: string, silent = false) {
    if (!silent) setLoading(true);
    try {
      await childPosts.generateDaily(token).catch(() => {});
      const res = await childPosts.feed(token);
      const loaded = res.data.posts as FeedPost[];
      console.log('[feed] posts loaded:', loaded.length);
      setPosts(loaded);
    } catch (e) {
      console.error('[feed] loadFeed error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function hardRefresh() {
    const token = childTokenRef.current;
    if (!token || reloading) return;
    setReloading(true);
    try {
      await childPosts.generateDaily(token, true).catch(() => {});
      const res = await childPosts.feed(token);
      setPosts(res.data.posts as FeedPost[]);
    } catch (e) {
      console.error('[feed] hardRefresh error:', e);
    } finally {
      setReloading(false);
    }
  }

  async function devReset() {
    await AsyncStorage.multiRemove(['childId', 'childToken', 'parentEmail', 'onboardingComplete', 'pendingParentEmail', 'childProfile']);
    resetStore();
    router.replace('/enroll' as never);
  }

  const onRefresh = useCallback(() => {
    if (!childToken) return;
    setRefreshing(true);
    void loadFeed(childToken, true);
  }, [childToken]);

  async function submitPost() {
    if (!childToken || !newPostText.trim() || posting) return;
    setPosting(true);
    try {
      await childPosts.create(childToken, {
        content: newPostText.trim(),
        mood: newPostMood || undefined,
      });
      setShowNewPost(false);
      setNewPostText('');
      setNewPostMood('');
      void loadFeed(childToken, true);
    } catch (e) {
      console.error('[feed] createPost error:', e);
    } finally {
      setPosting(false);
    }
  }

  async function handleReact(postId: string, emoji: string) {
    if (!childToken) return;
    setPosts((prev) =>
      prev.map((p) =>
        p.id === postId
          ? { ...p, reactions: { ...p.reactions, [emoji]: (p.reactions[emoji] ?? 0) + 1 } }
          : p,
      ),
    );
    try {
      const res = await childPosts.react(childToken, postId, emoji);
      setPosts((prev) =>
        prev.map((p) => (p.id === postId ? { ...p, reactions: res.data.reactions } : p)),
      );
    } catch {
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId
            ? { ...p, reactions: { ...p.reactions, [emoji]: Math.max(0, (p.reactions[emoji] ?? 1) - 1) } }
            : p,
        ),
      );
    }
  }

  const storyFriends = posts
    .filter((p) => p.author_type === 'ai' && p.friend_name)
    .reduce<{ id: string; name: string; emojis: string }[]>((acc, p) => {
      if (!acc.find((f) => f.id === p.author_id)) {
        acc.push({ id: p.author_id, name: p.friend_name!, emojis: p.friend_cover_emojis ?? '🌟' });
      }
      return acc;
    }, []);

  const renderPost = useCallback(
    ({ item }: { item: FeedPost }) => (
      <PostCard
        post={item}
        avatarEmoji={avatarEmoji}
        onReact={(emoji) => void handleReact(item.id, emoji)}
        onReply={() => router.push(`/dm/${item.author_id}` as never)}
        t={t}
      />
    ),
    [avatarEmoji, childToken, t],
  );

  return (
    <SafeAreaView style={s.screen}>
      {/* ── Top bar ── */}
      <View style={s.topBar}>
        <View style={{ flexDirection: 'row' }}>
          <Text style={s.logoFriend}>Mi</Text>
          <Text style={s.logoScape}>go</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          {__DEV__ && (
            <TouchableOpacity onPress={() => void devReset()} style={s.devResetBtn}>
              <Text style={s.devResetText}>🔄 Reset</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={() => void hardRefresh()} disabled={reloading}>
            {reloading
              ? <ActivityIndicator size="small" color={Colors.purple} />
              : <Text style={s.refreshIcon}>🔄</Text>
            }
          </TouchableOpacity>
          <View>
            <Text style={{ fontSize: 22 }}>🔔</Text>
            <View style={s.redDot} />
          </View>
          <View style={s.avatarCircle}>
            <Text style={{ fontSize: 20 }}>{avatarEmoji}</Text>
          </View>
        </View>
      </View>

      {loading ? (
        <SkeletonFeed />
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(item) => item.id}
          renderItem={renderPost}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.purple} />
          }
          ListHeaderComponent={
            <View>
              {storyFriends.length > 0 && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ paddingLeft: 14, paddingRight: 6, paddingVertical: 14 }}
                >
                  {storyFriends.map((f) => (
                    <TouchableOpacity
                      key={f.id}
                      onPress={() => router.push(`/friend/${f.id}` as never)}
                      style={{ alignItems: 'center', marginRight: 14 }}
                    >
                      <View style={s.storyRingOuter}>
                        <View style={s.storyRingInner}>
                          <Text style={{ fontSize: 28 }}>{firstEmoji(f.emojis)}</Text>
                        </View>
                      </View>
                      <Text style={s.storyName}>{f.name}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}

              <View style={{ paddingHorizontal: 14, paddingBottom: 8 }}>
                <TouchableOpacity
                  onPress={() => setShowNewPost(true)}
                  style={s.newPostPill}
                >
                  <Text style={s.newPostText}>{t('feed.newPost')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          }
          ListEmptyComponent={
            <View style={s.emptyState}>
              <Text style={{ fontSize: 72, marginBottom: 16 }}>{mascotEmoji}</Text>
              <Text style={s.emptyText}>{t('feed.emptyTitle')}</Text>
              <ActivityIndicator color={Colors.purple} size="large" />
            </View>
          }
        />
      )}

      {/* ── New Post Modal ── */}
      <Modal visible={showNewPost} transparent animationType="slide">
        <View style={s.modalOverlay}>
          <View style={s.modalSheet}>
            <Text style={s.modalTitle}>New post</Text>

            <TextInput
              multiline
              placeholder={t('feed.postPlaceholder')}
              placeholderTextColor="#B4B2A9"
              value={newPostText}
              onChangeText={setNewPostText}
              style={s.postInput}
            />

            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 20 }}>
              {MOOD_EMOJIS.map((e) => (
                <TouchableOpacity
                  key={e}
                  onPress={() => setNewPostMood(e === newPostMood ? '' : e)}
                  style={[
                    s.moodChip,
                    newPostMood === e && { borderWidth: 2, borderColor: Colors.purple, backgroundColor: Colors.purple + '18' },
                  ]}
                >
                  <Text style={{ fontSize: 22 }}>{e}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              onPress={() => void submitPost()}
              disabled={!newPostText.trim() || posting}
              style={[s.postBtn, (!newPostText.trim() || posting) && { backgroundColor: '#C8C6E8' }]}
            >
              {posting
                ? <ActivityIndicator color="#fff" />
                : <Text style={s.postBtnText}>Post</Text>
              }
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => { setShowNewPost(false); setNewPostText(''); setNewPostMood(''); }}
              style={{ alignItems: 'center', paddingVertical: 12 }}
            >
              <Text style={{ color: '#888', fontSize: 15 }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function PostCard({
  post, avatarEmoji, onReact, onReply, t,
}: {
  post: FeedPost;
  avatarEmoji: string;
  onReact: (emoji: string) => void;
  onReply: () => void;
  t: (key: string) => string;
}) {
  const isOwn      = post.author_type === 'child';
  const name       = isOwn ? t('feed.you') : (post.friend_name ?? 'Friend');
  const friendBg   = isOwn ? '#E1F5EE' : (FRIEND_BG[name]   ?? '#EEEDFE');
  const friendTint = isOwn ? '#E1F5EE' : (FRIEND_TINT[name] ?? '#F0EFFF');
  const emoji      = isOwn ? avatarEmoji : firstEmoji(post.friend_cover_emojis);
  const sceneChars = post.scene_emojis ? [...post.scene_emojis] : [];

  return (
    <View style={s.card}>
      <View style={s.cardHeader}>
        <View style={[s.friendAvatar, { backgroundColor: friendBg }]}>
          <Text style={{ fontSize: 24 }}>{emoji}</Text>
        </View>

        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={s.friendName}>{name}</Text>
            {!isOwn && (
              <View style={s.badgePurple}>
                <Text style={s.badgePurpleText}>{t('feed.aiFriend')}</Text>
              </View>
            )}
          </View>
          <Text style={s.postTime}>{relativeTime(post.created_at)}</Text>
        </View>

        {/* AudioPlayer replaces static speaker button for AI posts */}
        {!isOwn && post.friend_name ? (
          <AudioPlayer
            text={post.content}
            characterId={post.friend_name}
            messageId={post.id}
            size="sm"
          />
        ) : (
          <View style={s.speakerBtn} />
        )}
      </View>

      {!isOwn && sceneChars.length > 0 && (
        <View style={[s.sceneStrip, { backgroundColor: friendTint }]}>
          {sceneChars.slice(0, 5).map((ch, i) => (
            <Text key={i} style={{ fontSize: 52 }}>{ch}</Text>
          ))}
        </View>
      )}

      <Text style={s.postContent}>{post.content}</Text>

      {post.comments && post.comments.length > 0 && (
        <View style={s.commentsSection}>
          {post.comments.slice(0, 2).map((c, i) => (
            <View key={i} style={s.commentRow}>
              <View style={s.commentAvatar}>
                <Text style={{ fontSize: 13 }}>{c.authorEmoji}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.commentName}>{c.authorName}</Text>
                <Text style={s.commentText}>{c.content}</Text>
              </View>
              <Text style={s.commentTime}>{relativeTime(c.createdAt)}</Text>
            </View>
          ))}
          {post.comments.length > 2 && (
            <Text style={s.commentMore}>+{post.comments.length - 2} more</Text>
          )}
        </View>
      )}

      <View style={s.reactRow}>
        <View style={{ flexDirection: 'row', gap: 4 }}>
          {REACT_EMOJIS.map((em) => {
            const count = post.reactions[em] ?? 0;
            return (
              <TouchableOpacity
                key={em}
                onPress={() => onReact(em)}
                style={[s.reactBtn, count > 0 && { backgroundColor: Colors.purple + '18' }]}
              >
                <Text style={{ fontSize: 18 }}>{em}</Text>
                {count > 0 && <Text style={s.reactCount}>{count}</Text>}
              </TouchableOpacity>
            );
          })}
        </View>

        {!isOwn && (
          <TouchableOpacity onPress={onReply} style={s.replyBtn}>
            <Text style={{ fontSize: 14 }}>🎤</Text>
            <Text style={s.replyBtnText}>{t('feed.replyButton')}</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

function SkeletonCard() {
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1,   duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 700, useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, []);

  return (
    <Animated.View style={[s.card, { opacity, height: 180, overflow: 'hidden' }]}>
      <View style={{ flex: 1, backgroundColor: '#E8E6FF', borderRadius: 18 }} />
    </Animated.View>
  );
}

function SkeletonFeed() {
  return <View><SkeletonCard /><SkeletonCard /><SkeletonCard /></View>;
}

const s = StyleSheet.create({
  screen:        { flex: 1, backgroundColor: Colors.bg },

  topBar:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                   paddingHorizontal: 16, paddingVertical: 12,
                   backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F0EFF8' },
  logoFriend:    { fontSize: 20, fontWeight: '700', color: '#2C2C2A' },
  logoScape:     { fontSize: 20, fontWeight: '700', color: Colors.purple },
  redDot:        { position: 'absolute', top: -2, right: -2, width: 8, height: 8,
                   borderRadius: 4, backgroundColor: Colors.red },
  avatarCircle:  { width: 36, height: 36, borderRadius: 18, backgroundColor: '#EAE8FF',
                   alignItems: 'center', justifyContent: 'center' },

  storyRingOuter:{ width: 66, height: 66, borderRadius: 33, backgroundColor: Colors.purple, padding: 2 },
  storyRingInner:{ flex: 1, borderRadius: 31, borderWidth: 2, borderColor: Colors.green,
                   backgroundColor: '#EEEDFE', alignItems: 'center', justifyContent: 'center' },
  storyName:     { fontSize: 11, fontWeight: '700', color: '#888780', marginTop: 5 },

  newPostPill:   { backgroundColor: Colors.purple, borderRadius: 9999,
                   paddingVertical: 14, alignItems: 'center' },
  newPostText:   { color: '#fff', fontWeight: '700', fontSize: 15 },

  emptyState:    { alignItems: 'center', paddingHorizontal: 40, paddingVertical: 60 },
  emptyText:     { fontSize: 16, color: '#888780', textAlign: 'center', marginBottom: 20, lineHeight: 24 },

  card:          { marginHorizontal: 14, marginVertical: 7, backgroundColor: '#fff',
                   borderRadius: 18, shadowColor: '#7F77DD', shadowOpacity: 0.1,
                   shadowRadius: 8, elevation: 3 },
  cardHeader:    { flexDirection: 'row', alignItems: 'center',
                   padding: 13, paddingBottom: 9 },
  friendAvatar:  { width: 44, height: 44, borderRadius: 22,
                   alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  friendName:    { fontWeight: '700', fontSize: 14, color: '#2C2C2A' },
  postTime:      { fontSize: 11, color: '#B4B2A9', marginTop: 1 },
  speakerBtn:    { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.bg,
                   alignItems: 'center', justifyContent: 'center' },
  badgePurple:   { backgroundColor: Colors.purple + '22', borderRadius: 9999,
                   paddingHorizontal: 8, paddingVertical: 2 },
  badgePurpleText: { fontSize: 10, color: Colors.purple, fontWeight: '700' },

  sceneStrip:    { height: 120, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  postContent:   { fontSize: 14, color: '#2C2C2A', lineHeight: 22,
                   paddingHorizontal: 14, paddingVertical: 10 },

  commentsSection: { backgroundColor: '#F8F7FF', borderTopWidth: 1, borderTopColor: '#F0EFF8', paddingHorizontal: 14, paddingVertical: 8, gap: 6 },
  commentRow:    { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  commentAvatar: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#EEEDFE', alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  commentName:   { fontSize: 11, fontWeight: '700', color: Colors.purple, marginBottom: 1 },
  commentText:   { fontSize: 12, color: '#2C2C2A', lineHeight: 17 },
  commentTime:   { fontSize: 10, color: '#B4B2A9', marginTop: 2 },
  commentMore:   { fontSize: 11, color: Colors.purple, fontStyle: 'italic', marginTop: 2 },

  reactRow:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                   paddingHorizontal: 14, paddingVertical: 9,
                   borderTopWidth: 1, borderTopColor: Colors.bg },
  reactBtn:      { flexDirection: 'row', alignItems: 'center', gap: 4,
                   borderRadius: 9999, paddingHorizontal: 10, paddingVertical: 5 },
  reactCount:    { fontSize: 12, color: Colors.purple, fontWeight: '700' },
  replyBtn:      { flexDirection: 'row', alignItems: 'center', gap: 4,
                   backgroundColor: Colors.purple, borderRadius: 9999,
                   paddingHorizontal: 14, paddingVertical: 7 },
  replyBtnText:  { color: '#fff', fontWeight: '700', fontSize: 13 },

  modalOverlay:  { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.32)' },
  modalSheet:    { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24,
                   padding: 20, paddingBottom: 40 },
  modalTitle:    { fontSize: 18, fontWeight: '700', color: '#2C2C2A', marginBottom: 16 },
  postInput:     { backgroundColor: Colors.bg, borderRadius: 12, padding: 14, fontSize: 15,
                   color: '#2C2C2A', minHeight: 100, textAlignVertical: 'top', marginBottom: 14 },
  moodChip:      { width: 44, height: 44, borderRadius: 22,
                   backgroundColor: Colors.bg, alignItems: 'center', justifyContent: 'center' },
  postBtn:       { backgroundColor: Colors.purple, borderRadius: 9999,
                   paddingVertical: 14, alignItems: 'center', marginBottom: 4 },
  postBtnText:   { color: '#fff', fontWeight: '700', fontSize: 16 },

  devResetBtn:   { backgroundColor: '#FFE5E5', borderRadius: 8,
                   paddingHorizontal: 8, paddingVertical: 4 },
  devResetText:  { fontSize: 11, color: '#CC0000', fontWeight: '700' },
  refreshIcon:   { fontSize: 20, color: '#B4B2A9' },
});
