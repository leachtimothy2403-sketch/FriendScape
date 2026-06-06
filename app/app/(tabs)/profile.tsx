import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, SafeAreaView, ScrollView, TouchableOpacity,
  TextInput, Modal, ActivityIndicator, StyleSheet,
  Dimensions, KeyboardAvoidingView, Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Colors, Mascots } from '@/constants/theme';
import { useLanguageStore } from '@/store/languageStore';
import {
  childProfileApi, avatarApi,
  ChildProfile, MemoryItem, FriendWithStats, ProfilePost, ModerationResult,
} from '@/services/api';
import MigoLogo from '@/components/MigoLogo';
import Avatar from '@/components/Avatar';
import type { AvatarConfig } from '@migo/shared/types/avatar';

// ── Constants ─────────────────────────────────────────────────────────────────

const POST_CELL_SIZE = (Dimensions.get('window').width - 28 - 6) / 3;

const INTERESTS = [
  { key: 'art',      emoji: '🎨', label: 'Art' },
  { key: 'sports',   emoji: '⚽', label: 'Sports' },
  { key: 'animals',  emoji: '🐾', label: 'Animals' },
  { key: 'gaming',   emoji: '🎮', label: 'Gaming' },
  { key: 'reading',  emoji: '📚', label: 'Reading' },
  { key: 'music',    emoji: '🎵', label: 'Music' },
  { key: 'cooking',  emoji: '🍳', label: 'Cooking' },
  { key: 'science',  emoji: '🚀', label: 'Science' },
  { key: 'nature',   emoji: '🌿', label: 'Nature' },
  { key: 'drama',    emoji: '🎭', label: 'Drama' },
  { key: 'building', emoji: '🏗️', label: 'Building' },
  { key: 'dance',    emoji: '💃', label: 'Dance' },
];

const MOOD_BG: Record<string, string> = {
  happy: '#E1F5EE', excited: '#E1F5EE',
  sad: '#FAEEDA', worried: '#FAEEDA',
  neutral: '#EEEDFE',
};

const MOOD_EMOJI: Record<string, string> = {
  happy: '😊', excited: '🤩', sad: '😢',
  worried: '😟', neutral: '😐', angry: '😠',
};

const MEMORY_TYPE_BG: Record<string, string> = {
  milestone: '#EEEDFE',
  badge:     '#FAEEDA',
  friendship:'#F8E8F8',
  emotional: '#E1F5EE',
  learning:  '#E6F1FB',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function getMoodBg(mood: string | null): string {
  return mood ? (MOOD_BG[mood] ?? '#F8F7FF') : '#F8F7FF';
}

function formatRelativeDate(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7)  return `${diff} days ago`;
  return new Date(dateStr).toLocaleDateString('en', { day: 'numeric', month: 'long', year: 'numeric' });
}

function formatMemberSince(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en', { month: 'long', year: 'numeric' });
}

function getInterestDisplay(key: string): { emoji: string; label: string } {
  return INTERESTS.find(i => i.key === key) ?? { emoji: '✨', label: key };
}

// ── Shared sub-components ────────────────────────────────────────────────────

function ProgressBar({ fraction }: { fraction: number }) {
  const pct = `${Math.round(Math.min(1, Math.max(0, fraction)) * 100)}%` as `${number}%`;
  return (
    <View style={s.progressTrack}>
      <View style={[s.progressFill, { width: pct }]} />
    </View>
  );
}

function StatCol({ value, label }: { value: number; label: string }) {
  return (
    <View style={s.statCol}>
      <Text style={s.statValue}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

// ── Tab: Posts ────────────────────────────────────────────────────────────────

function PostsTab({
  posts, t, onSelect,
}: {
  posts: ProfilePost[];
  t: (k: string) => string;
  onSelect: (p: ProfilePost) => void;
}) {
  if (posts.length === 0) {
    return (
      <View style={s.emptyState}>
        <Text style={s.emptyEmoji}>✏️</Text>
        <Text style={s.emptyTitle}>{t('profile.posts.empty')}</Text>
        <Text style={s.emptySubtitle}>{t('profile.posts.emptySubtitle')}</Text>
        <TouchableOpacity onPress={() => router.push('/(tabs)/feed' as never)} style={s.emptyBtn}>
          <Text style={s.emptyBtnText}>{t('profile.posts.writePost')}</Text>
        </TouchableOpacity>
      </View>
    );
  }
  return (
    <View style={s.postsGrid}>
      {posts.map(post => (
        <TouchableOpacity
          key={post.id}
          style={[s.postCell, { backgroundColor: getMoodBg(post.mood) }]}
          onPress={() => onSelect(post)}
          activeOpacity={0.8}
        >
          <Text style={s.postCellEmojis}>{post.scene_emojis ?? '📝'}</Text>
          <View style={s.postCellBottom}>
            <Text style={s.postCellMoodEmoji}>{post.mood ? (MOOD_EMOJI[post.mood] ?? '😐') : '📝'}</Text>
            <Text style={s.postCellTime} numberOfLines={1}>{formatRelativeDate(post.created_at)}</Text>
          </View>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ── Tab: Friends ──────────────────────────────────────────────────────────────

function FriendsTab({
  friends, t,
}: {
  friends: FriendWithStats[];
  t: (k: string, o?: Record<string, unknown>) => string;
}) {
  if (friends.length === 0) {
    return (
      <View style={s.emptyState}>
        <Text style={s.emptyEmoji}>💜</Text>
        <Text style={[s.emptySubtitle, { textAlign: 'center', paddingHorizontal: 32 }]}>
          {t('profile.friends.empty')}
        </Text>
      </View>
    );
  }
  return (
    <View style={s.friendsList}>
      {friends.map(f => {
        const totalXp  = f.friendship_xp + f.xp_to_next_level;
        const fraction = totalXp > 0 ? f.friendship_xp / totalXp : 1;
        return (
          <View key={f.id} style={s.friendCard}>
            <View style={s.friendAvatar}>
              <Text style={s.friendAvatarEmoji}>{(f.cover_emojis ?? '🌟').slice(0, 2)}</Text>
            </View>
            <View style={s.friendInfo}>
              <Text style={s.friendName}>{f.name}</Text>
              <Text style={s.friendLevel}>
                {t('profile.friends.levelLabel', { n: f.friendship_level, levelName: f.level_name })}
              </Text>
              <ProgressBar fraction={fraction} />
              <Text style={s.friendXp}>{f.friendship_xp} / {totalXp} XP</Text>
            </View>
            <TouchableOpacity
              onPress={() => router.push(`/dm/${f.id}` as never)}
              style={s.chatBtn}
            >
              <Text style={s.chatBtnText}>{t('profile.friends.chatButton')}</Text>
            </TouchableOpacity>
          </View>
        );
      })}
    </View>
  );
}

// ── Tab: Memories ─────────────────────────────────────────────────────────────

function MemoriesTab({
  memories, t,
}: {
  memories: MemoryItem[];
  t: (k: string) => string;
}) {
  if (memories.length === 0) {
    return (
      <View style={s.emptyState}>
        <Text style={s.emptyEmoji}>🌟</Text>
        <Text style={[s.emptySubtitle, { textAlign: 'center', paddingHorizontal: 32 }]}>
          {t('profile.memories.empty')}
        </Text>
      </View>
    );
  }
  return (
    <View style={s.timeline}>
      {memories.map((item, idx) => (
        <View key={item.id} style={s.memoryRow}>
          <View style={s.memoryIconCol}>
            <View style={[s.memoryIconCircle, { backgroundColor: MEMORY_TYPE_BG[item.type] ?? '#EEEDFE' }]}>
              <Text style={s.memoryIcon}>{item.icon}</Text>
            </View>
            {idx < memories.length - 1 && <View style={s.timelineLine} />}
          </View>
          <View style={s.memoryContent}>
            <Text style={s.memoryText}>{item.text}</Text>
            <Text style={s.memoryDate}>{formatRelativeDate(item.date)}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function ProfileScreen() {
  const { t }                    = useTranslation();
  const { language, setLanguage } = useLanguageStore();

  const [profile,          setProfile]          = useState<ChildProfile | null>(null);
  const [posts,            setPosts]            = useState<ProfilePost[]>([]);
  const [friends,          setFriends]          = useState<FriendWithStats[]>([]);
  const [memories,         setMemories]         = useState<MemoryItem[]>([]);
  const [activeTab,        setActiveTab]        = useState<'posts' | 'friends' | 'memories'>('posts');
  const [loading,          setLoading]          = useState(true);
  const [editingBio,       setEditingBio]       = useState(false);
  const [bioText,          setBioText]          = useState('');
  const [savingBio,        setSavingBio]        = useState(false);
  const [editingInterests, setEditingInterests] = useState(false);
  const [pendingInterests, setPendingInterests] = useState<string[]>([]);
  const [savingInterests,  setSavingInterests]  = useState(false);
  const [settingsOpen,     setSettingsOpen]     = useState(false);
  const [selectedPost,     setSelectedPost]     = useState<ProfilePost | null>(null);
  const [childToken,        setChildToken]        = useState<string | null>(null);
  const [preReader,         setPreReader]         = useState(false);
  const [avatarConfig,      setAvatarConfig]      = useState<AvatarConfig | null>(null);
  const [avatarBackground,  setAvatarBackground]  = useState('#EEEDFE');
  const [confirmSignOut,    setConfirmSignOut]    = useState(false);
  const [customText,        setCustomText]        = useState('');
  const [checkingCustom,    setCheckingCustom]    = useState(false);
  const [customError,       setCustomError]       = useState('');
  const [toastMsg,          setToastMsg]          = useState('');
  const [toastVisible,      setToastVisible]      = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    setToastVisible(true);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastVisible(false), 2500);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const tok = await AsyncStorage.getItem('childToken');
      const pr  = await AsyncStorage.getItem('preReader');
      if (!tok || cancelled) { if (!cancelled) setLoading(false); return; }
      setChildToken(tok);
      setPreReader(pr === 'true');

      try {
        const [profileRes, postsRes, friendsRes, memoriesRes, avatarRes] = await Promise.all([
          childProfileApi.getProfile(tok),
          childProfileApi.getPosts(tok),
          childProfileApi.getFriendsList(tok),
          childProfileApi.getMemories(tok),
          avatarApi.get(tok).catch(() => ({ data: { avatarConfig: null, avatarBackground: null } })),
        ]);
        if (!cancelled) {
          setProfile(profileRes.data);
          setBioText(profileRes.data.bio ?? '');
          setPosts(postsRes.data.posts);
          setFriends(friendsRes.data.friends);
          setMemories(memoriesRes.data.memories);
          if (avatarRes.data.avatarConfig) setAvatarConfig(avatarRes.data.avatarConfig as unknown as AvatarConfig);
          if (avatarRes.data.avatarBackground) setAvatarBackground(avatarRes.data.avatarBackground);
        }
      } catch (e) {
        console.error('[profile] load failed:', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  const handleSaveBio = useCallback(async () => {
    if (!childToken) return;
    setSavingBio(true);
    try {
      const res = await childProfileApi.updateProfile(childToken, { bio: bioText });
      setProfile(prev => prev ? { ...prev, bio: res.data.bio } : prev);
      setEditingBio(false);
      showToast(t('profile.bioSaved'));
    } catch {
      showToast('Could not save bio');
    } finally {
      setSavingBio(false);
    }
  }, [childToken, bioText, t, showToast]);

  const handleSaveInterests = useCallback(async () => {
    if (!childToken) return;
    setSavingInterests(true);
    try {
      const res = await childProfileApi.updateProfile(childToken, { interests: pendingInterests });
      setProfile(prev => prev ? { ...prev, interests: res.data.interests } : prev);
      setEditingInterests(false);
      showToast(t('profile.interestsSaved'));
    } catch {
      showToast('Could not save interests');
    } finally {
      setSavingInterests(false);
    }
  }, [childToken, pendingInterests, t, showToast]);

  const handleAddCustomInterest = useCallback(async () => {
    const trimmed = customText.trim();
    if (!trimmed || !childToken) return;
    setCheckingCustom(true);
    setCustomError('');
    try {
      const res = await childProfileApi.validateInterest(childToken, trimmed);
      const result: ModerationResult = res.data;
      if (result.safe) {
        setPendingInterests(prev => prev.includes(trimmed) ? prev : [...prev, trimmed]);
        setCustomText('');
      } else {
        setCustomError(result.reason ?? "That doesn't seem right for Migo — try something else!");
      }
    } catch {
      setCustomError("Couldn't check that right now. Please try again.");
    } finally {
      setCheckingCustom(false);
    }
  }, [customText, childToken]);

  const handleSignOut = useCallback(() => {
    setConfirmSignOut(true);
  }, []);

  const doSignOut = useCallback(async () => {
    await AsyncStorage.multiRemove(['authToken', 'childToken', 'childProfile']);
    router.replace('/enroll' as never);
  }, []);

  const handleTogglePreReader = useCallback(async (val: boolean) => {
    setPreReader(val);
    await AsyncStorage.setItem('preReader', val ? 'true' : 'false');
  }, []);

  const mascotId   = profile?.mascotId ?? 'luna';
  const mascotName = mascotId.charAt(0).toUpperCase() + mascotId.slice(1);
  const mascotEmoji = Mascots[mascotId]?.emoji ?? '🦉';

  if (loading) {
    return (
      <SafeAreaView style={s.screen}>
        <View style={s.topBar}>
          <MigoLogo size="sm" />
          <Text style={s.topTitle}>{t('profile.title')}</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={Colors.purple} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.screen}>

      {/* Top bar */}
      <View style={s.topBar}>
        <View style={s.logoRow}><Text style={s.logoMi}>Mi</Text><Text style={s.logoGo}>go</Text></View>
        <Text style={s.topTitle}>{t('profile.title')}</Text>
        <TouchableOpacity onPress={() => setSettingsOpen(true)} style={s.settingsBtn}>
          <Text style={{ fontSize: 22 }}>⚙️</Text>
        </TouchableOpacity>
      </View>

      {/* Toast */}
      {toastVisible && (
        <View style={s.toast}>
          <Text style={s.toastText}>{toastMsg}</Text>
        </View>
      )}

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 60 : 0}
      >
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>

        {/* ── Profile card ── */}
        <View style={s.profileCard}>

          {/* Avatar + info row */}
          <View style={s.avatarRow}>
            <View style={{ position: 'relative' }}>
              <View style={s.avatarRing}>
                <View style={[s.avatarCircle, avatarConfig ? { backgroundColor: avatarBackground } : null]}>
                  {avatarConfig
                    ? <Avatar config={avatarConfig} background={avatarBackground} size={60} />
                    : <Text style={{ fontSize: 36 }}>{mascotEmoji}</Text>}
                </View>
              </View>
              <TouchableOpacity
                onPress={() => router.push('/profile/edit-avatar' as never)}
                style={s.avatarEditBtn}
                activeOpacity={0.8}
              >
                <Text style={{ fontSize: 13 }}>✏️</Text>
              </TouchableOpacity>
            </View>

            <View style={{ flex: 1 }}>
              <View style={s.nameRow}>
                <Text style={s.nameText} numberOfLines={1}>{profile?.name ?? ''}</Text>
                <View style={s.levelBadge}>
                  <Text style={s.levelBadgeText}>⭐ Level {profile?.stats.level ?? 1}</Text>
                </View>
              </View>
              <View style={s.mascotRow}>
                <Text style={{ fontSize: 14 }}>{mascotEmoji}</Text>
                <Text style={s.mascotRowLabel}>{t('profile.mascotFriend', { mascot: mascotName })}</Text>
              </View>
              <Text style={s.memberSince}>
                {t('profile.onMigoSince', { date: profile ? formatMemberSince(profile.stats.memberSince) : '' })}
              </Text>
            </View>
          </View>

          {/* Bio */}
          <View style={s.bioSection}>
            {editingBio ? (
              <>
                <TextInput
                  style={s.bioInput}
                  value={bioText}
                  onChangeText={setBioText}
                  maxLength={100}
                  placeholder={t('profile.bioPlaceholder')}
                  placeholderTextColor={Colors.gray[400]}
                  autoFocus
                />
                <Text style={s.bioCounter}>{bioText.length}/100</Text>
                <View style={s.bioButtons}>
                  <TouchableOpacity
                    onPress={() => { setEditingBio(false); setBioText(profile?.bio ?? ''); }}
                    style={s.bioCancelBtn}
                  >
                    <Text style={s.bioCancelText}>{t('profile.cancelBio')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => void handleSaveBio()}
                    style={s.bioSaveBtn}
                    disabled={savingBio}
                  >
                    {savingBio
                      ? <ActivityIndicator color="#fff" size="small" />
                      : <Text style={s.bioSaveBtnText}>{t('profile.saveBio')}</Text>}
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <TouchableOpacity onPress={() => setEditingBio(true)} style={s.bioDisplayRow} activeOpacity={0.7}>
                <Text style={[s.bioText, !profile?.bio && s.bioPlaceholder]} numberOfLines={2}>
                  {profile?.bio || t('profile.bioPlaceholder')}
                </Text>
                <Text style={{ fontSize: 16, marginLeft: 8 }}>✏️</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Interests */}
          <View style={s.interestsRow}>
            {(profile?.interests ?? []).map(key => {
              const { emoji, label } = getInterestDisplay(key);
              return (
                <View key={key} style={s.interestPill}>
                  <Text style={s.interestPillText}>{emoji} {label}</Text>
                </View>
              );
            })}
            <TouchableOpacity
              onPress={() => { setPendingInterests(profile?.interests ?? []); setCustomText(''); setCustomError(''); setEditingInterests(true); }}
              style={s.editInterestsBtn}
            >
              <Text style={s.editInterestsBtnText}>{t('profile.editInterests')}</Text>
            </TouchableOpacity>
          </View>

          {/* Stats */}
          <View style={s.statsRow}>
            <StatCol value={profile?.stats.totalPosts   ?? 0} label="Posts" />
            <View style={s.statDivider} />
            <StatCol value={profile?.stats.totalFriends ?? 0} label="Friends" />
            <View style={s.statDivider} />
            <StatCol value={profile?.stats.totalBadges  ?? 0} label="Badges" />
          </View>
        </View>

        {/* ── Tabs ── */}
        <View style={s.tabsRow}>
          {(['posts', 'friends', 'memories'] as const).map(tab => (
            <TouchableOpacity key={tab} onPress={() => setActiveTab(tab)} style={s.tab}>
              <Text style={[s.tabLabel, activeTab === tab && s.tabLabelActive]}>
                {t(`profile.tabs.${tab}`)}
              </Text>
              {activeTab === tab && <View style={s.tabUnderline} />}
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Tab content ── */}
        {activeTab === 'posts'    && <PostsTab    posts={posts}       t={t} onSelect={setSelectedPost} />}
        {activeTab === 'friends'  && <FriendsTab  friends={friends}   t={t} />}
        {activeTab === 'memories' && <MemoriesTab memories={memories} t={t} />}

      </ScrollView>
      </KeyboardAvoidingView>

      {/* ── Settings modal ── */}
      <Modal
        visible={settingsOpen}
        animationType="slide"
        transparent
        onRequestClose={() => { setSettingsOpen(false); setConfirmSignOut(false); }}
      >
        <View style={s.sheetOverlay}>
          <View style={s.sheet}>
            <View style={s.sheetHeader}>
              <Text style={s.sheetTitle}>{t('profile.settings.title')}</Text>
              <TouchableOpacity onPress={() => { setSettingsOpen(false); setConfirmSignOut(false); }} style={s.sheetCloseBtn}>
                <Text style={s.sheetCloseBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            <Text style={s.settingGroupLabel}>{t('profile.settings.language')}</Text>
            <View style={s.pillRow}>
              {(['en', 'fr'] as const).map(lang => (
                <TouchableOpacity
                  key={lang}
                  onPress={() => void setLanguage(lang)}
                  style={[s.settingPill, language === lang && s.settingPillActive]}
                >
                  <Text style={[s.settingPillText, language === lang && s.settingPillTextActive]}>
                    {lang === 'en' ? '🇬🇧 English' : '🇫🇷 Français'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={s.settingGroupLabel}>{t('profile.settings.readToMe')}</Text>
            <View style={s.pillRow}>
              {([true, false] as const).map(val => (
                <TouchableOpacity
                  key={String(val)}
                  onPress={() => void handleTogglePreReader(val)}
                  style={[s.settingPill, preReader === val && s.settingPillActive]}
                >
                  <Text style={[s.settingPillText, preReader === val && s.settingPillTextActive]}>
                    {val ? 'On' : 'Off'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={s.settingGroupLabel}>{t('profile.settings.about')}</Text>
            <Text style={s.settingMeta}>Version 1.0.0</Text>
            <TouchableOpacity style={s.settingLinkRow}>
              <Text style={s.settingLinkText}>{t('profile.settings.privacyPolicy')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.settingLinkRow}>
              <Text style={s.settingLinkText}>{t('profile.settings.termsOfService')}</Text>
            </TouchableOpacity>

            {confirmSignOut ? (
              <View style={s.confirmBox}>
                <Text style={s.confirmText}>{t('profile.settings.signOutConfirm')}</Text>
                <View style={s.confirmRow}>
                  <TouchableOpacity
                    onPress={() => setConfirmSignOut(false)}
                    style={s.confirmCancelBtn}
                  >
                    <Text style={s.confirmCancelText}>{t('common.back')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => void doSignOut()}
                    style={s.confirmSignOutBtn}
                  >
                    <Text style={s.confirmSignOutText}>{t('profile.settings.signOutConfirmButton')}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity onPress={handleSignOut} style={s.signOutBtn}>
                <Text style={s.signOutBtnText}>{t('profile.settings.signOut')}</Text>
              </TouchableOpacity>
            )}

            {__DEV__ && (
              <TouchableOpacity
                onPress={async () => {
                  await AsyncStorage.multiRemove([
                    'authToken', 'childToken', 'childProfile',
                    'pendingParentEmail', 'preReader',
                  ]);
                  router.replace('/enroll' as never);
                }}
                style={s.devResetBtn}
              >
                <Text style={s.devResetBtnText}>{t('profile.settings.devReset')}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>

      {/* ── Interests modal ── */}
      <Modal
        visible={editingInterests}
        animationType="slide"
        transparent
        onRequestClose={() => setEditingInterests(false)}
      >
        <View style={s.sheetOverlay}>
          <View style={s.sheet}>
            <View style={s.sheetHeader}>
              <Text style={s.sheetTitle}>Update your interests ✏️</Text>
              <TouchableOpacity onPress={() => setEditingInterests(false)} style={s.sheetCloseBtn}>
                <Text style={s.sheetCloseBtnText}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={s.interestsGrid}>
                {INTERESTS.map(({ key, emoji, label }) => {
                  const selected = pendingInterests.includes(key);
                  return (
                    <TouchableOpacity
                      key={key}
                      onPress={() => setPendingInterests(prev =>
                        prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key],
                      )}
                      style={[s.interestGridCell, selected && s.interestGridCellSelected]}
                      activeOpacity={0.7}
                    >
                      <Text style={s.interestGridEmoji}>{emoji}</Text>
                      <Text style={[s.interestGridLabel, selected && s.interestGridLabelSelected]}>
                        {label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {/* Custom interests already added */}
              {pendingInterests.filter(k => !INTERESTS.find(i => i.key === k)).length > 0 && (
                <View style={s.customAddedSection}>
                  <Text style={s.customSectionLabel}>Your custom interests</Text>
                  <View style={s.customAddedRow}>
                    {pendingInterests
                      .filter(k => !INTERESTS.find(i => i.key === k))
                      .map(key => (
                        <TouchableOpacity
                          key={key}
                          onPress={() => setPendingInterests(prev => prev.filter(k2 => k2 !== key))}
                          style={s.customPill}
                        >
                          <Text style={s.customPillText}>✨ {key}</Text>
                          <Text style={s.customPillRemove}>✕</Text>
                        </TouchableOpacity>
                      ))}
                  </View>
                </View>
              )}

              {/* Add your own */}
              <View style={s.customSection}>
                <Text style={s.customSectionLabel}>Or add your own ✏️</Text>
                <View style={s.customRow}>
                  <TextInput
                    style={s.customInput}
                    value={customText}
                    onChangeText={t => { setCustomText(t); setCustomError(''); }}
                    placeholder="e.g. skateboarding"
                    placeholderTextColor={Colors.gray[400]}
                    maxLength={30}
                    returnKeyType="done"
                    onSubmitEditing={() => void handleAddCustomInterest()}
                    editable={!checkingCustom}
                  />
                  <TouchableOpacity
                    onPress={() => void handleAddCustomInterest()}
                    style={[s.customAddBtn, (!customText.trim() || checkingCustom) && s.customAddBtnDisabled]}
                    disabled={!customText.trim() || checkingCustom}
                  >
                    {checkingCustom
                      ? <ActivityIndicator color="#fff" size="small" style={{ width: 36 }} />
                      : <Text style={s.customAddBtnText}>Add</Text>}
                  </TouchableOpacity>
                </View>
                {customError ? <Text style={s.customError}>{customError}</Text> : null}
              </View>

              <TouchableOpacity
                onPress={() => void handleSaveInterests()}
                style={[s.bioSaveBtn, { marginBottom: 16 }]}
                disabled={savingInterests}
              >
                {savingInterests
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={s.bioSaveBtnText}>Save interests</Text>}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── Post detail modal ── */}
      {selectedPost && (
        <Modal
          visible
          animationType="fade"
          transparent
          onRequestClose={() => setSelectedPost(null)}
        >
          <View style={s.postModalOverlay}>
            <View style={s.postModalCard}>
              <Text style={s.postModalContent}>{selectedPost.content}</Text>
              {selectedPost.mood && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <Text style={{ fontSize: 20 }}>{MOOD_EMOJI[selectedPost.mood] ?? '😐'}</Text>
                  <Text style={{ fontSize: 14, color: Colors.gray[500] }}>{selectedPost.mood}</Text>
                </View>
              )}
              {selectedPost.scene_emojis && (
                <Text style={{ fontSize: 24, marginBottom: 8 }}>{selectedPost.scene_emojis}</Text>
              )}
              <Text style={{ fontSize: 13, color: Colors.gray[400], marginBottom: 12 }}>
                {formatRelativeDate(selectedPost.created_at)}
              </Text>
              <Text style={{ fontSize: 16, marginBottom: 20 }}>💛 {selectedPost.reaction_count}</Text>
              <TouchableOpacity onPress={() => setSelectedPost(null)} style={s.postModalCloseBtn}>
                <Text style={s.postModalCloseBtnText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.bg },

  // Top bar
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F0EFF8',
  },
  logoRow: { flexDirection: 'row' },
  logoMi:  { fontSize: 20, fontWeight: '700', color: '#2C2C2A' },
  logoGo:  { fontSize: 20, fontWeight: '700', color: Colors.purple },
  topTitle:{ fontSize: 15, fontWeight: '700', color: '#2C2C2A' },
  settingsBtn: { width: 40, height: 40, alignItems: 'flex-end', justifyContent: 'center' },

  // Toast
  toast: {
    position: 'absolute', top: 70, left: 20, right: 20,
    backgroundColor: '#2C2C2A', borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 10, zIndex: 999,
  },
  toastText: { color: '#fff', fontSize: 13, fontWeight: '600', textAlign: 'center' },

  scroll: { paddingBottom: 48 },

  // Profile card
  profileCard: {
    backgroundColor: '#fff', borderRadius: 20, margin: 14,
    shadowColor: Colors.purple, shadowOpacity: 0.07, shadowRadius: 14, elevation: 3,
    padding: 20,
  },

  // Avatar
  avatarRow:    { flexDirection: 'row', alignItems: 'center', gap: 16 },
  avatarRing:   {
    width: 76, height: 76, borderRadius: 38,
    borderWidth: 3, borderColor: Colors.purple, padding: 3,
  },
  avatarCircle: {
    flex: 1, borderRadius: 35,
    backgroundColor: '#EEEDFE', alignItems: 'center', justifyContent: 'center',
  },

  avatarEditBtn: {
    position: 'absolute', bottom: 0, right: 0,
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 4, elevation: 3,
    borderWidth: 1, borderColor: '#F0EFF8',
  },

  // Name / level
  nameRow:       { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  nameText:      { fontSize: 20, fontWeight: '700', color: '#2C2C2A', flex: 1 },
  levelBadge:    { backgroundColor: Colors.purple, borderRadius: 99, paddingHorizontal: 8, paddingVertical: 3 },
  levelBadgeText:{ color: '#fff', fontSize: 11, fontWeight: '700' },

  mascotRow:     { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 },
  mascotRowLabel:{ fontSize: 12, color: Colors.gray[500] },
  memberSince:   { fontSize: 11, color: Colors.gray[400] },

  // Bio
  bioSection:    { marginTop: 14 },
  bioDisplayRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  bioText:       { fontSize: 14, color: '#2C2C2A', flex: 1, lineHeight: 20 },
  bioPlaceholder:{ color: Colors.gray[400], fontStyle: 'italic' },
  bioInput:      {
    borderWidth: 1, borderColor: Colors.gray[300], borderRadius: 10,
    padding: 10, fontSize: 14, color: '#2C2C2A',
  },
  bioCounter:    { fontSize: 11, color: Colors.gray[400], textAlign: 'right', marginTop: 4 },
  bioButtons:    { flexDirection: 'row', gap: 8, marginTop: 8, justifyContent: 'flex-end' },
  bioCancelBtn:  { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 99, backgroundColor: Colors.gray[200] },
  bioCancelText: { fontSize: 13, color: Colors.gray[600] },
  bioSaveBtn:    {
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 99,
    backgroundColor: Colors.purple, alignItems: 'center',
  },
  bioSaveBtnText:{ fontSize: 13, color: '#fff', fontWeight: '700' },

  // Interests row
  interestsRow:       { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  interestPill:       { backgroundColor: '#EEEDFE', borderRadius: 99, paddingHorizontal: 10, paddingVertical: 5 },
  interestPillText:   { fontSize: 12, color: Colors.purple, fontWeight: '600' },
  editInterestsBtn:   { paddingHorizontal: 10, paddingVertical: 5 },
  editInterestsBtnText:{ fontSize: 12, color: Colors.gray[500] },

  // Stats
  statsRow: {
    flexDirection: 'row', marginTop: 14, paddingTop: 14,
    borderTopWidth: 1, borderTopColor: '#F8F7FF',
  },
  statCol:    { flex: 1, alignItems: 'center' },
  statValue:  { fontSize: 20, fontWeight: '700', color: Colors.purple },
  statLabel:  { fontSize: 11, color: Colors.gray[400], marginTop: 2 },
  statDivider:{ width: 1, backgroundColor: Colors.gray[200] },

  // Tabs
  tabsRow: {
    flexDirection: 'row', backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: Colors.gray[200], marginTop: 4,
  },
  tab:          { flex: 1, alignItems: 'center', paddingVertical: 12, position: 'relative' },
  tabLabel:     { fontSize: 13, color: Colors.gray[500], fontWeight: '600' },
  tabLabelActive:{ color: Colors.purple },
  tabUnderline: {
    position: 'absolute', bottom: 0, left: 16, right: 16,
    height: 2.5, backgroundColor: Colors.purple, borderRadius: 2,
  },

  // Posts grid
  postsGrid:        { flexDirection: 'row', flexWrap: 'wrap', gap: 3, padding: 14 },
  postCell:         { width: POST_CELL_SIZE, height: POST_CELL_SIZE, borderRadius: 10, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  postCellEmojis:   { fontSize: 24 },
  postCellBottom:   {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', padding: 4,
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
  postCellMoodEmoji:{ fontSize: 12 },
  postCellTime:     { fontSize: 10, color: Colors.gray[700], flex: 1, marginLeft: 2 },

  // Friends list
  friendsList: { padding: 14, gap: 10 },
  friendCard:  {
    backgroundColor: '#fff', borderRadius: 16, padding: 14,
    flexDirection: 'row', alignItems: 'center',
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 2,
  },
  friendAvatar:      { width: 44, height: 44, borderRadius: 22, backgroundColor: '#EEEDFE', alignItems: 'center', justifyContent: 'center' },
  friendAvatarEmoji: { fontSize: 22 },
  friendInfo:        { flex: 1, marginLeft: 12 },
  friendName:        { fontSize: 14, fontWeight: '700', color: '#2C2C2A' },
  friendLevel:       { fontSize: 12, color: Colors.gray[500], marginBottom: 6, marginTop: 1 },
  friendXp:          { fontSize: 10, color: Colors.gray[400], textAlign: 'right', marginTop: 2 },
  chatBtn:           { backgroundColor: Colors.purple, borderRadius: 99, paddingHorizontal: 12, paddingVertical: 7, marginLeft: 10 },
  chatBtnText:       { fontSize: 12, color: '#fff', fontWeight: '700' },

  // Progress bar
  progressTrack: { backgroundColor: Colors.gray[200], borderRadius: 99, overflow: 'hidden', width: '100%', height: 6 },
  progressFill:  { borderRadius: 99, height: '100%', backgroundColor: Colors.purple },

  // Memories timeline
  timeline:          { padding: 14 },
  memoryRow:         { flexDirection: 'row', marginBottom: 0 },
  memoryIconCol:     { alignItems: 'center', marginRight: 12, width: 36 },
  memoryIconCircle:  { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  memoryIcon:        { fontSize: 18 },
  timelineLine:      { width: 1, flex: 1, backgroundColor: Colors.gray[200], minHeight: 20, marginTop: 4 },
  memoryContent:     { flex: 1, paddingBottom: 20 },
  memoryText:        { fontSize: 13, fontWeight: '700', color: '#2C2C2A', lineHeight: 18 },
  memoryDate:        { fontSize: 11, color: Colors.gray[400], marginTop: 2 },

  // Empty states
  emptyState:   { alignItems: 'center', paddingHorizontal: 20, paddingVertical: 40 },
  emptyEmoji:   { fontSize: 40, marginBottom: 12 },
  emptyTitle:   { fontSize: 15, fontWeight: '700', color: '#2C2C2A', marginBottom: 6, textAlign: 'center' },
  emptySubtitle:{ fontSize: 13, color: Colors.gray[500], textAlign: 'center', marginBottom: 16 },
  emptyBtn:     { backgroundColor: Colors.purple, borderRadius: 99, paddingHorizontal: 20, paddingVertical: 12 },
  emptyBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  // Bottom sheet (settings + interests)
  sheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet:        {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: 24, paddingTop: 20, paddingBottom: 40, maxHeight: '88%',
  },
  sheetHeader:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  sheetTitle:      { fontSize: 18, fontWeight: '800', color: '#2C2C2A' },
  sheetCloseBtn:   { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.gray[100], alignItems: 'center', justifyContent: 'center' },
  sheetCloseBtnText:{ fontSize: 16, color: Colors.gray[600] },

  settingGroupLabel:{
    fontSize: 11, fontWeight: '700', color: Colors.gray[500],
    textTransform: 'uppercase', letterSpacing: 1, marginTop: 16, marginBottom: 8,
  },
  pillRow:           { flexDirection: 'row', gap: 10 },
  settingPill:       { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 12, borderWidth: 2, borderColor: Colors.gray[300], backgroundColor: '#fff' },
  settingPillActive: { borderColor: Colors.purple, backgroundColor: Colors.purple },
  settingPillText:   { fontSize: 14, fontWeight: '600', color: Colors.gray[600] },
  settingPillTextActive:{ color: '#fff' },

  settingMeta:     { fontSize: 12, color: Colors.gray[500], marginBottom: 4, marginTop: 4 },
  settingLinkRow:  { paddingVertical: 8 },
  settingLinkText: { fontSize: 14, color: Colors.purple },

  signOutBtn:     { borderWidth: 1, borderColor: Colors.red, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 20 },
  signOutBtnText: { color: Colors.red, fontWeight: '700', fontSize: 15 },

  confirmBox:        { marginTop: 20, backgroundColor: '#FFF5F5', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#FFCCCC' },
  confirmText:       { fontSize: 14, color: '#2C2C2A', marginBottom: 14, lineHeight: 20 },
  confirmRow:        { flexDirection: 'row', gap: 10 },
  confirmCancelBtn:  { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 99, backgroundColor: Colors.gray[200] },
  confirmCancelText: { fontSize: 14, fontWeight: '600', color: Colors.gray[700] },
  confirmSignOutBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 99, backgroundColor: Colors.red },
  confirmSignOutText:{ fontSize: 14, fontWeight: '700', color: '#fff' },
  devResetBtn:    { paddingVertical: 12, alignItems: 'center', marginTop: 8 },
  devResetBtnText:{ fontSize: 13, color: Colors.gray[500] },

  // Interests grid
  interestsGrid:           { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  interestGridCell:        { width: '30%', alignItems: 'center', paddingVertical: 12, borderRadius: 14, borderWidth: 2, borderColor: Colors.gray[200], backgroundColor: '#fff' },
  interestGridCellSelected:{ borderColor: Colors.purple, backgroundColor: '#EEEDFE' },
  interestGridEmoji:       { fontSize: 28, marginBottom: 4 },
  interestGridLabel:       { fontSize: 12, fontWeight: '600', color: Colors.gray[600] },
  interestGridLabelSelected:{ color: Colors.purple },

  // Custom interest entry
  customAddedSection: { marginBottom: 12 },
  customSection:      { marginBottom: 16 },
  customSectionLabel: { fontSize: 12, fontWeight: '700', color: Colors.gray[500], marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  customAddedRow:     { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  customPill:         { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#EEEDFE', borderRadius: 99, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1.5, borderColor: Colors.purple },
  customPillText:     { fontSize: 13, color: Colors.purple, fontWeight: '600' },
  customPillRemove:   { fontSize: 11, color: Colors.purple, fontWeight: '700', opacity: 0.6 },
  customRow:          { flexDirection: 'row', gap: 8 },
  customInput:        { flex: 1, borderWidth: 1.5, borderColor: Colors.gray[300], borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#2C2C2A', backgroundColor: '#fff' },
  customAddBtn:       { backgroundColor: Colors.purple, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10, justifyContent: 'center', alignItems: 'center' },
  customAddBtnDisabled:{ opacity: 0.45 },
  customAddBtnText:   { color: '#fff', fontWeight: '700', fontSize: 14 },
  customError:        { fontSize: 12, color: Colors.red, marginTop: 6, lineHeight: 16 },

  // Post detail modal
  postModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  postModalCard:    { backgroundColor: '#fff', borderRadius: 20, padding: 24, width: '100%' },
  postModalContent: { fontSize: 16, lineHeight: 25, color: '#2C2C2A', marginBottom: 16 },
  postModalCloseBtn:{ backgroundColor: Colors.purple, borderRadius: 99, paddingHorizontal: 32, paddingVertical: 14, alignItems: 'center' },
  postModalCloseBtnText:{ color: '#fff', fontWeight: '800', fontSize: 15 },
});
