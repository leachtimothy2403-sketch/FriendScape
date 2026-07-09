import {
  View, Text, SafeAreaView, ScrollView, TouchableOpacity,
  ActivityIndicator, StyleSheet, Image, Alert,
} from 'react-native';
import { useState, useEffect, useCallback } from 'react';
import { useLocalSearchParams, router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import {
  friendNetwork, myFriendsApi, resolveAvatarUrl,
  FriendWithStatus, FriendWithRelationship, FriendPost,
} from '@/services/api';
import { Colors } from '@/constants/theme';
import { useLanguageStore } from '@/store/languageStore';
import { getDisplayName } from '@/utils/displayName';

// Cover colour per friend name
const COVER_COLOR: Record<string, string> = {
  Mia: '#EEEDFE', Jake: '#E1F5EE', Zara: '#FAECE7',
  'Coach Mike': '#E1F5EE', 'Ms. Luna': '#EEF4FF',
  'Léa': '#FCEEFF', Tom: '#E1F5EE', 'Chloé': '#F0F8FF',
  Hugo: '#FFF0F0', Nico: '#E1F5EE', Camille: '#FFF0F5',
  Luca: '#F0F4FF', Sofia: '#FAECE7', 'Coach Sarah': '#E0FFE8',
  'Prof Max': '#F0F0FF', Miga: '#F0EEFF',
};

const LEVEL_XP_AT: Record<number, number> = { 1: 100, 2: 300, 3: 600, 4: 1000, 5: 1500 };

function firstEmoji(str: string | null | undefined) { return str ? ([...str][0] ?? '🌟') : '🌟'; }
function fmtDate(iso: string, lang: string) {
  const locale = lang === 'fr' ? 'fr-FR' : 'en-GB';
  return new Date(iso).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
}

function RelBadge({ type, via, t, gender, viaGender }: { type?: string; via?: string; t: (key: string, opts?: Record<string, unknown>) => string; gender?: string; viaGender?: string }) {
  const isFeminine = gender === 'girl' || gender === 'female';
  if (via) {
    const viaIsFeminine = viaGender === 'girl' || viaGender === 'female';
    return <View style={s.relBadgePurple}><Text style={s.relBadgeText}>{t(viaIsFeminine ? 'friendProfile.friendOfF' : 'friendProfile.friendOfM', { name: via })}</Text></View>;
  }
  if (type === 'star' || type === 'is_star_friend') return <View style={s.relBadgeOrange}><Text style={s.relBadgeText}>⭐ {t(isFeminine ? 'friendProfile.starFriendF' : 'friendProfile.starFriendM')}</Text></View>;
  return <View style={s.relBadgeGreen}><Text style={s.relBadgeText}>{t(isFeminine ? 'friendProfile.yourFriendF' : 'friendProfile.yourFriendM')}</Text></View>;
}

function NetworkCard({
  f, token, onAdd,
}: { f: FriendWithRelationship; token: string | null; onAdd: (id: string) => void }) {
  const [adding, setAdding] = useState(false);
  const coverColor = COVER_COLOR[f.name] ?? '#EEEDFE';

  async function handleAdd() {
    if (!token) return;
    setAdding(true);
    await onAdd(f.id);
    setAdding(false);
  }

  return (
    <TouchableOpacity
      onPress={() => router.push(`/friend/${f.id}` as never)}
      activeOpacity={0.8}
      style={s.networkCard}
    >
      <View style={[s.networkAvatar, { backgroundColor: coverColor }]}>
        {f.avatar_url
          ? <Image source={{ uri: resolveAvatarUrl(f.avatar_url) }} style={{ width: 46, height: 46, borderRadius: 23 }} />
          : <Text style={{ fontSize: 24 }}>{firstEmoji(f.cover_emojis)}</Text>}
      </View>
      <Text style={s.networkName} numberOfLines={1}>{f.name}</Text>
      <Text style={s.networkRel} numberOfLines={1}>{f.relationship_type?.replace('_', ' ')}</Text>
      {f.already_added ? (
        <Text style={s.networkAdded}>✓</Text>
      ) : token ? (
        <TouchableOpacity onPress={handleAdd} style={s.networkAddBtn} disabled={adding}>
          {adding ? <ActivityIndicator size="small" color={Colors.purple} /> : <Text style={s.networkAddText}>+ Add</Text>}
        </TouchableOpacity>
      ) : null}
    </TouchableOpacity>
  );
}

export default function FriendProfileScreen() {
  const { t } = useTranslation();
  const { language } = useLanguageStore();
  const isFr = language === 'fr';
  const { friendId, via } = useLocalSearchParams<{ friendId: string; via?: string }>();

  const [friend,              setFriend]             = useState<FriendWithStatus | null>(null);
  const [network,             setNetwork]            = useState<FriendWithRelationship[]>([]);
  const [posts,               setPosts]              = useState<FriendPost[]>([]);
  const [token,               setToken]              = useState<string | null>(null);
  const [loading,             setLoading]            = useState(true);
  const [adding,              setAdding]             = useState(false);
  const [isAdded,             setIsAdded]            = useState(false);
  const [referringFriendName, setReferringFriendName] = useState<string | null>(null);
  const [referringFriendGender, setReferringFriendGender] = useState<string | null>(null);
  const [removing,             setRemoving]           = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const tok = await AsyncStorage.getItem('childToken');
      if (!cancelled) setToken(tok);

      try {
        const [friendRes, netRes] = await Promise.all([
          tok ? friendNetwork.getWithStatus(tok, friendId, language) : friendNetwork.getPublic(friendId, language),
          friendNetwork.getNetwork(friendId, tok ?? undefined),
        ]);

        const fr = tok
          ? (friendRes as Awaited<ReturnType<typeof friendNetwork.getWithStatus>>).data.friend
          : { ...(friendRes as Awaited<ReturnType<typeof friendNetwork.getPublic>>).data.friend, is_added: false };

        if (!cancelled) {
          const frTyped = fr as FriendWithStatus;
          setFriend(frTyped);
          setIsAdded(frTyped.is_added ?? false);
          setReferringFriendName(frTyped.referringFriendName ?? null);
          setReferringFriendGender(frTyped.referringFriendGender ?? null);
          setNetwork(netRes.data.friends);
        }

        if (tok && !cancelled) {
          const postsRes = await friendNetwork.getPosts(tok, friendId).catch(() => null);
          if (postsRes && !cancelled) setPosts(postsRes.data.posts);
        }
      } catch (e) {
        console.error('[friend-profile] load error:', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [friendId]);

  const handleAdd = useCallback(async () => {
    if (!token || adding) return;
    setAdding(true);
    try {
      await friendNetwork.addFriend(token, friendId, via ?? undefined);
      setIsAdded(true);
      // refresh friendship stats
      const res = await friendNetwork.getWithStatus(token, friendId, language);
      setFriend(res.data.friend);
    } catch (e) {
      console.error('[friend-profile] add error:', e);
    } finally {
      setAdding(false);
    }
  }, [token, friendId, via, adding]);

  function confirmRemove() {
    Alert.alert(
      t('friendProfile.removeFriendTitle', { defaultValue: 'Remove friend?' }),
      t('friendProfile.removeFriendBody', { name: getDisplayName(friend?.name ?? '', isFr), defaultValue: `Are you sure you want to remove ${friend?.name} as a friend? Your conversation history will be kept in case you add them again.` }),
      [
        { text: t('common.cancel', { defaultValue: 'Cancel' }), style: 'cancel' },
        { text: t('friendProfile.removeFriendConfirm', { defaultValue: 'Remove' }), style: 'destructive', onPress: () => void handleRemove() },
      ],
    );
  }

  async function handleRemove() {
    if (!token) return;
    setRemoving(true);
    try {
      await myFriendsApi.remove(token, friendId);
      setIsAdded(false);
    } catch (e) {
      console.error('[friend-profile] remove error:', e);
    } finally {
      setRemoving(false);
    }
  }

  const handleNetworkAdd = useCallback(async (targetId: string) => {
    if (!token) return;
    try {
      await friendNetwork.addFriend(token, targetId, friendId);
      setNetwork(prev => prev.map(f => f.id === targetId ? { ...f, already_added: true } : f));
    } catch {}
  }, [token, friendId]);

  if (loading || !friend) {
    return (
      <SafeAreaView style={s.screen}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBar}>
          <Text style={s.backArrow}>←</Text>
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          {loading ? <ActivityIndicator color={Colors.purple} size="large" /> : <Text style={s.notFound}>Friend not found</Text>}
        </View>
      </SafeAreaView>
    );
  }

  const coverColor = COVER_COLOR[friend.name] ?? '#EEEDFE';
  const mainEmoji  = firstEmoji(friend.cover_emojis);
  const xpFraction = friend.friendship
    ? Math.min(1, (friend.friendship.xp - (LEVEL_XP_AT[(friend.friendship.level ?? 1) - 1] ?? 0)) / ((LEVEL_XP_AT[friend.friendship.level ?? 1] ?? 500) - (LEVEL_XP_AT[(friend.friendship.level ?? 1) - 1] ?? 0)))
    : 0;

  return (
    <SafeAreaView style={s.screen}>
      {/* Back button floating */}
      <TouchableOpacity onPress={() => router.back()} style={s.backBar}>
        <Text style={s.backArrow}>←</Text>
      </TouchableOpacity>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Cover */}
        <View style={[s.cover, { backgroundColor: coverColor }]}>
          <Text style={s.coverEmojis}>{friend.cover_emojis ?? mainEmoji}</Text>
        </View>

        {/* Profile info */}
        <View style={s.profileSection}>
          <View style={[s.avatarCircle, { backgroundColor: coverColor }]}>
            {friend.avatar_url
              ? <Image source={{ uri: resolveAvatarUrl(friend.avatar_url) }} style={{ width: 70, height: 70, borderRadius: 35 }} />
              : <Text style={{ fontSize: 36 }}>{mainEmoji}</Text>}
          </View>

          <Text style={s.friendName}>{getDisplayName(friend.name, isFr)}</Text>

          <View style={s.badgeRow}>
            {isAdded && <RelBadge type="your_friend" t={t} gender={friend.gender} />}
            {referringFriendName && !isAdded && <RelBadge via={referringFriendName} t={t} viaGender={referringFriendGender ?? undefined} />}
            {friend.is_star_friend && <RelBadge type="star" t={t} gender={friend.gender} />}
          </View>

          <Text style={s.bio}>{friend.bio}</Text>

          {(friend.interests as string[] | undefined)?.length ? (
            <View style={s.interestRow}>
              {(friend.interests as string[]).slice(0, 5).map(i => (
                <View key={i} style={s.interestTag}><Text style={s.interestText}>{i}</Text></View>
              ))}
            </View>
          ) : null}
        </View>

        {/* Friendship stats card */}
        {isAdded && friend.friendship ? (
          <View style={s.statsCard}>
            <Text style={s.statsTitle}>{t('friends.yourFriendshipWith', { name: getDisplayName(friend.name, isFr) })}</Text>
            <Text style={s.statsLevel}>{t(`friends.levelNames.${friend.friendship.level}`)}</Text>
            <View style={s.xpBar}><View style={[s.xpFill, { width: `${Math.round(xpFraction * 100)}%` as `${number}%` }]} /></View>
            <Text style={s.statsXP}>{friend.friendship.xp} XP</Text>
            <View style={s.statsRow}>
              <View style={s.statItem}><Text style={s.statValue}>{friend.friendship.messagesCount}</Text><Text style={s.statLabel}>Messages</Text></View>
              <View style={s.statItem}>
                <Text style={s.statValue}>{fmtDate(friend.friendship.activatedAt, language)}</Text>
                <Text style={s.statLabel}>{t('friends.friendsSince', { date: '' }).replace(' ', '')}</Text>
              </View>
            </View>
          </View>
        ) : null}

        {/* Action button */}
        <View style={s.actionRow}>
          {isAdded ? (
            <>
              <TouchableOpacity onPress={() => router.push(`/dm/${friendId}` as never)} style={s.btnMessage}>
                <Text style={s.btnMessageText}>{t('friends.messageFriend', { name: getDisplayName(friend.name, isFr) })}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={confirmRemove} style={s.btnRemoveLink} disabled={removing}>
                {removing
                  ? <ActivityIndicator size="small" color={Colors.gray[400]} />
                  : <Text style={s.btnRemoveLinkText}>{t('friendProfile.removeFriend', { defaultValue: 'Remove friend' })}</Text>}
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity onPress={handleAdd} style={s.btnAdd} disabled={adding}>
              {adding
                ? <ActivityIndicator color="#fff" />
                : <Text style={s.btnAddText}>{t('friends.addFriend', { name: getDisplayName(friend.name, isFr) })}</Text>}
            </TouchableOpacity>
          )}
        </View>

        {/* Posts grid */}
        {posts.length > 0 && (
          <View style={s.postsSection}>
            <Text style={s.sectionTitle}>Recent posts</Text>
            <View style={s.postsGrid}>
              {posts.map(p => (
                <View key={p.id} style={[s.postTile, { backgroundColor: coverColor }]}>
                  <Text style={{ fontSize: 28, textAlign: 'center' }}>{firstEmoji(p.scene_emojis)}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Friend's network */}
        {network.length > 0 && (
          <View style={s.networkSection}>
            <Text style={s.sectionTitle}>{t('friends.friendNetwork', { name: getDisplayName(friend.name, isFr) })}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 14, gap: 10 }}>
              {network.map(f => (
                <NetworkCard key={f.id} f={f} token={token} onAdd={handleNetworkAdd} />
              ))}
            </ScrollView>
          </View>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen:    { flex: 1, backgroundColor: Colors.bg },
  backBar:   { position: 'absolute', top: 52, left: 16, zIndex: 10, backgroundColor: 'rgba(255,255,255,0.85)', borderRadius: 20, width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  backArrow: { fontSize: 18, color: '#2C2C2A' },
  notFound:  { color: Colors.gray[500], fontSize: 14 },

  cover:       { height: 140, alignItems: 'center', justifyContent: 'center' },
  coverEmojis: { fontSize: 52, letterSpacing: 4 },

  profileSection: { paddingHorizontal: 20, paddingTop: 0, alignItems: 'center' },
  avatarCircle:   { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center', marginTop: -38, borderWidth: 3, borderColor: '#fff', shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 6, elevation: 3 },
  friendName:     { fontSize: 22, fontWeight: '800', color: '#2C2C2A', marginTop: 10, marginBottom: 6 },
  badgeRow:       { flexDirection: 'row', gap: 6, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 10 },
  relBadgePurple: { backgroundColor: Colors.purple + '22', borderRadius: 99, paddingHorizontal: 10, paddingVertical: 4 },
  relBadgeOrange: { backgroundColor: Colors.orange + '22', borderRadius: 99, paddingHorizontal: 10, paddingVertical: 4 },
  relBadgeGreen:  { backgroundColor: Colors.green  + '22', borderRadius: 99, paddingHorizontal: 10, paddingVertical: 4 },
  relBadgeText:   { fontSize: 11, fontWeight: '700', color: '#2C2C2A' },
  aiBadge:        { backgroundColor: Colors.purple + '22', borderRadius: 99, paddingHorizontal: 8, paddingVertical: 3 },
  aiBadgeText:    { fontSize: 10, color: Colors.purple, fontWeight: '700' },
  bio:            { fontSize: 14, color: '#2C2C2A', textAlign: 'center', lineHeight: 21, marginBottom: 10 },
  interestRow:    { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center', marginBottom: 8 },
  interestTag:    { backgroundColor: Colors.purple + '18', borderRadius: 99, paddingHorizontal: 10, paddingVertical: 4 },
  interestText:   { fontSize: 11, color: Colors.purple, fontWeight: '600' },

  statsCard:  { marginHorizontal: 14, marginTop: 14, backgroundColor: '#fff', borderRadius: 18, padding: 18, shadowColor: Colors.purple, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  statsTitle: { fontSize: 12, color: Colors.gray[500], marginBottom: 4 },
  statsLevel: { fontSize: 15, fontWeight: '700', color: '#2C2C2A', marginBottom: 8 },
  xpBar:      { height: 8, backgroundColor: Colors.gray[200], borderRadius: 99, overflow: 'hidden', marginBottom: 4 },
  xpFill:     { height: '100%', backgroundColor: Colors.purple, borderRadius: 99 },
  statsXP:    { fontSize: 11, color: Colors.gray[400], marginBottom: 12 },
  statsRow:   { flexDirection: 'row', gap: 16 },
  statItem:   { flex: 1, alignItems: 'center' },
  statValue:  { fontSize: 13, fontWeight: '700', color: '#2C2C2A' },
  statLabel:  { fontSize: 10, color: Colors.gray[400] },

  actionRow:       { marginHorizontal: 14, marginTop: 16 },
  btnMessage:      { backgroundColor: Colors.purple, borderRadius: 99, paddingVertical: 14, alignItems: 'center' },
  btnMessageText:  { color: '#fff', fontWeight: '800', fontSize: 15 },
  btnAdd:          { backgroundColor: Colors.green, borderRadius: 99, paddingVertical: 14, alignItems: 'center' },
  btnAddText:      { color: '#fff', fontWeight: '800', fontSize: 15 },

  postsSection: { marginHorizontal: 14, marginTop: 20 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: '#2C2C2A', marginBottom: 10 },
  postsGrid:    { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  postTile:     { width: '31.5%', aspectRatio: 1, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },

  networkSection: { marginTop: 20 },
  networkCard:    { width: 80, alignItems: 'center', padding: 6, backgroundColor: '#fff', borderRadius: 12, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
  networkAvatar:  { width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  networkName:    { fontSize: 10, fontWeight: '700', color: '#2C2C2A', textAlign: 'center' },
  networkRel:     { fontSize: 9, color: Colors.gray[400], textAlign: 'center', marginBottom: 4 },
  networkAdded:   { fontSize: 14, color: Colors.green },
  networkAddBtn:  { backgroundColor: Colors.purple + '18', borderRadius: 99, paddingHorizontal: 6, paddingVertical: 3 },
  networkAddText: { fontSize: 10, color: Colors.purple, fontWeight: '700' },

  btnRemoveLink:     { marginTop: 12, alignItems: 'center', paddingVertical: 6 },
  btnRemoveLinkText: { fontSize: 12, color: Colors.gray[400] },
});
