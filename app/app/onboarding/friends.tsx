import { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, SafeAreaView,
  ScrollView, ActivityIndicator, useWindowDimensions,
} from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle,
  withRepeat, withSequence, withTiming, Easing,
} from 'react-native-reanimated';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTranslation } from 'react-i18next';
import { friends as friendsApi } from '@/services/api';
import { useOnboardingStore } from '@/store/onboardingStore';

interface ApiFriend {
  id: string;
  name: string;
  is_star_friend: boolean;
  is_teacher: boolean;
  bio: string | null;
  cover_emojis: string | null;
  match_tags: string[];
  interests: string[];
  age: number | null;
}

const MASCOT_EMOJI: Record<string, string> = {
  pixel: '🤖', finn: '🦊', miga: '🧚', sage: '🦉',
};

const AVATAR_BG = ['#7F77DD', '#5DCAA5', '#EF9F27'];

function firstEmoji(str: string | null | undefined): string {
  if (!str) return '🌟';
  const chars = [...str];
  return chars[0] || '🌟';
}

function scoreAndRank(allFriends: ApiFriend[], interests: string[]): ApiFriend[] {
  const lower = interests.map((i) => i.toLowerCase());
  return allFriends
    .filter((f) => !f.is_teacher)
    .map((f) => {
      const tags: string[] = f.match_tags || [];
      const score = tags.filter((t) => lower.includes(t.toLowerCase())).length;
      return { friend: f, score };
    })
    .sort((a, b) =>
      b.score !== a.score
        ? b.score - a.score
        : Number(b.friend.is_star_friend) - Number(a.friend.is_star_friend),
    )
    .slice(0, 3)
    .map((s) => s.friend);
}

export default function FriendsScreen() {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const { childName, mascotId, interests, selectedFriendId, setSelectedFriendId } =
    useOnboardingStore();

  const displayName = childName.trim() || 'you';
  const mascotEmoji = MASCOT_EMOJI[mascotId] ?? '🧚';
  const HPAD        = 24;
  const GAP         = 10;
  const cardW       = (width - HPAD * 2 - GAP * 2) / 3;

  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [cards, setCards]       = useState<ApiFriend[]>([]);
  const [selected, setSelected] = useState(selectedFriendId);

  const floatY = useSharedValue(0);
  useEffect(() => {
    floatY.value = withRepeat(
      withSequence(
        withTiming(-8, { duration: 1200, easing: Easing.inOut(Easing.sin) }),
        withTiming(0,  { duration: 1200, easing: Easing.inOut(Easing.sin) }),
      ),
      -1, false,
    );
  }, []);
  const floatStyle = useAnimatedStyle(() => ({ transform: [{ translateY: floatY.value }] }));

  useEffect(() => {
    (async () => {
      try {
        const res = await friendsApi.list();
        const all: ApiFriend[] = res.data?.friends ?? [];
        const top = scoreAndRank(all, interests);
        setCards(top);
        const initial = selectedFriendId || top[0]?.id || '';
        setSelected(initial);
        setSelectedFriendId(initial);
      } catch {
        setError(t('common.error'));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function handleSelect(id: string) {
    setSelected(id);
    setSelectedFriendId(id);
  }

  const activeFriend = cards.find((c) => c.id === selected);
  const canContinue  = !!selected;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F8F7FF' }}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={{ paddingHorizontal: HPAD, paddingTop: 20, paddingBottom: 40 }}>

        {/* Progress */}
        <View style={{ height: 6, backgroundColor: '#E0E0E0', borderRadius: 3, marginBottom: 8 }}>
          <View style={{ width: '88%', height: '100%', backgroundColor: '#7F77DD', borderRadius: 3 }} />
        </View>
        <Text style={{ fontSize: 13, color: '#888780', marginBottom: 16 }}>
          Step 8 of 9 · {t('onboarding.friends.title')}
        </Text>

        {/* Badge */}
        <View style={{ backgroundColor: '#E8F8F3', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, alignSelf: 'flex-start', marginBottom: 24 }}>
          <Text style={{ color: '#5DCAA5', fontSize: 13, fontWeight: '600' }}>🎁 {t('onboarding.friends.title')}</Text>
        </View>

        {/* Mascot bubble */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 28 }}>
          <Animated.Text style={[{ fontSize: 34, marginRight: 10, marginTop: 4 }, floatStyle]}>
            {mascotEmoji}
          </Animated.Text>
          <View style={{ flex: 1, backgroundColor: '#fff', borderRadius: 16, borderTopLeftRadius: 4, borderWidth: 1.5, borderColor: '#E0E0E0', padding: 12 }}>
            <Text style={{ fontSize: 13, color: '#2C2C2A', lineHeight: 20 }}>
              {t('onboarding.friends.subtitle', { name: displayName })}
            </Text>
          </View>
        </View>

        {loading && (
          <View style={{ alignItems: 'center', paddingVertical: 40 }}>
            <ActivityIndicator size="large" color="#7F77DD" />
            <Text style={{ fontSize: 13, color: '#888780', marginTop: 12 }}>{t('common.loading')}</Text>
          </View>
        )}

        {!loading && !!error && (
          <View style={{ alignItems: 'center', paddingVertical: 24 }}>
            <Text style={{ fontSize: 14, color: '#D85A30', textAlign: 'center', marginBottom: 16 }}>{error}</Text>
            <TouchableOpacity
              onPress={() => { setError(''); setLoading(true); }}
              style={{ backgroundColor: '#7F77DD', borderRadius: 9999, paddingVertical: 10, paddingHorizontal: 24 }}
            >
              <Text style={{ color: '#fff', fontWeight: '700' }}>{t('common.retry')}</Text>
            </TouchableOpacity>
          </View>
        )}

        {!loading && !error && cards.length > 0 && (
          <>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: GAP, marginBottom: 16 }}>
              {cards.map((friend, idx) => {
                const isSel    = selected === friend.id;
                const avatarBg = AVATAR_BG[idx % AVATAR_BG.length];
                const emoji    = firstEmoji(friend.cover_emojis);
                const tags     = (friend.interests as string[] | undefined || []).slice(0, 2);

                return (
                  <TouchableOpacity
                    key={friend.id}
                    onPress={() => handleSelect(friend.id)}
                    style={{
                      width: cardW,
                      backgroundColor: '#fff',
                      borderRadius: 20,
                      borderWidth: 2.5,
                      borderColor: isSel ? '#7F77DD' : '#E8E6FF',
                      padding: 12,
                      alignItems: 'center',
                      transform: [{ scale: isSel ? 1.04 : 1 }],
                      shadowColor: '#000',
                      shadowOffset: { width: 0, height: 2 },
                      shadowOpacity: isSel ? 0.12 : 0.05,
                      shadowRadius: 8,
                      elevation: isSel ? 5 : 2,
                    }}
                    activeOpacity={0.75}
                  >
                    <View style={{
                      width: 60, height: 60, borderRadius: 30,
                      backgroundColor: avatarBg,
                      alignItems: 'center', justifyContent: 'center',
                      marginBottom: 8,
                    }}>
                      <Text style={{ fontSize: 30 }}>{emoji}</Text>
                    </View>

                    {isSel && (
                      <View style={{
                        position: 'absolute', top: 6, right: 6,
                        width: 20, height: 20, borderRadius: 10,
                        backgroundColor: '#7F77DD',
                        alignItems: 'center', justifyContent: 'center',
                      }}>
                        <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>✓</Text>
                      </View>
                    )}

                    <Text style={{ fontSize: 13, fontWeight: 'bold', color: isSel ? '#7F77DD' : '#2C2C2A', textAlign: 'center', marginBottom: 4 }}>
                      {friend.name}
                    </Text>

                    {friend.age != null && (
                      <Text style={{ fontSize: 10, color: '#888780', marginBottom: 6 }}>Age {friend.age}</Text>
                    )}

                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, justifyContent: 'center' }}>
                      {tags.map((tag) => (
                        <View key={tag} style={{ backgroundColor: isSel ? '#EEEDFE' : '#F5F5F5', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 }}>
                          <Text style={{ fontSize: 9, color: isSel ? '#7F77DD' : '#888780', fontWeight: '600' }}>{tag}</Text>
                        </View>
                      ))}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>

            {activeFriend && (
              <View style={{
                backgroundColor: '#fff',
                borderRadius: 16,
                padding: 14,
                marginBottom: 28,
                borderWidth: 1.5,
                borderColor: '#E8E6FF',
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.05,
                shadowRadius: 6,
                elevation: 2,
              }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                  <View style={{
                    width: 36, height: 36, borderRadius: 18,
                    backgroundColor: AVATAR_BG[cards.findIndex(c => c.id === activeFriend.id) % AVATAR_BG.length],
                    alignItems: 'center', justifyContent: 'center', marginRight: 10,
                  }}>
                    <Text style={{ fontSize: 18 }}>{firstEmoji(activeFriend.cover_emojis)}</Text>
                  </View>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: '#2C2C2A' }}>{activeFriend.name}</Text>
                </View>
                <Text style={{ fontSize: 13, color: '#888780', lineHeight: 20 }}>
                  {activeFriend.bio || 'A wonderful friend waiting to meet you!'}
                </Text>
              </View>
            )}

            <TouchableOpacity
              onPress={() => router.push('/onboarding/allset')}
              disabled={!canContinue}
              style={{
                backgroundColor: canContinue ? '#7F77DD' : '#E0E0E0',
                borderRadius: 9999, paddingVertical: 16, alignItems: 'center', marginBottom: 12,
              }}
              activeOpacity={0.85}
            >
              <Text style={{ color: canContinue ? '#fff' : '#BDBDBD', fontSize: 17, fontWeight: 'bold' }}>
                {activeFriend
                  ? t('onboarding.friends.continueButton', { name: activeFriend.name })
                  : 'Choose a friend first'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => router.back()} style={{ paddingVertical: 12, alignItems: 'center' }}>
              <Text style={{ color: '#BDBDBD', fontSize: 14 }}>← {t('common.back')}</Text>
            </TouchableOpacity>
          </>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}
