import { useEffect, useMemo } from 'react';
import { View, Text, TouchableOpacity, SafeAreaView, Dimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTranslation } from 'react-i18next';

const { width: W, height: H } = Dimensions.get('window');

const CONFETTI_COLORS = ['#7F77DD', '#5DCAA5', '#EF9F27', '#ED93B1', '#FFD700', '#FF6B6B', '#4ECDC4', '#A8E6CF'];

type ParticleProps = { x: number; color: string; size: number; delay: number; duration: number };

function ConfettiParticle({ x, color, size, delay, duration }: ParticleProps) {
  const y        = useSharedValue(-80);
  const rotation = useSharedValue(0);

  useEffect(() => {
    y.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(H + 80, { duration, easing: Easing.linear }),
          withTiming(-80,    { duration: 16 }),
        ),
        -1,
        false,
      ),
    );
    rotation.value = withDelay(
      delay,
      withRepeat(withTiming(360, { duration: 1000, easing: Easing.linear }), -1, false),
    );
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: y.value }, { rotate: `${rotation.value}deg` }],
  }));

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: x,
          top: 0,
          width: size,
          height: size,
          backgroundColor: color,
          borderRadius: size * 0.3,
        },
        animStyle,
      ]}
    />
  );
}

function Confetti() {
  const particles = useMemo(
    () =>
      Array.from({ length: 28 }, (_, i) => ({
        x:        Math.random() * W,
        color:    CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        size:     8 + Math.random() * 9,
        delay:    Math.random() * 1800,
        duration: 2400 + Math.random() * 1600,
      })),
    [],
  );

  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
      {particles.map((p, i) => <ConfettiParticle key={i} {...p} />)}
    </View>
  );
}

function FloatingFairy() {
  const y = useSharedValue(0);
  useEffect(() => {
    y.value = withRepeat(
      withSequence(
        withTiming(-12, { duration: 1400, easing: Easing.inOut(Easing.sin) }),
        withTiming(0,   { duration: 1400, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    );
  }, []);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  return <Animated.Text style={[{ fontSize: 52, textAlign: 'center' }, style]}>🧚</Animated.Text>;
}

export default function CelebrationScreen() {
  const { t } = useTranslation();

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <StatusBar style="dark" />

      <Confetti />

      <View className="flex-1 items-center justify-center px-8">

        <Text style={{ fontSize: 80, marginBottom: 4 }}>🎉</Text>

        <Text style={{ fontSize: 28, fontWeight: 'bold', color: '#2C2C2A', textAlign: 'center', marginBottom: 12 }}>
          {t('celebration.title')}
        </Text>

        <Text style={{ fontSize: 15, color: '#888780', textAlign: 'center', maxWidth: 300, lineHeight: 22, marginBottom: 28 }}>
          {t('celebration.subtitle')}
        </Text>

        {/* Parent card */}
        <View
          className="w-full bg-white rounded-3xl p-6 mb-8"
          style={{ shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 12, elevation: 3 }}
        >
          <Text style={{ fontSize: 15, fontWeight: '600', color: '#2C2C2A', lineHeight: 24, textAlign: 'center' }}>
            👨‍👩‍👧 {t('celebration.parentNote')}
          </Text>
        </View>

        {/* CTA */}
        <TouchableOpacity
          style={{ width: '100%', alignItems: 'center', paddingVertical: 16, marginBottom: 28, backgroundColor: '#7F77DD', borderRadius: 9999 }}
          onPress={() => router.replace('/onboarding/basics')}
          activeOpacity={0.85}
        >
          <Text style={{ color: '#fff', fontSize: 18, fontWeight: 'bold' }}>{t('celebration.button')}</Text>
        </TouchableOpacity>

        <FloatingFairy />

      </View>
    </SafeAreaView>
  );
}
