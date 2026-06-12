import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, SafeAreaView } from 'react-native';
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
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import { auth } from '@/services/api';

const JOKES_EN = [
  { setup: 'Why did the scarecrow win an award?',        punchline: 'Because he was outstanding in his field! 🌾' },
  { setup: 'What do you call a sleeping dinosaur?',      punchline: 'A dino-snore! 🦕' },
  { setup: "Why don't scientists trust atoms?",          punchline: 'Because they make up everything! ⚛️' },
  { setup: "What do you call cheese that isn't yours?",  punchline: 'Nacho cheese! 🧀' },
  { setup: 'Why did the bicycle fall over?',             punchline: 'Because it was two-tired! 🚲' },
  { setup: 'What did the ocean say to the beach?',       punchline: 'Nothing, it just waved! 🌊' },
];

const JOKES_FR = [
  { setup: "Qu'est-ce qu'un crocodile qui surveille la pharmacie ?",  punchline: 'Un pharmacrocodile ! 🐊' },
  { setup: 'Pourquoi les plongeurs plongent-ils en arrière ?',        punchline: 'Parce que sinon ils tomberaient dans le bateau ! 🤿' },
  { setup: "Qu'est-ce qu'un canif ?",                                 punchline: 'Le petit frère du canif... couteau ! 🔪😂' },
  { setup: 'Comment appelle-t-on un chat tombé dans un pot de peinture ?', punchline: 'Un chat-peint ! 🎨' },
  { setup: 'Pourquoi les fantômes font-ils de mauvais menteurs ?',    punchline: "Parce qu'on voit à travers eux ! 👻" },
  { setup: "Qu'est-ce qu'un éléphant transparent ?",                  punchline: 'Un éléphantolérant ! 🐘' },
];

function FloatingEmoji({ children }: { children: string }) {
  const y = useSharedValue(0);
  useEffect(() => {
    y.value = withRepeat(
      withSequence(
        withTiming(-18, { duration: 1200, easing: Easing.inOut(Easing.sin) }),
        withTiming(0,   { duration: 1200, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    );
  }, []);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  return <Animated.Text style={[{ fontSize: 80, marginBottom: 24 }, style]}>{children}</Animated.Text>;
}

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
        -1,
        false,
      ),
    );
  }, [delay]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Animated.View
      style={[
        { width: 10, height: 10, borderRadius: 5, backgroundColor: '#7F77DD', marginHorizontal: 4 },
        style,
      ]}
    />
  );
}

export default function WaitingScreen() {
  const { t, i18n } = useTranslation();
  const [jokeIndex, setJokeIndex]        = useState(0);
  const [showPunchline, setShowPunchline] = useState(false);
  const [parentEmail, setParentEmail]    = useState<string | null>(null);

  const JOKES = i18n.language === 'fr' ? JOKES_FR : JOKES_EN;

  useEffect(() => {
    AsyncStorage.getItem('pendingParentEmail').then(setParentEmail);
  }, []);

  useEffect(() => {
    if (!parentEmail) return;
    const poll = async () => {
      try {
        const res = await auth.enrollmentStatus(parentEmail);
        if (res.data.status === 'approved') {
          router.replace('/celebration');
        }
      } catch {
        // silent — don't surface background poll errors to the child
      }
    };
    void poll();
    const id = setInterval(() => void poll(), 5000);
    return () => clearInterval(id);
  }, [parentEmail]);

  const nextJoke = () => {
    setShowPunchline(false);
    setJokeIndex((i) => (i + 1) % JOKES.length);
  };

  const handleSimulate = async () => {
    if (!parentEmail) return;
    try {
      await auth.simulateApprove({ parentEmail });
      router.replace('/celebration');
    } catch (err) {
      console.error('Simulate approve failed:', err);
    }
  };

  const joke = JOKES[jokeIndex];

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <StatusBar style="dark" />
      <View className="flex-1 items-center justify-center px-8">

        <FloatingEmoji>📨</FloatingEmoji>

        <Text style={{ fontSize: 28, fontWeight: 'bold', color: '#2C2C2A', textAlign: 'center', marginBottom: 12 }}>
          {t('waiting.title')}
        </Text>

        <Text style={{ fontSize: 15, color: '#888780', textAlign: 'center', maxWidth: 300, lineHeight: 22, marginBottom: 32 }}>
          {t('waiting.subtitle')}
        </Text>

        {/* Pulsing dots */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
          <PulsingDot delay={0} />
          <PulsingDot delay={220} />
          <PulsingDot delay={440} />
        </View>
        <Text style={{ fontSize: 13, color: '#BDBDBD', marginBottom: 36 }}>{t('waiting.waitingFor')}</Text>

        {/* Joke card */}
        <View
          className="w-full bg-white rounded-3xl p-6 mb-4"
          style={{ shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 12, elevation: 3 }}
        >
          <Text style={{ fontSize: 14, fontWeight: '600', color: '#7F77DD', marginBottom: 12 }}>
            {t('waiting.jokeLabel')}
          </Text>
          <Text style={{ fontSize: 15, color: '#2C2C2A', fontWeight: '600', marginBottom: 10 }}>
            {joke.setup}
          </Text>
          {showPunchline ? (
            <Text style={{ fontSize: 15, color: '#5DCAA5', fontWeight: '600' }}>
              {joke.punchline}
            </Text>
          ) : (
            <TouchableOpacity onPress={() => setShowPunchline(true)}>
              <Text style={{ fontSize: 14, color: '#BDBDBD' }}>{t('waiting.tapToReveal')}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={{ marginTop: 16, alignItems: 'center' }} onPress={nextJoke}>
            <Text style={{ color: '#7F77DD', fontSize: 14, fontWeight: '600' }}>{t('waiting.anotherJoke')}</Text>
          </TouchableOpacity>
        </View>

        {/* DEV only: simulate approval */}
        {__DEV__ && (
          <TouchableOpacity
            style={{ marginTop: 8, alignItems: 'center', paddingVertical: 12, paddingHorizontal: 24, borderRadius: 9999, backgroundColor: '#E0E0E0' }}
            onPress={() => void handleSimulate()}
          >
            <Text style={{ color: '#757575', fontSize: 13 }}>{t('waiting.simulateButton')}</Text>
          </TouchableOpacity>
        )}

      </View>
    </SafeAreaView>
  );
}
