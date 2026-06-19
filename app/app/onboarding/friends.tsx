import { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, SafeAreaView,
  ScrollView, ActivityIndicator, useWindowDimensions, Image,
} from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle,
  withRepeat, withSequence, withTiming, Easing, FadeIn, FadeOut,
} from 'react-native-reanimated';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTranslation } from 'react-i18next';
import { friends as friendsApi, childProfileApi, mascotAvatars as mascotAvatarApi } from '@/services/api';
import { useOnboardingStore } from '@/store/onboardingStore';
import AsyncStorage from '@react-native-async-storage/async-storage';

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

interface AssignedFriend {
  id: string;
  name: string;
  coverEmojis: string;
  introMessage: string;
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

const DISCOVERY_ONLY = new Set(['Hugo', 'Tom', 'Camille', 'Luca']);

function isCoachOrTeacher(f: ApiFriend): boolean {
  return (
    f.is_teacher ||
    f.name.includes('Coach') ||
    f.name.includes('Prof') ||
    f.name.startsWith('Ms') ||
    f.name.startsWith('Mr')
  );
}

function scoreAndRank(allFriends: ApiFriend[], interests: string[], childAge?: number): ApiFriend[] {
  const lower = interests.map((i) => i.toLowerCase());
  const eligible = allFriends.filter((f) => !DISCOVERY_ONLY.has(f.name));
  const scored = eligible.map((f) => {
    const tags: string[] = Array.isArray(f.match_tags) ? f.match_tags : [];
    const interestScore  = tags.filter((t) => lower.includes(t.toLowerCase())).length;
    const starBonus      = f.is_star_friend ? 0.5 : 0;
    const ageScore       = childAge != null && f.age != null && Math.abs(f.age - childAge) <= 2 ? 1 : 0;
    return { friend: f, score: interestScore + starBonus + ageScore };
  });
  scored.sort((a, b) => b.score - a.score);

  const result: ApiFriend[] = [];
  let coachCount = 0;
  let hasAgePeer = false;

  for (const { friend: f } of scored) {
    if (result.length >= 3) break;
    const isAdult = isCoachOrTeacher(f);
    if (isAdult && coachCount >= 1) continue;
    result.push(f);
    if (isAdult) coachCount++;
    if (childAge != null && f.age != null && Math.abs(f.age - childAge) <= 2) hasAgePeer = true;
  }

  if (!hasAgePeer && childAge != null) {
    const agePeer = scored.find(
      ({ friend: f }) =>
        !result.includes(f) &&
        f.age != null &&
        Math.abs(f.age - childAge) <= 2 &&
        !isCoachOrTeacher(f),
    );
    if (agePeer) result[result.length - 1] = agePeer.friend;
  }

  return result;
}

export default function FriendsScreen() {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const { childName, mascotId, interests, age } =
    useOnboardingStore();

  const displayName = childName.trim() || 'you';
  const mascotEmoji = MASCOT_EMOJI[mascotId] ?? '🧚';

  const [mascotAvatarUrl, setMascotAvatarUrl] = useState<string | null>(null);

  const childAge = (() => {
    const m = age.match(/(\d+)/);
    return m ? parseInt(m[1], 10) : undefined;
  })();
  const HPAD  = 24;
  const GAP   = 10;
  const cardW = (width - HPAD * 2 - GAP * 2) / 3;

  const [loading, setLoading]               = useState(true);
  const [error, setError]                   = useState('');
  const [cards, setCards]                   = useState<ApiFriend[]>([]);
  const [regenCount, setRegenCount]         = useState(0);
  const [regenLoading, setRegenLoading]     = useState(false);
  const [showConfirm, setShowConfirm]       = useState(false);
  const [regenMaxed, setRegenMaxed]         = useState(false);
  const [assignedCards, setAssignedCards]   = useState<AssignedFriend[] | null>(null);

  const floatY = useSharedValue(0);
  const cardsOpacity = useSharedValue(1);

  useEffect(() => {
    mascotAvatarApi.get().then(res => {
      const url = res.data.mascots[mascotId];
      if (url) setMascotAvatarUrl(url);
    }).catch(() => {});
  }, [mascotId]);

  useEffect(() => {
    floatY.value = withRepeat(
      withSequence(
        withTiming(-8, { duration: 1200, easing: Easing.inOut(Easing.sin) }),
        withTiming(0,  { duration: 1200, easing: Easing.inOut(Easing.sin) }),
      ),
      -1, false,
    );
  }, []);

  const floatStyle  = useAnimatedStyle(() => ({ transform: [{ translateY: floatY.value }] }));
  const cardsStyle  = useAnimatedStyle(() => ({ opacity: cardsOpacity.value }));

  useEffect(() => {
    (async () => {
      try {
        const res = await friendsApi.list();
        const all: ApiFriend[] = res.data?.friends ?? [];
        const top = scoreAndRank(all, interests, childAge);
        setCards(top);
      } catch {
        setError(t('common.error'));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function handleRegenerate() {
    setShowConfirm(false);
    setRegenLoading(true);

    try {
      const token = await AsyncStorage.getItem('childToken');
      if (!token) {
        setRegenLoading(false);
        return;
      }

      // Fade out current cards
      cardsOpacity.value = withTiming(0, { duration: 250 });

      const res = await childProfileApi.regenerateFriends(token);
      const data = res.data;

      const newCount = data.regenerationCount ?? regenCount + 1;
      setRegenCount(newCount);
      const newAssigned: AssignedFriend[] = data.assignedFriends;
      setAssignedCards(newAssigned);


      if (newCount >= 3) setRegenMaxed(true);

      // Fade in new cards
      cardsOpacity.value = withTiming(1, { duration: 400 });
    } catch (err: unknown) {
      const e = err as { response?: { status?: number } };
      if (e?.response?.status === 429) {
        setRegenMaxed(true);
      }
      // Fade back in on error
      cardsOpacity.value = withTiming(1, { duration: 300 });
    } finally {
      setRegenLoading(false);
    }
  }

  const canContinue = cards.length > 0 || !!assignedCards;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F8F7FF' }}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={{ paddingHorizontal: HPAD, paddingTop: 20, paddingBottom: 40 }}>

        {/* Progress */}
        <View style={{ height: 6, backgroundColor: '#E0E0E0', borderRadius: 3, marginBottom: 8 }}>
          <View style={{ width: '90%', height: '100%', backgroundColor: '#7F77DD', borderRadius: 3 }} />
        </View>
        <Text style={{ fontSize: 13, color: '#888780', marginBottom: 16 }}>
          Step 9 of 10 · {t('onboarding.friends.title')}
        </Text>

        {/* Badge */}
        <View style={{ backgroundColor: '#E8F8F3', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, alignSelf: 'flex-start', marginBottom: 24 }}>
          <Text style={{ color: '#5DCAA5', fontSize: 13, fontWeight: '600' }}>🎁 {t('onboarding.friends.title')}</Text>
        </View>

        {/* Mascot bubble */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 28 }}>
          <Animated.View style={[floatStyle, { marginRight: 10, marginTop: 4 }]}>
            {mascotAvatarUrl
              ? <Image source={{ uri: mascotAvatarUrl }} style={{ width: 36, height: 36, borderRadius: 18 }} />
              : <Text style={{ fontSize: 34 }}>{mascotEmoji}</Text>
            }
          </Animated.View>
          <View style={{ flex: 1, backgroundColor: '#fff', borderRadius: 16, borderTopLeftRadius: 4, borderWidth: 1.5, borderColor: '#E0E0E0', padding: 12 }}>
            <Text style={{ fontSize: 13, color: '#2C2C2A', lineHeight: 20 }}>
              {regenLoading
                ? t('onboarding.friends.regenLoading')
                : t('onboarding.friends.meetYourFriends')}
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

        {!loading && !error && (
          <>
            {/* Assigned cards (post-regen) */}
            {assignedCards && (
              <Animated.View style={[cardsStyle, { marginBottom: 16 }]}>
                {assignedCards.map((f, idx) => (
                  <View key={f.id} style={{
                    backgroundColor: '#fff', borderRadius: 16,
                    borderWidth: 2, borderColor: '#7F77DD',
                    padding: 14, marginBottom: 10,
                    flexDirection: 'row', alignItems: 'center', gap: 12,
                  }}>
                    <View style={{
                      width: 50, height: 50, borderRadius: 25,
                      backgroundColor: AVATAR_BG[idx % AVATAR_BG.length],
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Text style={{ fontSize: 26 }}>{firstEmoji(f.coverEmojis)}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 15, fontWeight: '700', color: '#2C2C2A' }}>{f.name}</Text>
                      <Text style={{ fontSize: 12, color: '#888780', marginTop: 2 }}>{f.introMessage}</Text>
                    </View>
                  </View>
                ))}
              </Animated.View>
            )}

            {/* Original cards (pre-regen) — preview only, no selection */}
            {!assignedCards && cards.length > 0 && (
              <Animated.View style={[cardsStyle, { marginBottom: 16 }]}>
                {cards.map((friend, idx) => (
                  <View key={friend.id} style={{
                    backgroundColor: '#fff', borderRadius: 16,
                    borderWidth: 2, borderColor: '#7F77DD',
                    padding: 14, marginBottom: 10,
                    flexDirection: 'row', alignItems: 'center', gap: 12,
                  }}>
                    <View style={{
                      width: 50, height: 50, borderRadius: 25,
                      backgroundColor: AVATAR_BG[idx % AVATAR_BG.length],
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Text style={{ fontSize: 26 }}>{firstEmoji(friend.cover_emojis)}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 15, fontWeight: '700', color: '#2C2C2A' }}>{friend.name}</Text>
                      <Text style={{ fontSize: 12, color: '#888780', marginTop: 2 }}>
                        {friend.bio || 'A wonderful friend waiting to meet you!'}
                      </Text>
                    </View>
                  </View>
                ))}
              </Animated.View>
            )}

            {/* Regen maxed message */}
            {regenMaxed && (
              <Text style={{ fontSize: 13, color: '#5DCAA5', fontWeight: '600', textAlign: 'center', marginBottom: 16 }}>
                {t('onboarding.friends.regenMaxed')}
              </Text>
            )}

            {/* Try different / confirm prompt */}
            {!regenMaxed && !regenLoading && (
              <>
                {!showConfirm ? (
                  <TouchableOpacity
                    onPress={() => setShowConfirm(true)}
                    style={{ alignItems: 'center', marginBottom: 12 }}
                  >
                    <Text style={{ fontSize: 13, color: '#B4B2A9' }}>
                      {t('onboarding.friends.tryDifferent')}
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <View style={{
                    backgroundColor: '#fff', borderRadius: 14,
                    borderWidth: 1.5, borderColor: '#E8E6FF',
                    padding: 16, marginBottom: 16,
                  }}>
                    <Text style={{ fontSize: 13, color: '#2C2C2A', textAlign: 'center', marginBottom: 14, lineHeight: 20 }}>
                      {t('onboarding.friends.confirmRegen')}
                    </Text>
                    <TouchableOpacity
                      onPress={() => void handleRegenerate()}
                      style={{ backgroundColor: '#7F77DD', borderRadius: 9999, paddingVertical: 12, alignItems: 'center', marginBottom: 8 }}
                    >
                      <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>
                        {t('onboarding.friends.confirmRegenYes')}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => setShowConfirm(false)}
                      style={{ alignItems: 'center', paddingVertical: 8 }}
                    >
                      <Text style={{ fontSize: 13, color: '#888780' }}>
                        {t('onboarding.friends.confirmRegenNo')}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </>
            )}

            {regenLoading && (
              <View style={{ alignItems: 'center', paddingVertical: 16, marginBottom: 12 }}>
                <ActivityIndicator size="small" color="#7F77DD" />
                <Text style={{ fontSize: 13, color: '#888780', marginTop: 8 }}>
                  {t('onboarding.friends.regenLoading')}
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
                {t('onboarding.friends.cantWait')}
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
