import { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, SafeAreaView, ScrollView } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle,
  withRepeat, withSequence, withTiming, Easing,
} from 'react-native-reanimated';
import { Audio } from 'expo-av';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useOnboardingStore } from '@/store/onboardingStore';

// ─── Mascot map ───────────────────────────────────────────────────────────────
const MASCOT_MAP: Record<string, { emoji: string; name: string; audio: number }> = {
  pixel: { emoji: '🤖', name: 'Pixel', audio: require('../../assets/audio/pixel_intro.mp3') },
  finn:  { emoji: '🦊', name: 'Finn',  audio: require('../../assets/audio/finn_intro.mp3')  },
  miga:  { emoji: '🧚', name: 'Miga',  audio: require('../../assets/audio/lumi_intro.mp3')  },
  sage:  { emoji: '🦉', name: 'Sage',  audio: require('../../assets/audio/sage_intro.mp3')  },
};

const ROLES = [
  { bg: '#EEEDFE', icon: '🎉', title: 'I celebrate every win',
    desc: "Every badge, level-up, and milestone — I'll be the first to cheer for you" },
  { bg: '#E1F5EE', icon: '🛠️', title: 'I fix things',
    desc: "If the app does something weird, just tell me and I'll sort it out" },
  { bg: '#FAEEDA', icon: '💛', title: 'I check in on you',
    desc: "If you haven't been around for a while, I'll send a friendly hello" },
  { bg: '#FAECE7', icon: '🛡️', title: 'I keep you safe',
    desc: "If anything ever feels wrong, come to me first — I've got you" },
  { bg: '#EEEDFE', icon: '📣', title: 'I share the news',
    desc: "New friends, seasonal themes, app updates — you'll hear it from me first" },
];

// ─── Component ────────────────────────────────────────────────────────────────
export default function RoleScreen() {
  const { mascotId } = useOnboardingStore();
  const mascot = MASCOT_MAP[mascotId] ?? MASCOT_MAP.miga;

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
          <View style={{ width: '50%', height: '100%', backgroundColor: '#7F77DD', borderRadius: 3 }} />
        </View>
        <Text style={{ fontSize: 13, color: '#888780', marginBottom: 16 }}>Step 5 of 10 · Meet your guide 🌟</Text>

        {/* Badge */}
        <View style={{ backgroundColor: '#E8F8F3', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, alignSelf: 'flex-start', marginBottom: 24 }}>
          <Text style={{ color: '#5DCAA5', fontSize: 13, fontWeight: '600' }}>🌟 Your forever guide</Text>
        </View>

        {/* Floating mascot — tap to play audio */}
        <TouchableOpacity onPress={playIntro} activeOpacity={0.8} style={{ alignItems: 'center', marginBottom: 28 }}>
          <Animated.Text style={[{ fontSize: 60 }, floatStyle]}>{mascot.emoji}</Animated.Text>
        </TouchableOpacity>

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
              <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#2C2C2A' }}>Hi, I'm {mascot.name}! 👋</Text>
              <Text style={{ fontSize: 12, color: '#7F77DD', marginTop: 2 }}>Your guide, helper & cheerleader — always</Text>
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
            Unlike your other friends, <Text style={{ fontWeight: '700' }}>{mascot.name}</Text> is always there — you can never remove me, and I'll never go away. I'm yours forever!
          </Text>
        </View>

        {/* Buttons */}
        <TouchableOpacity
          onPress={() => router.push('/onboarding/interests')}
          style={{ backgroundColor: '#7F77DD', borderRadius: 9999, paddingVertical: 16, alignItems: 'center', marginBottom: 12 }}
          activeOpacity={0.85}
        >
          <Text style={{ color: '#fff', fontSize: 17, fontWeight: 'bold' }}>
            I love that, {mascot.name}! →
          </Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.back()} style={{ paddingVertical: 12, alignItems: 'center' }}>
          <Text style={{ color: '#BDBDBD', fontSize: 14 }}>← Back</Text>
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
}
