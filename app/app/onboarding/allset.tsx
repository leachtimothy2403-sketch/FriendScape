import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, SafeAreaView, ScrollView, Image } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle,
  withRepeat, withSequence, withTiming, withDelay, Easing,
} from 'react-native-reanimated';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import { children as childrenApi, childAuth, childSession, mascotAvatars as mascotAvatarApi } from '@/services/api';
import { addChildProfile } from '@/utils/childProfiles';
import EmojiAvatar from '@/components/EmojiAvatar';
import { useOnboardingStore } from '@/store/onboardingStore';
import { useLanguageStore } from '@/store/languageStore';

const MASCOT: Record<string, { emoji: string; name: string }> = {
  pixel: { emoji: '🤖', name: 'Pixel' },
  finn:  { emoji: '🦊', name: 'Finn'  },
  miga:  { emoji: '🧚', name: 'Miga'  },
  sage:  { emoji: '🦉', name: 'Sage'  },
};

const HUMAN_EMOJI: Record<string, string> = {
  classic: '👦', sporty: '👧', artistic: '🧑', cool: '👱',
  sweet: '🧒', cowboy: '🤠', superhero: '🦸', princess: '👸',
};
const ANIMAL_EMOJI: Record<string, string> = {
  cat: '🐱', dog: '🐶', fox: '🦊', rabbit: '🐰',
  bear: '🐻', owl: '🦉', lion: '🦁', panda: '🐼',
};

const PACK_NAME: Record<string, string> = {
  'sketch-crew':   'Sketch Crew',
  'animal-gang':   'Animal Gang',
  'fantasy-world': 'Fantasy World',
  'toon-town':     'Toon Town',
};

const PARENT_DASHBOARD = 'http://localhost:3000';

const EN_LOADING_FACTS = [
  "Setting up your Migo world...",
  "Did you know? Your AI friends learn what makes you laugh!",
  "Your friends are getting ready to meet you...",
  "Migo friends never get tired of hearing your stories!",
  "Almost there — your world is taking shape!",
  "Every friend on Migo is picked just for you.",
];

const FR_LOADING_FACTS = [
  "Préparation de ton monde Migo...",
  "Le savais-tu ? Tes amis IA apprennent ce qui te fait rire !",
  "Tes amis se préparent à te rencontrer...",
  "Les amis Migo adorent toujours entendre tes histoires !",
  "Presque prêt — ton monde prend forme !",
  "Chaque ami sur Migo est choisi spécialement pour toi.",
];

// Module-level guard: survives React Strict Mode's mount→unmount→remount cycle.
// useRef resets to false on each remount, so it cannot protect against double-invocation.
let _createChildStarted = false;
export function resetCreateChildGuard() { _createChildStarted = false; }

function PulsingDot({ delay }: { delay: number }) {
  const scale = useSharedValue(1);
  useEffect(() => {
    scale.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1.8, { duration: 380 }),
          withTiming(1,   { duration: 380 }),
        ),
        -1, false,
      ),
    );
  }, [delay]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Animated.View
      style={[{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#7F77DD', marginHorizontal: 4 }, style]}
    />
  );
}

function Chip({ children }: { children: string }) {
  return (
    <View style={{ backgroundColor: '#EEEDFE', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 }}>
      <Text style={{ fontSize: 12, color: '#534AB7', fontWeight: '600' }}>{children}</Text>
    </View>
  );
}

type Status = 'loading' | 'success' | 'error';

export default function AllSetScreen() {
  const { t } = useTranslation();
  const store = useOnboardingStore();
  const { language } = useLanguageStore();

  const mascot    = MASCOT[store.mascotId]     ?? { emoji: '🧚', name: 'Miga' };
  const packName  = PACK_NAME[store.avatarPack] ?? store.avatarPack;
  const childName = store.childName.trim() || 'you';
  const childEmoji = store.avatarStyle === 'animal'
    ? (ANIMAL_EMOJI[store.avatarTheme] ?? '🐾')
    : (HUMAN_EMOJI[store.humanFaceStyle] ?? '👦');

  type AssignedFriend = { id: string; name: string; coverEmojis: string; introMessage: string };

  const [status, setStatus]               = useState<Status>('loading');
  const [errorMsg, setErrorMsg]           = useState('');
  const [assignedFriends, setAssignedFriends] = useState<AssignedFriend[]>([]);
  const [mascotAvatarUrl, setMascotAvatarUrl] = useState<string | null>(null);
  const [factIndex, setFactIndex] = useState(0);
  const isFr = (store.language || language) === 'fr';

  const floatY     = useSharedValue(0);
  const celebScale = useSharedValue(0);

  const card0Opacity = useSharedValue(0);
  const card0TransY  = useSharedValue(20);
  const card1Opacity = useSharedValue(0);
  const card1TransY  = useSharedValue(20);
  const card2Opacity = useSharedValue(0);
  const card2TransY  = useSharedValue(20);

  const cardAnimStyles = [
    useAnimatedStyle(() => ({ opacity: card0Opacity.value, transform: [{ translateY: card0TransY.value }] })),
    useAnimatedStyle(() => ({ opacity: card1Opacity.value, transform: [{ translateY: card1TransY.value }] })),
    useAnimatedStyle(() => ({ opacity: card2Opacity.value, transform: [{ translateY: card2TransY.value }] })),
  ];

  useEffect(() => {
    floatY.value = withRepeat(
      withSequence(
        withTiming(-10, { duration: 1400, easing: Easing.inOut(Easing.sin) }),
        withTiming(0,   { duration: 1400, easing: Easing.inOut(Easing.sin) }),
      ),
      -1, false,
    );
    if (_createChildStarted) return;
    _createChildStarted = true;
    void createChild();
  }, []);

  useEffect(() => {
    if (status !== 'loading') return;
    const interval = setInterval(() => {
      setFactIndex((i) => (i + 1) % (isFr ? FR_LOADING_FACTS.length : EN_LOADING_FACTS.length));
    }, 6000);
    return () => clearInterval(interval);
  }, [status, isFr]);

  useEffect(() => {
    mascotAvatarApi.get().then(res => {
      const url = res.data.mascots[store.mascotId];
      if (url) setMascotAvatarUrl(url);
    }).catch(() => {});
  }, [store.mascotId]);

  useEffect(() => {
    if (status === 'success') {
      celebScale.value = withSequence(
        withTiming(1.25, { duration: 280, easing: Easing.out(Easing.cubic) }),
        withTiming(1.0,  { duration: 180 }),
      );

      const cardEasing = Easing.out(Easing.back(1.2));
      const delays     = [300, 500, 700];
      const opacities  = [card0Opacity, card1Opacity, card2Opacity];
      const transYs    = [card0TransY,  card1TransY,  card2TransY];
      opacities.forEach((op, i) => {
        op.value = withDelay(delays[i], withTiming(1, { duration: 400, easing: cardEasing }));
      });
      transYs.forEach((ty, i) => {
        ty.value = withDelay(delays[i], withTiming(0, { duration: 400, easing: cardEasing }));
      });
    }
  }, [status]);

  const floatStyle = useAnimatedStyle(() => ({ transform: [{ translateY: floatY.value }] }));
  const celebStyle = useAnimatedStyle(() => ({ transform: [{ scale: celebScale.value }] }));

  async function createChild() {
    const isParentAdding = await AsyncStorage.getItem('parentAddingChild');

    if (isParentAdding === 'true') {
      await AsyncStorage.removeItem('parentAddingChild');
      const authToken = await AsyncStorage.getItem('authToken');
      if (!authToken) {
        // fall through to parentEmail path below
      } else {
        const payload = {
          parentEmail:         '',
          name:                store.childName,
          dateOfBirth:         store.dateOfBirth,
          gender:              store.gender,
          language:            store.language,
          specialNeeds:        store.specialNeeds,
          specialNeedsDetails: store.specialNeedsDetails,
          preReader:           store.preReader,
          avatarTheme:         store.avatarTheme,
          mascotId:            store.mascotId,
          interests:           store.interests,
          freeInterest:        store.freeInterest,
          avatarPack:          store.avatarPack,
          personalityTraits:   store.personalityTraits,
          personalityFreeText: store.personalityFreeText,
          avatarConfig:        store.avatarConfig ?? undefined,
          avatarBackground:    store.avatarBackground,
          cartoonUrl:          store.cartoonUrl || undefined,
        };
        try {
          const res = await childrenApi.createFromOnboarding(payload);
          const data = res.data;
          if (data.assignedFriends?.length) {
            setAssignedFriends(data.assignedFriends);
          }
          const tokenRes = await childAuth.login(data.childId);
          await AsyncStorage.setItem('childToken', tokenRes.data.token);
          await AsyncStorage.setItem('childId', data.childId);
          await AsyncStorage.setItem('childProfile', JSON.stringify({
            childId:  data.childId,
            name:     data.name,
            mascotId: data.mascotId,
          }));
          await AsyncStorage.setItem('avatarBackground', store.avatarBackground || '#EEEDFE');
          await AsyncStorage.setItem('childEmoji', childEmoji);
          if (data.avatarUrl) await AsyncStorage.setItem('childAvatarUrl', data.avatarUrl);
          await addChildProfile({ childId: data.childId, name: data.name, mascotId: data.mascotId, avatarUrl: data.avatarUrl ?? undefined });
          await AsyncStorage.removeItem('authToken');
          try { await childSession.start(tokenRes.data.token); } catch { /* non-fatal */ }
          try {
            const stRes = await childSession.status(tokenRes.data.token);
            if (stRes.data.limitExceeded) { router.replace('/time-limit'); return; }
          } catch { /* fail open */ }
          setStatus('success');
          if (__DEV__) { void handleLaunch(); }
        } catch (err: unknown) {
          console.error('[allset] createChild error:', err);
          const e = err as { message?: string; response?: { status?: number; data?: { error?: string } } };
          const serverMsg = e?.response?.data?.error;
          const msg = __DEV__
            ? (serverMsg ?? e?.message ?? t('common.error'))
            : t('common.error');
          setErrorMsg(msg);
          _createChildStarted = false;
          setStatus('error');
        }
        return;
      }
    }

    const parentEmail = store.parentEmail ||
      (await AsyncStorage.getItem('pendingParentEmail')) || '';

    if (!parentEmail) {
      router.replace('/onboarding/basics');
      return;
    }

    const payload = {
      parentEmail,
      name:                store.childName,
      dateOfBirth:         store.dateOfBirth,
      gender:              store.gender,
      language:            store.language,
      specialNeeds:        store.specialNeeds,
      specialNeedsDetails: store.specialNeedsDetails,
      preReader:           store.preReader,
      avatarTheme:         store.avatarTheme,
      mascotId:            store.mascotId,
      interests:           store.interests,
      freeInterest:        store.freeInterest,
      avatarPack:          store.avatarPack,
      personalityTraits:   store.personalityTraits,
      personalityFreeText: store.personalityFreeText,
      avatarConfig:        store.avatarConfig ?? undefined,
      avatarBackground:    store.avatarBackground,
      cartoonUrl:          store.cartoonUrl || undefined,
    };

    try {
      const res = await childrenApi.createFromOnboarding(payload);
      const data = res.data;
      if (data.assignedFriends?.length) {
        setAssignedFriends(data.assignedFriends);
      }

      // Mint a child token so the app can make authenticated requests
      const tokenRes = await childAuth.login(data.childId);
      await AsyncStorage.setItem('childToken', tokenRes.data.token);

      await AsyncStorage.setItem('childId', data.childId);
      await AsyncStorage.setItem('childProfile', JSON.stringify({
        childId:  data.childId,
        name:     data.name,
        mascotId: data.mascotId,
      }));
      await AsyncStorage.setItem('avatarBackground', store.avatarBackground || '#EEEDFE');
      await AsyncStorage.setItem('childEmoji', childEmoji);
      if (data.avatarUrl) await AsyncStorage.setItem('childAvatarUrl', data.avatarUrl);
      await addChildProfile({ childId: data.childId, name: data.name, mascotId: data.mascotId, avatarUrl: data.avatarUrl ?? undefined });
      try { await childSession.start(tokenRes.data.token); } catch { /* non-fatal */ }
      try {
        const stRes = await childSession.status(tokenRes.data.token);
        if (stRes.data.limitExceeded) { router.replace('/time-limit'); return; }
      } catch { /* fail open */ }
      setStatus('success');
      if (__DEV__) { void handleLaunch(); }
    } catch (err: unknown) {
      console.error('[allset] createChild error:', err);
      const e = err as { message?: string; response?: { status?: number; data?: { error?: string } } };
      const serverMsg = e?.response?.data?.error;
      const msg = __DEV__
        ? (serverMsg ?? e?.message ?? t('common.error'))
        : t('common.error');
      setErrorMsg(msg);
      _createChildStarted = false;
      setStatus('error');
    }
  }

  async function handleLaunch() {
    _createChildStarted = false;
    store.resetStore();
    router.replace('/(tabs)/feed');
  }

  if (status === 'loading') {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#F8F7FF' }}>
        <StatusBar style="dark" />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
          {mascotAvatarUrl
            ? <Animated.Image
                source={{ uri: mascotAvatarUrl }}
                style={[{ width: 100, height: 100, borderRadius: 50, marginBottom: 32 }, floatStyle]}
              />
            : <Animated.Text style={[{ fontSize: 80, marginBottom: 32 }, floatStyle]}>
                {mascot.emoji}
              </Animated.Text>
          }
          <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#2C2C2A', textAlign: 'center', marginBottom: 24 }}>
            {t('onboarding.allset.settingUp')}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <PulsingDot delay={0} />
            <PulsingDot delay={220} />
            <PulsingDot delay={440} />
          </View>
          <Text style={{ fontSize: 15, color: '#7F77DD', textAlign: 'center', marginTop: 16, paddingHorizontal: 32, fontStyle: 'italic' }}>
            {isFr ? FR_LOADING_FACTS[factIndex] : EN_LOADING_FACTS[factIndex]}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (status === 'error') {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#F8F7FF' }}>
        <StatusBar style="dark" />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
          <Text style={{ fontSize: 48, marginBottom: 20 }}>😟</Text>
          <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#2C2C2A', textAlign: 'center', marginBottom: 12 }}>
            {t('common.error')}
          </Text>
          <Text style={{ fontSize: 14, color: '#D85A30', textAlign: 'center', marginBottom: 28, lineHeight: 20 }}>
            {errorMsg}
          </Text>
          <TouchableOpacity
            onPress={() => { setStatus('loading'); void createChild(); }}
            style={{ backgroundColor: '#7F77DD', borderRadius: 9999, paddingVertical: 14, paddingHorizontal: 36 }}
            activeOpacity={0.85}
          >
            <Text style={{ color: '#fff', fontSize: 16, fontWeight: 'bold' }}>{t('common.retry')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F8F7FF' }}>
      <StatusBar style="dark" />

      <View style={{ paddingHorizontal: 24, paddingTop: 20, marginBottom: 4 }}>
        <View style={{ height: 6, backgroundColor: '#E0E0E0', borderRadius: 3, marginBottom: 8 }}>
          <View style={{ width: '100%', height: '100%', backgroundColor: '#7F77DD', borderRadius: 3 }} />
        </View>
        <Text style={{ fontSize: 13, color: '#888780' }}>{t('onboarding.allset.almostThere')}</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 20, paddingBottom: 40 }}>

        <View style={{ alignItems: 'center', marginBottom: 20 }}>
          <Animated.View style={[{ alignItems: 'center', justifyContent: 'center' }, celebStyle]}>
            <View
              style={{
                width: 120, height: 120, borderRadius: 60,
                backgroundColor: store.avatarBackground || '#EEEDFE',
                alignItems: 'center', justifyContent: 'center',
                shadowColor: store.avatarBackground || '#EEEDFE',
                shadowOpacity: 0.3, shadowRadius: 12, elevation: 8,
              }}
            >
              <EmojiAvatar emoji={childEmoji} background={store.avatarBackground || '#EEEDFE'} size={96} />
            </View>
          </Animated.View>
        </View>

        <Text style={{ fontSize: 24, fontWeight: 'bold', color: '#2C2C2A', textAlign: 'center', marginBottom: 8 }}>
          {t('onboarding.allset.title', { name: childName })}
        </Text>
        <Text style={{ fontSize: 14, color: '#888780', textAlign: 'center', marginBottom: 24, lineHeight: 21 }}>
          {t('onboarding.allset.subtitle', {
            mascot: mascot.name,
            friend: assignedFriends[0]?.name ?? 'your friends',
          })}
        </Text>

        {/* Summary chips */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginBottom: 28 }}>
          <Chip>{`${mascot.emoji} Guide: ${mascot.name}`}</Chip>
          <Chip>{`🎨 ${t('onboarding.allset.style')}: ${packName}`}</Chip>
          {assignedFriends.map((f) => (
            <Chip key={f.id}>{`${[...(f.coverEmojis || '')][0] ?? '🌟'} ${f.name}`}</Chip>
          ))}
          {store.interests.slice(0, 2).length > 0 && (
            <Chip>{`❤️ ${t('onboarding.allset.loves')}: ${store.interests.slice(0, 2).join(', ')}`}</Chip>
          )}
        </View>

        {/* Friend speech bubbles */}
        {assignedFriends.length > 0 && (
          <View style={{ marginBottom: 20 }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: '#2C2C2A', textAlign: 'center', marginBottom: 16 }}>
              {t('onboarding.allset.friendsWaiting')}
            </Text>
            {assignedFriends.map((f, idx) => {
              const avatarColors = [
                { bg: '#EEEDFE', border: '#7F77DD' },
                { bg: '#E1F5EE', border: '#5DCAA5' },
                { bg: '#FAEEDA', border: '#EF9F27' },
              ];
              const colors = avatarColors[idx % avatarColors.length];
              return (
                <Animated.View
                  key={f.id}
                  style={[{
                    backgroundColor: '#fff',
                    borderRadius: 20,
                    padding: 16,
                    borderWidth: 1,
                    borderColor: '#E8E6FF',
                    marginBottom: 12,
                    elevation: 2,
                    shadowColor: '#7F77DD',
                    shadowOpacity: 0.08,
                    shadowRadius: 8,
                  }, cardAnimStyles[idx]]}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                    <View style={{
                      width: 56, height: 56, borderRadius: 28,
                      alignItems: 'center', justifyContent: 'center',
                      backgroundColor: colors.bg,
                      borderWidth: 2, borderColor: colors.border,
                    }}>
                      <Text style={{ fontSize: 24, textAlign: 'center' }}>
                        {[...(f.coverEmojis || '')][0] ?? '🌟'}
                      </Text>
                    </View>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={{ fontSize: 15, fontWeight: '700', color: '#2C2C2A', marginBottom: 8 }}>
                        {f.name}
                      </Text>
                      <View style={{
                        backgroundColor: '#EEEDFE',
                        borderRadius: 16,
                        borderTopLeftRadius: 4,
                        paddingHorizontal: 14,
                        paddingVertical: 10,
                      }}>
                        <Text style={{ fontSize: 13, color: '#534AB7', lineHeight: 20, flexShrink: 1 }}>
                          {f.introMessage}
                        </Text>
                      </View>
                    </View>
                  </View>
                </Animated.View>
              );
            })}
          </View>
        )}

        {/* Parent note */}
        <View style={{
          backgroundColor: '#fff',
          borderRadius: 20,
          padding: 20,
          marginBottom: 28,
          borderWidth: 1.5,
          borderColor: '#E8E6FF',
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.06,
          shadowRadius: 10,
          elevation: 3,
        }}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: '#2C2C2A', marginBottom: 8 }}>
            👨‍👩‍👧 {t('onboarding.allset.parentNote')}
          </Text>
          <Text style={{ fontSize: 13, color: '#888780', lineHeight: 20 }}>
            {t('onboarding.allset.parentNoteDesc', { name: childName })}{' '}
            <Text style={{ color: '#7F77DD', fontWeight: '600' }}>{PARENT_DASHBOARD}</Text>
          </Text>
        </View>

        <TouchableOpacity
          onPress={() => void handleLaunch()}
          style={{ backgroundColor: '#7F77DD', borderRadius: 9999, paddingVertical: 18, alignItems: 'center' }}
          activeOpacity={0.85}
        >
          <Text style={{ color: '#fff', fontSize: 18, fontWeight: 'bold' }}>{t('onboarding.allset.goButton')}</Text>
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
}
