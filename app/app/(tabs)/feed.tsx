import {
  View, Text, SafeAreaView, ScrollView, FlatList, TouchableOpacity,
  Modal, TextInput, RefreshControl, ActivityIndicator, Animated,
  AppState, AppStateStatus, StyleSheet, Platform, KeyboardAvoidingView, Image, Dimensions, Alert,
} from 'react-native';
import { useState, useEffect, useRef, useCallback } from 'react';
import { router, usePathname } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Audio } from 'expo-av';
import { useTranslation } from 'react-i18next';
import { childAuth, childPosts, childSession, childProfileApi, childMessages, childNotifications, FriendWithStats, mascotAvatars as mascotAvatarApi, audioApi } from '@/services/api';
import { useNotificationStore } from '@/store/notificationStore';
import MigoLogo from '@/components/MigoLogo';
import EmojiAvatar from '@/components/EmojiAvatar';
import { useOnboardingStore } from '@/store/onboardingStore';
import { Colors, Mascots } from '@/constants/theme';
import AudioPlayer from '@/components/AudioPlayer';
import { requestPermission } from '@/utils/webNotifications';
import { useLanguageStore } from '@/store/languageStore';
import TourOverlay from '@/components/TourOverlay';
import { TOUR_STEPS } from '@/constants/tourSteps';
import { useTourStore } from '@/store/tourStore';
import { dedupeDictatedText } from '@/utils/dedupeDictatedText';

interface PostComment {
  authorName:     string;
  authorEmoji:    string;
  authorAvatarUrl?: string | null;
  content:        string;
  createdAt:      string;
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
  friend_avatar_url?: string | null;
  image_url?: string | null;
  reactions: Record<string, number>;
  comments: PostComment[];
}

const THEME_EMOJI: Record<string, string> = {
  animals:  '🐻',
  space:    '🚀',
  fantasy:  '🧚',
  ocean:    '🐬',
  jungle:   '🦁',
  cat:      '🐱',
  dog:      '🐶',
  fox:      '🦊',
  rabbit:   '🐰',
  bear:     '🐻',
  owl:      '🦉',
  lion:     '🦁',
  panda:    '🐼',
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
  const [friendsList, setFriendsList] = useState<FriendWithStats[]>([]);
  const [loading, setLoading]         = useState(true);
  const [initializing, setInitializing] = useState(true);
  const [refreshing, setRefreshing]   = useState(false);
  const [reloading, setReloading]     = useState(false);
  const [childToken, setChildToken]   = useState<string | null>(null);
  const [showNewPost, setShowNewPost] = useState(false);
  const [newPostText, setNewPostText] = useState('');
  const [newPostMood, setNewPostMood] = useState('');
  const [posting, setPosting]         = useState(false);
  const [childEmoji, setChildEmoji]           = useState<string>('👦');
  const [avatarBackground, setAvatarBackground] = useState<string>('#EEEDFE');
  const [childAvatarUrl, setChildAvatarUrl]   = useState<string | null>(null);
  const [showTour, setShowTour]   = useState(false);
  const [tourStep, setTourStep]   = useState(0);
  const [tourSpots, setTourSpots] = useState<Record<string, { x: number; y: number; width: number; height: number }>>({});

  const childTokenRef        = useRef<string | null>(null);
  const refreshTimer         = useRef<ReturnType<typeof setInterval> | null>(null);
  const commentsTimer        = useRef<ReturnType<typeof setInterval> | null>(null);
  const dmPollTimer          = useRef<ReturnType<typeof setInterval> | null>(null);
  const friendsRowRef  = useRef<View>(null);
  const postButtonRef  = useRef<View>(null);
  const friendPostRef  = useRef<View>(null);
  const visiblePostIds       = useRef<Set<string>>(new Set());
  const lastCheckRef         = useRef(new Date().toISOString());
  const shownNotificationIds = useRef<Set<string>>(new Set());
  const SHOWN_IDS_KEY = 'shownNotificationIds';
  const MAX_SHOWN_IDS = 500;

  const { showNotification, unreadCount, setUnreadCount } = useNotificationStore();
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  useEffect(() => { pathnameRef.current = pathname; }, [pathname]);

  const resetStore  = useOnboardingStore((s) => s.resetStore);
  const [mascotId,        setMascotId]        = useState('miga');
  const [mascotEmoji,     setMascotEmoji]     = useState('🧚');
  const [mascotAvatarUrl, setMascotAvatarUrl] = useState<string | null>(null);
  const { language } = useLanguageStore();
  const setTourStepId = useTourStore(s => s.setTourStepId);
  const tourStepId    = useTourStore(s => s.tourStepId);
  const friendsPulse    = useRef(new Animated.Value(1)).current;
  const postButtonPulse = useRef(new Animated.Value(1)).current;
  const friendPostPulse = useRef(new Animated.Value(1)).current;
  const audioButtonPulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    friendsPulse.setValue(1.0);
    postButtonPulse.setValue(1.0);
    friendPostPulse.setValue(1.0);
    audioButtonPulse.setValue(1.0);

    let anim: Animated.CompositeAnimation | null = null;

    if (tourStepId === 'friends_row') {
      anim = Animated.loop(Animated.sequence([
        Animated.timing(friendsPulse, { toValue: 1.08, duration: 400, useNativeDriver: true }),
        Animated.timing(friendsPulse, { toValue: 1.0,  duration: 400, useNativeDriver: true }),
      ]));
    } else if (tourStepId === 'dm_hint') {
      anim = Animated.loop(Animated.sequence([
        Animated.timing(friendsPulse,    { toValue: 1.08, duration: 350, useNativeDriver: true }),
        Animated.timing(friendsPulse,    { toValue: 1.0,  duration: 350, useNativeDriver: true }),
        Animated.delay(150),
        Animated.timing(postButtonPulse, { toValue: 1.06, duration: 350, useNativeDriver: true }),
        Animated.timing(postButtonPulse, { toValue: 1.0,  duration: 350, useNativeDriver: true }),
        Animated.delay(150),
      ]));
    } else if (tourStepId === 'post_button') {
      anim = Animated.loop(Animated.sequence([
        Animated.timing(postButtonPulse, { toValue: 1.06, duration: 400, useNativeDriver: true }),
        Animated.timing(postButtonPulse, { toValue: 1.0,  duration: 400, useNativeDriver: true }),
      ]));
    } else if (tourStepId === 'friend_post') {
      anim = Animated.loop(Animated.sequence([
        Animated.timing(friendPostPulse, { toValue: 1.02, duration: 500, useNativeDriver: true }),
        Animated.timing(friendPostPulse, { toValue: 1.0,  duration: 500, useNativeDriver: true }),
      ]));
    } else if (tourStepId === 'audio_button') {
      anim = Animated.loop(Animated.sequence([
        Animated.timing(audioButtonPulse, { toValue: 1.4, duration: 300, useNativeDriver: true }),
        Animated.timing(audioButtonPulse, { toValue: 1.0, duration: 300, useNativeDriver: true }),
      ]));
    }

    if (anim) anim.start();
    return () => { anim?.stop(); };
  }, [tourStepId]);

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

        const [storedEmoji, storedBg, storedAvatarUrl, storedProfile] = await Promise.all([
          AsyncStorage.getItem('childEmoji'),
          AsyncStorage.getItem('avatarBackground'),
          AsyncStorage.getItem('childAvatarUrl'),
          AsyncStorage.getItem('childProfile'),
        ]);
        if (!cancelled) {
          if (storedEmoji) setChildEmoji(storedEmoji);
          setAvatarBackground(storedBg ?? '#EEEDFE');
          if (storedProfile) {
            try {
              const p = JSON.parse(storedProfile) as { mascotId?: string };
              const id = (p.mascotId || 'miga').toLowerCase();
              setMascotId(id);
              setMascotEmoji(Mascots[id]?.emoji || '🧚');
              mascotAvatarApi.get().then(r => {
                const url = r.data.mascots[id];
                if (url) setMascotAvatarUrl(url);
              }).catch(() => {});
            } catch {}
          }
          if (storedAvatarUrl) {
            setChildAvatarUrl(storedAvatarUrl);
          } else {
            try {
              const profileRes = await childProfileApi.getProfile(token);
              const url = profileRes.data.avatarUrl;
              if (url && !cancelled) {
                await AsyncStorage.setItem('childAvatarUrl', url);
                setChildAvatarUrl(url);
              }
            } catch {}
          }
        }

        try {
          const storedIds = await AsyncStorage.getItem(SHOWN_IDS_KEY);
          if (storedIds) {
            const parsed = JSON.parse(storedIds) as string[];
            shownNotificationIds.current = new Set(parsed);
          }
        } catch {}

        await loadFeed(token, true);

        const seen = await AsyncStorage.getItem('hasSeenTour');
        if (!seen) {
          setTimeout(() => {
            setShowTour(true);
            setTourStepId(TOUR_STEPS[0].id);
          }, 3000);
        }

        try {
          const notifRes = await childNotifications.get(token);
          const unreadCount = notifRes.data.notifications.filter(n => !n.read).length;
          setUnreadCount(unreadCount);
        } catch {
          setUnreadCount(0);
        }
      }

      if (!cancelled) setLoading(false);

      if (Platform.OS === 'web') {
        void requestPermission();
      }
    }

    void init();
    return () => { cancelled = true; };
  }, [setUnreadCount]);

  // End session when app goes to background
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if ((state === 'background' || state === 'inactive') && childTokenRef.current) {
        childSession.end(childTokenRef.current).catch(() => {});
      }
    });
    return () => sub.remove();
  }, []);

  // Check server for avatar_url 10s after mount — catches cartoon arriving after onboarding
  useEffect(() => {
    const timer = setTimeout(async () => {
      const token = childTokenRef.current;
      if (!token || childAvatarUrl) return;
      try {
        const profileRes = await childProfileApi.getProfile(token);
        const url = profileRes.data.avatarUrl;
        if (url) {
          await AsyncStorage.setItem('childAvatarUrl', url);
          setChildAvatarUrl(url);
        }
      } catch {}
    }, 10000);
    return () => clearTimeout(timer);
  }, [childAvatarUrl]);

  // Poll comments for visible posts every 15 seconds
  useEffect(() => {
    if (!childToken || loading) return;

    commentsTimer.current = setInterval(async () => {
      const token = childTokenRef.current;
      if (!token || visiblePostIds.current.size === 0) return;

      const ids = [...visiblePostIds.current];
      const results = await Promise.allSettled(
        ids.map((id) => childPosts.getComments(token, id)),
      );

      setPosts((prev) =>
        prev.map((p) => {
          const idx = ids.indexOf(p.id);
          if (idx === -1) return p;
          const result = results[idx];
          if (result.status !== 'fulfilled') return p;
          return { ...p, comments: result.value.data.comments };
        }),
      );
    }, 15000);

    return () => {
      if (commentsTimer.current) { clearInterval(commentsTimer.current); commentsTimer.current = null; }
    };
  }, [childToken, loading]);

  // Poll for unread DM messages every 20 seconds to surface notification banners
  useEffect(() => {
    if (!childToken || loading) return;
    lastCheckRef.current = new Date().toISOString();

    dmPollTimer.current = setInterval(async () => {
      const token = childTokenRef.current;
      if (!token) return;
      const since = lastCheckRef.current;
      lastCheckRef.current = new Date().toISOString();
      try {
        const res = await childMessages.getUnread(token, since);
        for (const item of res.data.messages) {
          if (pathnameRef.current === `/dm/${item.friendId}`) continue;
          if (item.id && shownNotificationIds.current.has(item.id)) continue;
          showNotification({ friendId: item.friendId, friendName: item.friendName, friendEmoji: item.friendEmoji, message: item.message });
          if (item.id) {
            shownNotificationIds.current.add(item.id);
            const ids = [...shownNotificationIds.current];
            if (ids.length > MAX_SHOWN_IDS) ids.splice(0, ids.length - MAX_SHOWN_IDS);
            shownNotificationIds.current = new Set(ids);
            AsyncStorage.setItem(SHOWN_IDS_KEY, JSON.stringify(ids)).catch(() => {});
          }
        }
      } catch {}
    }, 20000);

    return () => {
      if (dmPollTimer.current) { clearInterval(dmPollTimer.current); dmPollTimer.current = null; }
    };
  }, [childToken, loading]);

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
      const [postsRes, friendsRes] = await Promise.all([
        childPosts.feed(token),
        childProfileApi.getFriendsList(token).catch(() => null),
      ]);
      const loaded = postsRes.data.posts as FeedPost[];
      console.log('[feed] posts loaded:', loaded.length);
      setPosts(loaded);
      if (friendsRes) setFriendsList(friendsRes.data.friends);
    } catch (e) {
      console.error('[feed] loadFeed error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
      setInitializing(false);
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

  function measureRefs() {
    const { width: W, height: H } = Dimensions.get('window');
    const tourSpots: Record<string, { x: number; y: number; width: number; height: number }> = {};
    tourSpots['discover_tab'] = { x: W*0.25-30, y: H-83, width: 60, height: 49 };
    tourSpots['badges_tab']   = { x: W*0.50-30, y: H-83, width: 60, height: 49 };
    tourSpots['me_tab']       = { x: W*0.75-30, y: H-83, width: 60, height: 49 };
    tourSpots['audio_button'] = { x: W-68,      y: H*0.32, width: 40, height: 40 };
    setTourSpots(tourSpots);
    friendsRowRef.current?.measure((_fx, _fy, width, height, px, py) => {
      setTourSpots(prev => ({
        ...prev,
        friends_row: { x: px, y: py, width, height },
        dm_hint:     { x: px, y: py, width, height },
      }));
    });
    postButtonRef.current?.measure((_fx, _fy, width, height, px, py) => {
      setTourSpots(prev => ({ ...prev, post_button: { x: px, y: py, width, height } }));
    });
    friendPostRef.current?.measure((_fx, _fy, _w, _h, px, py) => {
      const { width: sw, height: sh } = Dimensions.get('window');
      setTourSpots(prev => ({
        ...prev,
        friend_post: { x: 14, y: py > 0 ? py : sh * 0.55, width: sw - 28, height: 180 },
      }));
    });
  }

  function handleTourNext() {
    const next = tourStep + 1;
    if (next >= TOUR_STEPS.length) {
      void completeTour();
    } else {
      setTourStep(next);
      setTourStepId(TOUR_STEPS[next].id);
    }
  }

  async function completeTour() {
    await AsyncStorage.setItem('hasSeenTour', 'true');
    setShowTour(false);
    setTourStepId(null);
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

  const computedSteps = TOUR_STEPS.map(step => ({
    ...step,
    spotlight: {
      shape: step.spotlight.shape,
      x: tourSpots[step.id]?.x ?? 0,
      y: tourSpots[step.id]?.y ?? 0,
      width: tourSpots[step.id]?.width ?? 0,
      height: tourSpots[step.id]?.height ?? 0,
    },
  }));

  const lunaFriend = friendsList.find(f => f.is_teacher && f.name === 'Ms. Luna');

  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const postedTodayIds = new Set(
    posts
      .filter(p => p.author_type === 'ai' && new Date(p.created_at) >= todayStart)
      .map(p => p.author_id),
  );
  const storyFriends = [...friendsList]
    .filter(f => !f.is_teacher)
    .sort((a, b) => {
      const aScore = postedTodayIds.has(a.id) ? 0 : 1;
      const bScore = postedTodayIds.has(b.id) ? 0 : 1;
      return aScore - bScore;
    })
    .map(f => ({ id: f.id, name: f.name, emojis: f.cover_emojis ?? '🌟', avatar_url: f.avatar_url ?? null }));

  async function submitComment(postId: string, text: string) {
    if (!childToken) return;
    setPosts((prev) =>
      prev.map((p) =>
        p.id === postId
          ? { ...p, comments: [...p.comments, { authorName: t('feed.you'), authorEmoji: '😊', content: text, createdAt: new Date().toISOString() }] }
          : p,
      ),
    );
    try {
      await childPosts.comment(childToken, postId, text);
    } catch (e) {
      console.error('[feed] submitComment error:', e);
      void loadFeed(childToken, true);
    }
  }

  const renderPost = useCallback(
    ({ item, index }: { item: FeedPost; index: number }) => (
      <PostCard
        post={item}
        avatarEmoji={childEmoji}
        childAvatarUrl={childAvatarUrl}
        childToken={childToken}
        onReact={(emoji) => void handleReact(item.id, emoji)}
        onSubmitComment={(text) => submitComment(item.id, text)}
        audioButtonScale={item.author_type === 'ai' && index === 0 ? audioButtonPulse : undefined}
        friendPostScale={index === 0 && item.author_type === 'ai' ? friendPostPulse : undefined}
        t={t}
      />
    ),
    [childEmoji, childAvatarUrl, childToken, t, audioButtonPulse, friendPostPulse],
  );

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: Array<{ item: FeedPost }> }) => {
      visiblePostIds.current = new Set(viewableItems.map((v) => v.item.id));
    },
    [],
  );

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 50 }).current;

  return (
    <SafeAreaView style={s.screen}>
      {/* ── Top bar ── */}
      <View style={s.topBar}>
        <MigoLogo size="sm" />
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
          <TouchableOpacity onPress={() => router.push('/notifications' as never)}>
            <Text style={{ fontSize: 22 }}>🔔</Text>
            {unreadCount > 0 && <View style={s.redDot} />}
          </TouchableOpacity>
          {childAvatarUrl
            ? <Image source={{ uri: childAvatarUrl }} style={{ width: 36, height: 36, borderRadius: 18 }} />
            : <EmojiAvatar emoji={childEmoji} background={avatarBackground} size={36} />
          }
        </View>
      </View>

      {loading ? (
        <SkeletonFeed />
      ) : (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
        >
        <FlatList
          data={posts}
          keyExtractor={(item) => item.id}
          renderItem={renderPost}
          showsVerticalScrollIndicator={false}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.purple} />
          }
          ListHeaderComponent={
            <View>
              {storyFriends.length > 0 && (
                <View ref={friendsRowRef}>
                  <Animated.View style={{ transform: [{ scale: friendsPulse }] }}>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ paddingLeft: 14, paddingRight: 6, paddingVertical: 14 }}
                  >
                    {lunaFriend && (
                      <TouchableOpacity
                        onPress={() => router.push(`/friend/${lunaFriend.id}` as never)}
                        style={{ alignItems: 'center', marginRight: 14 }}
                      >
                        <View style={s.lunaStoryRingOuter}>
                          <View style={s.storyRingInner}>
                            {lunaFriend.avatar_url
                              ? <Image source={{ uri: lunaFriend.avatar_url }} style={{ width: 52, height: 52, borderRadius: 26 }} />
                              : <Text style={{ fontSize: 28 }}>{firstEmoji(lunaFriend.cover_emojis)}</Text>
                            }
                          </View>
                        </View>
                        <Text style={s.storyName}>{lunaFriend.name}</Text>
                      </TouchableOpacity>
                    )}
                    {storyFriends.map((f) => (
                      <TouchableOpacity
                        key={f.id}
                        onPress={() => router.push(`/friend/${f.id}` as never)}
                        style={{ alignItems: 'center', marginRight: 14 }}
                      >
                        <View style={s.storyRingOuter}>
                          <View style={s.storyRingInner}>
                            {f.avatar_url
                              ? <Image source={{ uri: f.avatar_url }} style={{ width: 52, height: 52, borderRadius: 26 }} />
                              : <Text style={{ fontSize: 28 }}>{firstEmoji(f.emojis)}</Text>
                            }
                          </View>
                        </View>
                        <Text style={s.storyName}>{f.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                  </Animated.View>
                </View>
              )}

              <View style={{ paddingHorizontal: 14, paddingBottom: 8 }}>
                <View ref={postButtonRef}>
                  <Animated.View style={{ transform: [{ scale: postButtonPulse }] }}>
                    <TouchableOpacity
                      onPress={() => setShowNewPost(true)}
                      style={s.newPostPill}
                    >
                      <Text style={s.newPostText}>{t('feed.newPost')}</Text>
                    </TouchableOpacity>
                  </Animated.View>
                </View>
              </View>

              <View ref={friendPostRef} />
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
        </KeyboardAvoidingView>
      )}

      {showTour && (
        <TourOverlay
          steps={computedSteps}
          currentStep={tourStep}
          onNext={handleTourNext}
          onSkip={() => void completeTour()}
          mascotEmoji={mascotEmoji}
          mascotId={mascotId}
          mascotAvatarUrl={mascotAvatarUrl}
          language={language}
        />
      )}

      {initializing && (
        <View style={[StyleSheet.absoluteFill, {
          backgroundColor: Colors.bg,
          alignItems: 'center', justifyContent: 'center', zIndex: 99,
        }]}>
          {mascotAvatarUrl
            ? <Image source={{ uri: mascotAvatarUrl }}
                     style={{ width: 100, height: 100, borderRadius: 50 }} />
            : <Text style={{ fontSize: 60 }}>🐉</Text>
          }
          <Text style={{ color: Colors.purple, fontSize: 16, marginTop: 12 }}>
            {language === 'fr' ? 'Chargement...' : 'Loading...'}
          </Text>
        </View>
      )}

      {/* ── New Post Modal ── */}
      <Modal visible={showNewPost} transparent animationType="slide">
        <KeyboardAvoidingView
          style={s.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
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
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

function PostCard({
  post, avatarEmoji, childAvatarUrl, childToken, onReact, onSubmitComment, audioButtonScale, friendPostScale, t,
}: {
  post: FeedPost;
  avatarEmoji: string;
  childAvatarUrl: string | null;
  childToken: string | null;
  onReact: (emoji: string) => void;
  onSubmitComment: (text: string) => Promise<void>;
  audioButtonScale?: Animated.Value;
  friendPostScale?: Animated.Value;
  t: (key: string) => string;
}) {
  const [showInput, setShowInput]       = useState(false);
  const [commentText, setCommentText]   = useState('');
  const [submitting, setSubmitting]     = useState(false);
  const { language }                    = useLanguageStore();
  const [isRecording, setIsRecording]   = useState(false);
  const recordingRef                    = useRef<Audio.Recording | null>(null);

  async function handleSubmit() {
    if (!commentText.trim() || submitting) return;
    setSubmitting(true);
    const text = commentText.trim();
    setCommentText('');
    setShowInput(false);
    try { await onSubmitComment(text); } finally { setSubmitting(false); }
  }

  async function handleVoiceMemo() {
    if (isRecording) {
      setIsRecording(false);
      const rec = recordingRef.current;
      if (!rec) return;
      try {
        await rec.stopAndUnloadAsync();
        const uri = rec.getURI();
        recordingRef.current = null;
        await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
        if (!uri || !childToken) return;
        const base64 = await new Promise<string>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.responseType = 'arraybuffer';
          xhr.onload = () => {
            const bytes = new Uint8Array(xhr.response as ArrayBuffer);
            let binary = '';
            for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
            resolve(btoa(binary));
          };
          xhr.onerror = reject;
          xhr.open('GET', uri);
          xhr.send();
        });
        const result = await audioApi.transcribe(childToken, {
          audioBase64: base64,
          mimeType: 'audio/m4a',
          language,
        });
        const transcript = result.data.transcript?.trim();
        if (transcript) setCommentText(transcript);
      } catch (err) {
        console.error('[voice] transcription failed:', err);
        Alert.alert(t('dm.voiceError'));
      }
    } else {
      try {
        const { granted } = await Audio.requestPermissionsAsync();
        if (!granted) { Alert.alert(t('dm.micPermissionDenied')); return; }
        await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
        const { recording } = await Audio.Recording.createAsync(
          Audio.RecordingOptionsPresets.HIGH_QUALITY,
        );
        recordingRef.current = recording;
        setIsRecording(true);
      } catch (err) {
        console.error('[voice] recording start failed:', err);
      }
    }
  }

  const isOwn      = post.author_type === 'child';
  const name       = isOwn ? t('feed.you') : (post.friend_name ?? 'Friend');
  const friendBg   = isOwn ? '#E1F5EE' : (FRIEND_BG[name]   ?? '#EEEDFE');
  const friendTint = isOwn ? '#E1F5EE' : (FRIEND_TINT[name] ?? '#F0EFFF');
  const emoji          = isOwn ? avatarEmoji : firstEmoji(post.friend_cover_emojis);
  const friendAvatarUrl = !isOwn ? (post.friend_avatar_url ?? null) : null;
  const sceneChars = post.scene_emojis ? [...post.scene_emojis] : [];

  return (
    <Animated.View style={friendPostScale ? { transform: [{ scale: friendPostScale }] } : undefined}>
    <View style={s.card}>
      <View style={s.cardHeader}>
        <View style={[s.friendAvatar, { backgroundColor: friendBg }]}>
          {isOwn && childAvatarUrl
            ? <Image source={{ uri: childAvatarUrl }} style={{ width: 44, height: 44, borderRadius: 22 }} />
            : (!isOwn && friendAvatarUrl)
              ? <Image source={{ uri: friendAvatarUrl }} style={{ width: 44, height: 44, borderRadius: 22 }} />
              : <Text style={{ fontSize: 24 }}>{emoji}</Text>
          }
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

        {!isOwn && post.friend_name ? (
          <Animated.View style={audioButtonScale ? { transform: [{ scale: audioButtonScale }] } : undefined}>
            <AudioPlayer
              text={post.content}
              characterId={post.friend_name}
              messageId={post.id}
              size="sm"
            />
          </Animated.View>
        ) : (
          <View style={s.speakerBtn} />
        )}
      </View>

      {!isOwn && (
        post.image_url
          ? <Image
              source={{ uri: post.image_url }}
              style={{ width: '100%', aspectRatio: 1, borderRadius: 12, marginVertical: 8 }}
              resizeMode="cover"
            />
          : sceneChars.length > 0 && (
              <View style={[s.sceneStrip, { backgroundColor: friendTint }]}>
                {sceneChars.slice(0, 5).map((ch, i) => (
                  <Text key={i} style={{ fontSize: 52 }}>{ch}</Text>
                ))}
              </View>
            )
      )}

      <Text style={s.postContent}>{post.content}</Text>

      {post.comments && post.comments.length > 0 && (
        <View style={s.commentsSection}>
          {post.comments.slice(0, 2).map((c, i) => {
            console.log('[comment]', c.authorName, c.authorAvatarUrl);
            return (
            <View key={i} style={s.commentRow}>
              <View style={s.commentAvatar}>
                {c.authorAvatarUrl
                  ? <Image source={{ uri: c.authorAvatarUrl }} style={{ width: 24, height: 24, borderRadius: 12 }} />
                  : <Text style={{ fontSize: 13 }}>{c.authorEmoji}</Text>
                }
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.commentName}>{c.authorName}</Text>
                <Text style={s.commentText}>{c.content}</Text>
              </View>
              <Text style={s.commentTime}>{relativeTime(c.createdAt)}</Text>
            </View>
            );
          })}
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
          <TouchableOpacity onPress={() => setShowInput((v) => !v)} style={s.replyBtn}>
            <Text style={{ fontSize: 14 }}>💬</Text>
            <Text style={s.replyBtnText}>{t('feed.replyButton')}</Text>
          </TouchableOpacity>
        )}
      </View>

      {showInput && (
        <View style={s.commentInputRow}>
          <TouchableOpacity
            style={[{ width: 38, height: 38, borderRadius: 19, backgroundColor: Colors.orange + '33', alignItems: 'center', justifyContent: 'center' }, isRecording && { backgroundColor: '#FF4B4B' }]}
            onPress={() => void handleVoiceMemo()}
          >
            <Text style={{ fontSize: 18 }}>{isRecording ? '⏹️' : '🎤'}</Text>
          </TouchableOpacity>
          <TextInput
            value={commentText}
            onChangeText={(text) => setCommentText(dedupeDictatedText(text))}
            placeholder={t('feed.commentPlaceholder')}
            placeholderTextColor="#B4B2A9"
            style={s.commentInputField}
            autoFocus
            onSubmitEditing={() => void handleSubmit()}
            returnKeyType="send"
          />
          <TouchableOpacity
            onPress={() => void handleSubmit()}
            disabled={!commentText.trim() || submitting}
            style={[s.commentSendBtn, (!commentText.trim() || submitting) && { backgroundColor: '#C8C6E8' }]}
          >
            {submitting
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>{t('feed.sendButton')}</Text>
            }
          </TouchableOpacity>
        </View>
      )}
    </View>
    </Animated.View>
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
  redDot:        { position: 'absolute', top: -2, right: -2, width: 8, height: 8,
                   borderRadius: 4, backgroundColor: Colors.red },
  avatarCircle:  { width: 36, height: 36, borderRadius: 18, backgroundColor: '#EAE8FF',
                   alignItems: 'center', justifyContent: 'center' },

  storyRingOuter:    { width: 66, height: 66, borderRadius: 33, backgroundColor: Colors.purple, padding: 2 },
  lunaStoryRingOuter:{ width: 66, height: 66, borderRadius: 33, backgroundColor: Colors.green, padding: 2 },
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

  commentInputRow:  { flexDirection: 'row', alignItems: 'center', gap: 8,
                      paddingHorizontal: 14, paddingVertical: 10,
                      borderTopWidth: 1, borderTopColor: Colors.bg },
  commentInputField:{ flex: 1, backgroundColor: Colors.bg, borderRadius: 20,
                      paddingHorizontal: 14, paddingVertical: 8,
                      fontSize: 14, color: '#2C2C2A' },
  commentSendBtn:   { backgroundColor: Colors.purple, borderRadius: 9999,
                      paddingHorizontal: 16, paddingVertical: 8 },
});
