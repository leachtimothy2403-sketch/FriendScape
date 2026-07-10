import {
  View, Text, SafeAreaView, ScrollView, TouchableOpacity,
  ActivityIndicator, TextInput, StyleSheet, Image,
} from 'react-native';
import { useState, useEffect, useCallback } from 'react';
import { router, useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import {
  friends as allFriendsApi,
  myFriendsApi, friendNetwork, childProfileApi,
  mascotAvatars, resolveAvatarUrl,
  MyChildFriend, AiFriendRecord, FriendWithRelationship,
} from '@/services/api';
import { useLanguageStore } from '@/store/languageStore';
import { Colors } from '@/constants/theme';
import MigoLogo from '@/components/MigoLogo';
import { getDisplayName } from '@/utils/displayName';

const COVER_COLOR: Record<string, string> = {
  Mia: '#EEEDFE', Jake: '#E1F5EE', Zara: '#FAECE7',
  'Coach Mike': '#E1F5EE', 'Ms. Luna': '#EEF4FF',
  'Léa': '#FCEEFF', Tom: '#E1F5EE', 'Chloé': '#F0F8FF',
  Hugo: '#FFF0F0', Nico: '#E1F5EE', Camille: '#FFF0F5',
  Luca: '#F0F4FF', Sofia: '#FAECE7', 'Coach Sarah': '#E0FFE8',
  'Prof Max': '#F0F0FF', Miga: '#F0EEFF', Jules: '#FEF3C7',
};

function firstEmoji(str: string | null | undefined) { return str ? ([...str][0] ?? '🌟') : '🌟'; }

const RELATIONSHIP_TYPES = [
  'close_friend', 'interesting_different', 'classmate', 'teammate', 'neighbour', 'online_friend',
] as const;

function relationshipTypeLabel(t: ReturnType<typeof useTranslation>['t'], type: string | null | undefined): string {
  if (!type) return '';
  if ((RELATIONSHIP_TYPES as readonly string[]).includes(type)) {
    return t(`discover.relationshipTypes.${type}`);
  }
  return type.replace(/_/g, ' ');
}

const MASCOT_NAMES: Record<string, string> = {
  miga: 'Miga', pixel: 'Pixel', finn: 'Finn', sage: 'Sage',
};

const EN_TIPS = [
  "Ask me anything about Migo — I'm here to help! 🐉",
  "Got feedback for the team? Tell me and I'll pass it on! 💌",
  "Something not working? Let me know! 🔧",
  "I'm your guide on Migo — tap to chat with me anytime! ✨",
];
const FR_TIPS = [
  "Pose-moi toutes tes questions sur Migo — je suis là ! 🐉",
  "Tu as des idées pour améliorer l'appli ? Dis-le moi ! 💌",
  "Quelque chose ne marche pas ? Parle-moi ! 🔧",
  "Je suis ton guide sur Migo — appuie pour me parler ! ✨",
];

function MigaCard() {
  const language = useLanguageStore((s) => s.language);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [mascotId, setMascotId]   = useState('miga');
  const [tip, setTip]             = useState('');

  useEffect(() => {
    const tips = language === 'fr' ? FR_TIPS : EN_TIPS;
    setTip(tips[Math.floor(Math.random() * tips.length)]);

    async function loadMascot() {
      const profileRaw = await AsyncStorage.getItem('childProfile');
      let id = 'miga';
      if (profileRaw) {
        try { id = (JSON.parse(profileRaw).mascotId || 'miga').toLowerCase(); } catch {}
      }
      setMascotId(id);

      try {
        const res = await mascotAvatars.get();
        const url = res.data.mascots[id];
        if (url) setAvatarUrl(url);
      } catch {}
    }
    void loadMascot();
  }, [language]);

  const name = MASCOT_NAMES[mascotId] ?? 'Miga';

  return (
    <TouchableOpacity
      onPress={() => router.push('/mascot-dm' as never)}
      activeOpacity={0.9}
      style={s.migaCard}
    >
      <View style={s.migaAvatarWrap}>
        {avatarUrl
          ? <Image source={{ uri: avatarUrl }} style={{ width: 56, height: 56, borderRadius: 28 }} />
          : <Text style={{ fontSize: 32 }}>🐉</Text>
        }
      </View>
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text style={s.migaTitle}>
          {language === 'fr' ? `Parle avec ${name}` : `Chat with ${name}`}
          {' 🐉'}
        </Text>
        <Text style={s.migaTip} numberOfLines={2}>{tip}</Text>
      </View>
      <TouchableOpacity
        style={s.migaBtn}
        onPress={() => router.push('/mascot-dm' as never)}
      >
        <Text style={s.migaBtnText}>
          {language === 'fr' ? 'Écrire →' : 'Chat →'}
        </Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

// ── My friends horizontal card ─────────────────────────────────────────────────
function MyFriendBubble({ friend }: { friend: MyChildFriend }) {
  const bg = COVER_COLOR[friend.name] ?? '#EEEDFE';
  return (
    <TouchableOpacity
      onPress={() => router.push(`/friend/${friend.id}` as never)}
      activeOpacity={0.8}
      style={s.myFriendBubble}
    >
      <View style={[s.myFriendAvatar, { backgroundColor: bg }]}>
        {friend.avatar_url
          ? <Image source={{ uri: resolveAvatarUrl(friend.avatar_url) }} style={{ width: 56, height: 56, borderRadius: 28 }} />
          : <Text style={{ fontSize: 26 }}>{firstEmoji(friend.cover_emojis)}</Text>
        }
      </View>
      <Text style={s.myFriendName} numberOfLines={1}>{friend.name}</Text>
      <TouchableOpacity
        onPress={() => router.push(`/dm/${friend.id}` as never)}
        style={s.chatBtn}
      >
        <Text style={s.chatBtnText}>💬 Chat</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

// ── Network discovery card ─────────────────────────────────────────────────────
function NetworkCard({
  f, referringFriendId, token, onAdd,
}: {
  f: FriendWithRelationship;
  referringFriendId: string;
  token: string;
  onAdd: (id: string, refId: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [adding, setAdding]   = useState(false);
  const [added,  setAdded]    = useState(f.already_added);
  const bg = COVER_COLOR[f.name] ?? '#EEEDFE';

  async function handleAdd() {
    if (adding || added) return;
    setAdding(true);
    await onAdd(f.id, referringFriendId);
    setAdded(true);
    setAdding(false);
  }

  return (
    <TouchableOpacity
      onPress={() => router.push(`/friend/${f.id}?via=${referringFriendId}` as never)}
      activeOpacity={0.8}
      style={s.networkCard}
    >
      <View style={[s.networkAvatar, { backgroundColor: bg }]}>
        {f.avatar_url
          ? <Image source={{ uri: resolveAvatarUrl(f.avatar_url) }} style={{ width: 52, height: 52, borderRadius: 26 }} />
          : <Text style={{ fontSize: 28 }}>{firstEmoji(f.cover_emojis)}</Text>
        }
      </View>
      <Text style={s.networkName} numberOfLines={1}>{f.name}</Text>
      <Text style={s.networkRel} numberOfLines={1}>{relationshipTypeLabel(t, f.relationship_type ?? f.network_relationship_type)}</Text>
      {added ? (
        <View style={s.addedTag}><Text style={s.addedText}>{t('discover.addedTag')}</Text></View>
      ) : (
        <TouchableOpacity onPress={handleAdd} style={s.addBtn} disabled={adding}>
          {adding
            ? <ActivityIndicator size="small" color={Colors.purple} />
            : <Text style={s.addBtnText}>{t('discover.addButton')}</Text>}
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

// ── Star friend card ───────────────────────────────────────────────────────────
function StarCard({
  friend, token, onAdd,
}: { friend: AiFriendRecord; token: string; onAdd: (id: string) => Promise<void> }) {
  const { t } = useTranslation();
  const [adding, setAdding] = useState(false);
  const [added,  setAdded]  = useState(false);
  const bg = COVER_COLOR[friend.name] ?? '#EEEDFE';

  async function handleAdd() {
    if (adding || added) return;
    setAdding(true);
    await onAdd(friend.id);
    setAdded(true);
    setAdding(false);
  }

  return (
    <TouchableOpacity
      onPress={() => router.push(`/friend/${friend.id}` as never)}
      activeOpacity={0.8}
      style={s.starCard}
    >
      <View style={[s.starAvatar, { backgroundColor: bg }]}>
        {friend.avatar_url
          ? <Image source={{ uri: resolveAvatarUrl(friend.avatar_url) }} style={{ width: 52, height: 52, borderRadius: 26 }} />
          : <Text style={{ fontSize: 32 }}>{firstEmoji(friend.cover_emojis)}</Text>
        }
      </View>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
          <Text style={s.starName}>{friend.name}</Text>
          <View style={s.starBadge}><Text style={s.starBadgeText}>⭐ Star</Text></View>
        </View>
        <Text style={s.starBio} numberOfLines={2}>{friend.bio}</Text>
      </View>
      {added ? (
        <View style={s.addedTag}><Text style={s.addedText}>✓</Text></View>
      ) : (
        <TouchableOpacity onPress={handleAdd} style={s.addBtn} disabled={adding}>
          {adding ? <ActivityIndicator size="small" color={Colors.purple} /> : <Text style={s.addBtnText}>{t('discover.addButton')}</Text>}
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

// ── Ms. Luna discovery card ────────────────────────────────────────────────────
function LunaCard({ luna, onAdd, isFr, alreadyAdded }: { luna: AiFriendRecord; onAdd: () => Promise<void>; isFr: boolean; alreadyAdded: boolean }) {
  const { t } = useTranslation();
  const [adding, setAdding] = useState(false);

  async function handleMeet() {
    if (adding) return;
    if (alreadyAdded) {
      router.push(`/dm/${luna.id}` as never);
      return;
    }
    setAdding(true);
    try {
      await onAdd();
    } finally {
      setAdding(false);
    }
    router.push(`/dm/${luna.id}` as never);
  }

  return (
    <TouchableOpacity
      onPress={() => router.push(`/friend/${luna.id}` as never)}
      activeOpacity={0.9}
      style={s.lunaCard}
    >
      <View style={s.lunaAvatar}>
        {luna.avatar_url
          ? <Image source={{ uri: resolveAvatarUrl(luna.avatar_url) }} style={{ width: 52, height: 52, borderRadius: 26 }} />
          : <Text style={{ fontSize: 26 }}>{firstEmoji(luna.cover_emojis)}</Text>
        }
      </View>
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text style={s.lunaName}>{getDisplayName(luna.name, isFr)}</Text>
        <Text style={s.lunaTagline}>{t('discover.lunaTagline')}</Text>
        <Text style={s.lunaDesc}>{t('discover.lunaDesc')}</Text>
      </View>
      <TouchableOpacity style={s.meetBtn} onPress={() => void handleMeet()} disabled={adding}>
        {adding
          ? <ActivityIndicator size="small" color="#fff" />
          : <Text style={s.meetBtnText}>{alreadyAdded ? t('discover.chatLunaButton') : t('discover.meetLunaButton')}</Text>}
      </TouchableOpacity>
    </TouchableOpacity>
  );
}


// ── Jules seasonal card ────────────────────────────────────────────────────────
function JulesCard({ jules, onAdd, isFr, alreadyAdded }: { jules: AiFriendRecord; onAdd: () => Promise<void>; isFr: boolean; alreadyAdded: boolean }) {
  const { t } = useTranslation();
  const [adding, setAdding] = useState(false);

  async function handleMeet() {
    if (adding) return;
    if (alreadyAdded) {
      router.push(`/dm/${jules.id}` as never);
      return;
    }
    setAdding(true);
    try {
      await onAdd();
    } finally {
      setAdding(false);
    }
    router.push(`/dm/${jules.id}` as never);
  }

  return (
    <TouchableOpacity
      onPress={() => router.push(`/friend/${jules.id}` as never)}
      activeOpacity={0.9}
      style={s.julesCard}
    >
      {/* Top row: avatar + name/badge + button */}
      <View style={s.julesTopRow}>
        <View style={s.julesAvatar}>
          {jules.avatar_url
            ? <Image source={{ uri: resolveAvatarUrl(jules.avatar_url) }} style={{ width: 52, height: 52, borderRadius: 26 }} />
            : <Text style={{ fontSize: 26 }}>🧭</Text>
          }
        </View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
            <Text style={s.julesName}>{jules.name}</Text>
            <View style={s.julesBadge}><Text style={s.julesBadgeText}>☀️ Été</Text></View>
          </View>
          <Text style={s.julesTagline}>{t('discover.julesTagline')}</Text>
        </View>
        <TouchableOpacity style={s.julesBtn} onPress={() => void handleMeet()} disabled={adding}>
          {adding
            ? <ActivityIndicator size="small" color="#fff" />
            : <Text style={s.julesBtnText}>{alreadyAdded ? t('discover.chatJulesButton') : t('discover.meetJulesButton')}</Text>}
        </TouchableOpacity>
      </View>
      {/* Full width description below */}
      <Text style={s.julesDesc}>{t('discover.julesDesc')}</Text>
    </TouchableOpacity>
  );
}

// ── Main screen ────────────────────────────────────────────────────────────────
export default function DiscoverScreen() {
  const { t } = useTranslation();
  const { language } = useLanguageStore();

  const [token,       setToken]       = useState<string | null>(null);
  const [myFriends,   setMyFriends]   = useState<MyChildFriend[]>([]);
  const [allFriends,  setAllFriends]  = useState<AiFriendRecord[]>([]);
  const [networks,    setNetworks]    = useState<Record<string, FriendWithRelationship[]>>({});
  const [search,      setSearch]      = useState('');
  const [loading,     setLoading]     = useState(true);
  const [childAge,    setChildAge]    = useState<number>(10);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      async function load() {
        const tok = await AsyncStorage.getItem('childToken');
        if (!cancelled) setToken(tok);

        try {
          const [allRes, myRes, profileRes] = await Promise.all([
            allFriendsApi.list(language),
            tok ? myFriendsApi.list(tok) : Promise.resolve(null),
            tok ? childProfileApi.getProfile(tok).catch(() => null) : Promise.resolve(null),
          ]);

          const all  = (allRes.data.friends   as AiFriendRecord[]);
          const mine = (myRes?.data.friends   as MyChildFriend[]) ?? [];

          if (!cancelled) {
            setAllFriends(all);
            setMyFriends(mine);
            if (profileRes?.data?.age) setChildAge(profileRes.data.age);
          }

          // Fetch networks for each of child's non-teacher friends in parallel
          if (tok && mine.length > 0 && !cancelled) {
            const netResults = await Promise.all(
              mine.filter(f => !f.is_teacher).map(f => friendNetwork.getNetwork(f.id, tok).then(r => ({ id: f.id, data: r.data.friends })).catch(() => ({ id: f.id, data: [] as FriendWithRelationship[] }))),
            );
            if (!cancelled) {
              const map: Record<string, FriendWithRelationship[]> = {};
              for (const { id, data } of netResults) map[id] = data;
              setNetworks(map);
            }
          }
        } catch (e) {
          console.error('[discover] load error:', e);
        } finally {
          if (!cancelled) setLoading(false);
        }
      }
      void load();
      return () => { cancelled = true; };
    }, [language]),
  );

  const addFriend = useCallback(async (friendId: string, refId?: string) => {
    if (!token) return;
    try {
      await friendNetwork.addFriend(token, friendId, refId);
      // Refresh my friends list
      const res = await myFriendsApi.list(token);
      setMyFriends(res.data.friends);
    } catch {}
  }, [token]);

  const myFriendIds = new Set(myFriends.map(f => f.id));

  const msLuna = allFriends.find(f => f.is_teacher && f.name === 'Ms. Luna') ?? null;
  const showLuna = !!msLuna && !!token && childAge >= 6;

  const jules = allFriends.find(f => f.is_jules) ?? null;
  const showJules = !!jules && !!token;

  const starFriends = allFriends.filter(
    f => f.is_star_friend && !myFriendIds.has(f.id),
  );

  const displayedFriends = search
    ? myFriends.filter(f =>
        f.name.toLowerCase().includes(search.toLowerCase()) ||
        (f.interests as string[] | undefined)?.some(i => i.toLowerCase().includes(search.toLowerCase()))
      )
    : myFriends;

  if (loading) {
    return (
      <SafeAreaView style={s.screen}>
        <View style={s.topBar}><MigoLogo size="sm" /></View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={Colors.purple} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.screen}>
      <View style={s.topBar}>
        <MigoLogo size="sm" />
      </View>

      <TextInput
        style={s.search}
        placeholder={t('discover.searchPlaceholder')}
        placeholderTextColor={Colors.gray[400]}
        value={search}
        onChangeText={setSearch}
      />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>

        {/* Mascot chat card */}
        <MigaCard />

        {/* Ms. Luna card — always visible once eligible */}
        {showLuna && msLuna && (
          <LunaCard luna={msLuna} onAdd={() => addFriend(msLuna.id)} isFr={language === 'fr'} alreadyAdded={myFriendIds.has(msLuna.id)} />
        )}

        {/* Jules seasonal card */}
        {showJules && jules && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>{t('discover.julesSection')}</Text>
            <JulesCard
              jules={jules}
              onAdd={() => addFriend(jules.id)}
              isFr={language === 'fr'}
              alreadyAdded={myFriendIds.has(jules.id)}
            />
          </View>
        )}

        {/* My friends */}
        {displayedFriends.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>{t('friends.yourFriends')} ({displayedFriends.length})</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingLeft: 2, paddingRight: 10, gap: 12 }}>
              {displayedFriends.map(f => <MyFriendBubble key={f.id} friend={f} />)}
            </ScrollView>
          </View>
        )}

        {/* No friends yet */}
        {myFriends.length === 0 && (
          <View style={s.emptyState}>
            <Text style={{ fontSize: 48, marginBottom: 12 }}>👋</Text>
            <Text style={s.emptyText}>{t('friends.noFriendsYet')}</Text>
          </View>
        )}

        {/* Explore section — each friend's network */}
        {token && myFriends.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>{t('friends.exploreWorlds')}</Text>
            {myFriends.filter(f => !f.is_teacher).map(myFriend => {
              const net = (networks[myFriend.id] ?? []).filter(f => !myFriendIds.has(f.id));
              if (net.length === 0) return null;
              return (
                <View key={myFriend.id} style={{ marginBottom: 16 }}>
                  <TouchableOpacity onPress={() => router.push(`/friend/${myFriend.id}` as never)}>
                    <Text style={s.exploreHeader}>{t('friends.meetFriends', { name: myFriend.name })}</Text>
                  </TouchableOpacity>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingVertical: 4 }}>
                    {net.map(f => (
                      <NetworkCard
                        key={f.id}
                        f={f}
                        referringFriendId={myFriend.id}
                        token={token}
                        onAdd={addFriend}
                      />
                    ))}
                  </ScrollView>
                </View>
              );
            })}
          </View>
        )}

        {/* Star friends */}
        {starFriends.length > 0 && token && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>{t('friends.starFriends')}</Text>
            {starFriends.map(f => (
              <StarCard key={f.id} friend={f} token={token} onAdd={(id) => addFriend(id)} />
            ))}
          </View>
        )}

        <View style={{ height: 20 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen:  { flex: 1, backgroundColor: Colors.bg },
  topBar:  { paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F0EFF8' },
  title:   { fontSize: 22, fontWeight: '800', color: '#2C2C2A' },
  search:  { marginHorizontal: 14, marginVertical: 10, backgroundColor: '#fff', borderRadius: 99, paddingHorizontal: 16, paddingVertical: 11, fontSize: 14, color: '#2C2C2A', borderWidth: 1, borderColor: '#E8E6FF' },
  scroll:  { paddingHorizontal: 14, paddingTop: 4 },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: '#2C2C2A', marginBottom: 10 },
  exploreHeader: { fontSize: 13, fontWeight: '700', color: Colors.purple, marginBottom: 8 },

  // My friends bubble
  myFriendBubble: { width: 82, alignItems: 'center' },
  myFriendAvatar: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginBottom: 5 },
  myFriendName:   { fontSize: 11, fontWeight: '700', color: '#2C2C2A', textAlign: 'center', marginBottom: 5 },
  chatBtn:        { backgroundColor: Colors.purple + '18', borderRadius: 99, paddingHorizontal: 8, paddingVertical: 3 },
  chatBtnText:    { fontSize: 10, color: Colors.purple, fontWeight: '700' },

  // Network card
  networkCard:   { width: 88, alignItems: 'center', backgroundColor: '#fff', borderRadius: 14, padding: 8, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
  networkAvatar: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', marginBottom: 5 },
  networkName:   { fontSize: 11, fontWeight: '700', color: '#2C2C2A', textAlign: 'center' },
  networkRel:    { fontSize: 9, color: Colors.gray[400], textAlign: 'center', marginBottom: 5, textTransform: 'capitalize' },

  // Star card
  starCard:       { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 16, padding: 12, marginBottom: 10, gap: 12, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
  starAvatar:     { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  starName:       { fontSize: 14, fontWeight: '700', color: '#2C2C2A' },
  starBadge:      { backgroundColor: Colors.orange + '22', borderRadius: 99, paddingHorizontal: 7, paddingVertical: 2 },
  starBadgeText:  { fontSize: 10, color: Colors.orange, fontWeight: '700' },
  starBio:        { fontSize: 12, color: Colors.gray[500], lineHeight: 16 },

  // Shared
  addBtn:     { backgroundColor: Colors.purple + '18', borderRadius: 99, paddingHorizontal: 8, paddingVertical: 4, minWidth: 52, alignItems: 'center' },
  addBtnText: { fontSize: 10, color: Colors.purple, fontWeight: '700' },
  addedTag:   { backgroundColor: Colors.green + '22', borderRadius: 99, paddingHorizontal: 8, paddingVertical: 4 },
  addedText:  { fontSize: 10, color: Colors.green, fontWeight: '700' },

  emptyState: { alignItems: 'center', paddingVertical: 40 },
  emptyText:  { fontSize: 14, color: Colors.gray[400], textAlign: 'center' },

  // Miga mascot card
  migaCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#7F77DD',
    borderRadius: 20, padding: 16, marginBottom: 14,
    shadowColor: '#534AB7', shadowOpacity: 0.25, shadowRadius: 8, elevation: 4,
  },
  migaAvatarWrap: {
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  migaTitle:   { fontSize: 15, fontWeight: '800', color: '#fff', marginBottom: 4 },
  migaTip:     { fontSize: 12, color: 'rgba(255,255,255,0.85)', lineHeight: 17 },
  migaBtn: {
    backgroundColor: '#534AB7', borderRadius: 99,
    paddingHorizontal: 12, paddingVertical: 8,
    alignItems: 'center', marginLeft: 8,
  },
  migaBtnText: { fontSize: 12, color: '#fff', fontWeight: '800' },

  // Ms. Luna card
  lunaCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 16, padding: 16, marginBottom: 4,
    borderLeftWidth: 4, borderLeftColor: Colors.purple,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  lunaAvatar: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: Colors.purple + '22',
    alignItems: 'center', justifyContent: 'center',
  },
  lunaName:    { fontSize: 15, fontWeight: '800', color: '#2C2C2A', marginBottom: 2 },
  lunaTagline: { fontSize: 12, color: Colors.purple, fontWeight: '600', marginBottom: 4 },
  lunaDesc:    { fontSize: 12, color: '#888780', lineHeight: 17 },
  meetBtn: {
    backgroundColor: Colors.green, borderRadius: 99,
    paddingHorizontal: 10, paddingVertical: 7,
    alignItems: 'center', minWidth: 72, marginLeft: 10,
  },
  meetBtnText: { fontSize: 11, color: '#fff', fontWeight: '800' },

  // Jules seasonal card
  julesCard: {
    backgroundColor: '#FFF8E7',
    borderRadius: 16,
    padding: 16,
    marginBottom: 4,
    borderLeftWidth: 4,
    borderLeftColor: '#F59E0B',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  julesTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  julesAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  julesName:      { fontSize: 15, fontWeight: '800', color: '#2C2C2A' },
  julesBadge:     { backgroundColor: '#FEF3C7', borderRadius: 99, paddingHorizontal: 7, paddingVertical: 2 },
  julesBadgeText: { fontSize: 10, color: '#D97706', fontWeight: '700' },
  julesTagline:   { fontSize: 12, color: '#D97706', fontWeight: '600' },
  julesDesc:      { fontSize: 13, color: '#666', lineHeight: 19 },
  julesBtn: {
    backgroundColor: '#F59E0B',
    borderRadius: 99,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: 'center',
    marginLeft: 10,
  },
  julesBtnText: { fontSize: 11, color: '#fff', fontWeight: '800' },
});
