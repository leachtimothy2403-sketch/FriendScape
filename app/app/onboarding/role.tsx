import { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, SafeAreaView, ScrollView } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle,
  withRepeat, withSequence, withTiming, Easing,
} from 'react-native-reanimated';
import { Audio } from 'expo-av';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTranslation } from 'react-i18next';
import { useOnboardingStore } from '@/store/onboardingStore';
import AudioPlayer from '@/components/AudioPlayer';

// ─── Mascot map ───────────────────────────────────────────────────────────────
const MASCOT_MAP: Record<string, { emoji: string; name: string; audio: number }> = {
  pixel: { emoji: '🤖', name: 'Pixel', audio: require('../../assets/audio/pixel_intro.mp3') },
  finn:  { emoji: '🦊', name: 'Finn',  audio: require('../../assets/audio/finn_intro.mp3')  },
  miga:  { emoji: '🧚', name: 'Miga',  audio: require('../../assets/audio/miga_intro.mp3')  },
  sage:  { emoji: '🦉', name: 'Sage',  audio: require('../../assets/audio/sage_intro.mp3')  },
};

// ─── Component ────────────────────────────────────────────────────────────────
export default function RoleScreen() {
  const { t } = useTranslation();
  const { mascotId } = useOnboardingStore();
  const mascot = MASCOT_MAP[mascotId] ?? MASCOT_MAP.miga;
  const mascotGender = ['finn', 'pixel'].includes(mascotId) ? 'boy' : 'girl';

  const ROLES = [
    { bg: '#EEEDFE', icon: '🎉', title: t('onboarding.role.role1'),
      desc: t('onboarding.role.role1Desc') },
    { bg: '#E1F5EE', icon: '🛠️', title: t('onboarding.role.role2'),
      desc: t('onboarding.role.role2Desc') },
    { bg: '#FAEEDA', icon: '💛', title: t('onboarding.role.role3'),
      desc: t('onboarding.role.role3Desc') },
    { bg: '#FAECE7', icon: '🛡️', title: t('onboarding.role.role4'),
      desc: t('onboarding.role.role4Desc') },
    { bg: '#EEEDFE', icon: '📣', title: t('onboarding.role.role5'),
      desc: t('onboarding.role.role5Desc') },
  ];

  const soundRef = useRef<Audio.Sound | null>(null);
  const floatY   = useSharedValue(0);

  useEffect(() => {
    Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
    floatY.value = withRepeat(
      withSequence(
        withTiming(-10, { duration: 1400, easing: Easing.inOut(Easing.sin) }),
        withTiming(0,   { duration: 1400, easing: Easing.inOut(Easing.sin) }),
      ),
      -1, false,
    );
    return () => { soundRef.current?.unloadAsync(); };
  }, []);

  const floatStyle = useAnimatedStyle(() => ({ transform: [{ translateY: floatY.value }] }));

  async function playIntro() {
    try {
      await soundRef.current?.unloadAsync();
      const { sound } = await Audio.Sound.createAsync(mascot.audio);
      soundRef.current = sound;
      await sound.playAsync();
    } catch { /* audio not yet copied */ }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F8F7FF' }}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 20, paddingBottom: 40 }}>

        {/* Progress */}
        <View style={{ height: 6, backgroundColor: '#E0E0E0', borderRadius: 3, marginBottom: 8 }}>
          <View style={{ width: '55%', height: '100%', backgroundColor: '#7F77DD', borderRadius: 3 }} />
        </View>
        <Text style={{ fontSize: 13, color: '#888780', marginBottom: 16 }}>
          {t('onboarding.stepOf', { current: 5, total: 9 })} · {t('onboarding.step5sub')} 🌟
        </Text>

        {/* Badge */}
        <View style={{ backgroundColor: '#E8F8F3', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, alignSelf: 'flex-start', marginBottom: 24 }}>
          <Text style={{ color: '#5DCAA5', fontSize: 13, fontWeight: '600' }}>{t('onboarding.role.badge')}</Text>
        </View>

        {/* Floating mascot — tap to play audio */}
        <TouchableOpacity onPress={playIntro} activeOpacity={0.8} style={{ alignItems: 'center', marginBottom: 12 }}>
          <Animated.Text style={[{ fontSize: 60 }, floatStyle]}>{mascot.emoji}</Animated.Text>
        </TouchableOpacity>

        {/* Mascot "happy you picked me" bubble */}
        <View style={{
          backgroundColor: '#fff', borderRadius: 16, borderTopLeftRadius: 4,
          borderWidth: 1.5, borderColor: '#E0E0E0', padding: 12,
          marginBottom: 28,
        }}>
          <Text style={{ fontSize: 13, color: '#2C2C2A', lineHeight: 20, textAlign: 'center' }}>
            {t(`onboarding.role.mascotHappyPicked.${mascotGender}`)}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'center', marginTop: 8 }}>
            <AudioPlayer
              text={t(`onboarding.role.mascotHappyPicked.${mascotGender}`)}
              characterId={mascotId}
              size="sm"
            />
            <Text style={{ fontSize: 11, color: '#888780', fontWeight: '600', marginLeft: 6 }}>
              {t('onboarding.mascot.hearbutton')}
            </Text>
          </View>
        </View>

        {/* Card */}
        <View style={{
          backgroundColor: '#fff',
          borderRadius: 20,
          overflow: 'hidden',
          marginBottom: 16,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.07,
          shadowRadius: 10,
          elevation: 3,
        }}>
          {/* Card header */}
          <View style={{ backgroundColor: '#EEEDFE', padding: 16, flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ fontSize: 40, marginRight: 12 }}>{mascot.emoji}</Text>
            <View>
              <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#2C2C2A' }}>{t('onboarding.role.mascotIntro', { name: mascot.name })}</Text>
              <Text style={{ fontSize: 12, color: '#7F77DD', marginTop: 2 }}>{t('onboarding.role.cardHeader')}</Text>
            </View>
          </View>

          {/* Role rows */}
          {ROLES.map((role, i) => (
            <View
              key={i}
              style={{
                flexDirection: 'row',
                alignItems: 'flex-start',
                paddingHorizontal: 16,
                paddingVertical: 14,
                borderTopWidth: i === 0 ? 0 : 1,
                borderTopColor: '#F5F5F5',
              }}
            >
              <View style={{
                width: 36, height: 36, borderRadius: 10,
                backgroundColor: role.bg,
                alignItems: 'center', justifyContent: 'center',
                marginRight: 12, flexShrink: 0,
              }}>
                <Text style={{ fontSize: 18 }}>{role.icon}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: 'bold', color: '#2C2C2A', marginBottom: 2 }}>{role.title}</Text>
                <Text style={{ fontSize: 12, color: '#888780', lineHeight: 17 }}>{role.desc}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Permanent note */}
        <View style={{
          backgroundColor: '#EEEDFE',
          borderRadius: 14,
          padding: 14,
          flexDirection: 'row',
          alignItems: 'flex-start',
          marginBottom: 32,
        }}>
          <Text style={{ fontSize: 20, marginRight: 10, flexShrink: 0 }}>{mascot.emoji}</Text>
          <Text style={{ fontSize: 12, color: '#534AB7', lineHeight: 19, flex: 1 }}>
            {t('onboarding.role.permanentNote', { mascot: mascot.name })}
          </Text>
        </View>

        {/* Buttons */}
        <TouchableOpacity
          onPress={() => router.push('/onboarding/interests')}
          style={{ backgroundColor: '#7F77DD', borderRadius: 9999, paddingVertical: 16, alignItems: 'center', marginBottom: 12 }}
          activeOpacity={0.85}
        >
          <Text style={{ color: '#fff', fontSize: 17, fontWeight: 'bold' }}>
            {t('onboarding.role.continueButton', { mascot: mascot.name })}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.back()} style={{ paddingVertical: 12, alignItems: 'center' }}>
          <Text style={{ color: '#BDBDBD', fontSize: 14 }}>← {t('common.back')}</Text>
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
}
