import { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, SafeAreaView, ScrollView } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle,
  withRepeat, withSequence, withTiming, withDelay, Easing,
} from 'react-native-reanimated';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import { children as childrenApi, childAuth } from '@/services/api';
import { useOnboardingStore } from '@/store/onboardingStore';

const MASCOT: Record<string, { emoji: string; name: string }> = {
  pixel: { emoji: '🤖', name: 'Pixel' },
  finn:  { emoji: '🦊', name: 'Finn'  },
  miga:  { emoji: '🧚', name: 'Miga'  },
  sage:  { emoji: '🦉', name: 'Sage'  },
};

const PACK_NAME: Record<string, string> = {
  'sketch-crew':   'Sketch Crew',
  'animal-gang':   'Animal Gang',
  'fantasy-world': 'Fantasy World',
  'toon-town':     'Toon Town',
};

const PARENT_DASHBOARD = 'http://localhost:3000';

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

  const mascot    = MASCOT[store.mascotId]     ?? { emoji: '🧚', name: 'Miga' };
  const packName  = PACK_NAME[store.avatarPack] ?? store.avatarPack;
  const childName = store.childName.trim() || 'you';

  const [status, setStatus]       = useState<Status>('loading');
  const [errorMsg, setErrorMsg]   = useState('');
  const [friendName, setFriendName]   = useState('your friend');
  const [friendEmoji, setFriendEmoji] = useState('🌟');

  const floatY     = useSharedValue(0);
  const celebScale = useSharedValue(0);
  const calledRef  = useRef(false);

  useEffect(() => {
    console.log('[allset] 🟡 mounted');
    floatY.value = withRepeat(
      withSequence(
        withTiming(-10, { duration: 1400, easing: Easing.inOut(Easing.sin) }),
        withTiming(0,   { duration: 1400, easing: Easing.inOut(Easing.sin) }),
      ),
      -1, false,
    );
    void createChild();
    return () => { calledRef.current = false; };
  }, []);

  useEffect(() => {
    if (status === 'success') {
      celebScale.value = withSequence(
        withTiming(1.25, { duration: 280, easing: Easing.out(Easing.cubic) }),
        withTiming(1.0,  { duration: 180 }),
      );
    }
  }, [status]);

  const floatStyle = useAnimatedStyle(() => ({ transform: [{ translateY: floatY.value }] }));
  const celebStyle = useAnimatedStyle(() => ({ transform: [{ scale: celebScale.value }] }));

  async function createChild() {
    if (calledRef.current) return;
    calledRef.current = true;

    const payload = {
      parentEmail:         store.parentEmail,
      name:                store.childName,
      age:                 store.age,
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
      selectedFriendId:    store.selectedFriendId,
    };

    try {
      const res = await childrenApi.createFromOnboarding(payload);
      const data = res.data;
      if (data.selectedFriend) {
        setFriendName(data.selectedFriend.name);
        const chars = [...(data.selectedFriend.coverEmojis || '')];
        setFriendEmoji(chars[0] || '🌟');
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

      setStatus('success');
    } catch (err: unknown) {
      const e = err as { message?: string; response?: { status?: number; data?: { error?: string } } };
      const msg = e?.response?.data?.error ?? t('common.error');
      setErrorMsg(msg);
      calledRef.current = false;
      setStatus('error');
    }
  }

  function handleLaunch() {
    store.resetStore();
    router.replace('/(tabs)/feed');
  }

  if (status === 'loading') {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#F8F7FF' }}>
        <StatusBar style="dark" />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
          <Animated.Text style={[{ fontSize: 80, marginBottom: 32 }, floatStyle]}>
            {mascot.emoji}
          </Animated.Text>
          <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#2C2C2A', textAlign: 'center', marginBottom: 24 }}>
            Setting up your Migo... 🌟
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <PulsingDot delay={0} />
            <PulsingDot delay={220} />
            <PulsingDot delay={440} />
          </View>
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
        <Text style={{ fontSize: 13, color: '#888780' }}>Almost there! ✨</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 20, paddingBottom: 40 }}>

        <View style={{ alignItems: 'center', marginBottom: 20 }}>
          <Animated.Text style={[{ fontSize: 80 }, celebStyle]}>🎉</Animated.Text>
        </View>

        <Text style={{ fontSize: 24, fontWeight: 'bold', color: '#2C2C2A', textAlign: 'center', marginBottom: 8 }}>
          {t('onboarding.allset.title', { name: childName })}
        </Text>
        <Text style={{ fontSize: 14, color: '#888780', textAlign: 'center', marginBottom: 24, lineHeight: 21 }}>
          {t('onboarding.allset.subtitle', { mascot: mascot.name, friend: friendName })}
        </Text>

        {/* Summary chips */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginBottom: 28 }}>
          <Chip>{`${mascot.emoji} Guide: ${mascot.name}`}</Chip>
          <Chip>{`🎨 Style: ${packName}`}</Chip>
          <Chip>{`${friendEmoji} First friend: ${friendName}`}</Chip>
          {store.interests.slice(0, 2).length > 0 && (
            <Chip>{`❤️ Loves: ${store.interests.slice(0, 2).join(', ')}`}</Chip>
          )}
        </View>

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
          onPress={handleLaunch}
          style={{ backgroundColor: '#7F77DD', borderRadius: 9999, paddingVertical: 18, alignItems: 'center' }}
          activeOpacity={0.85}
        >
          <Text style={{ color: '#fff', fontSize: 18, fontWeight: 'bold' }}>{t('onboarding.allset.goButton')}</Text>
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
}
