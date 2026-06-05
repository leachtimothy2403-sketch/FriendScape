import { useState, useRef, useEffect } from 'react';
import { TouchableOpacity, View, ActivityIndicator, StyleSheet, Text } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle,
  withRepeat, withSequence, withTiming,
} from 'react-native-reanimated';
import { Audio } from 'expo-av';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLanguageStore } from '@/store/languageStore';
import api from '@/services/api';

function nameToCharacterId(name: string): string {
  return name
    .toLowerCase()
    .replace(/\./g, '')
    .replace(/\s+(.)/g, (_, c: string) => c.toUpperCase());
}

type Size = 'sm' | 'md';
type PlayerState = 'idle' | 'loading' | 'playing';

interface Props {
  text: string;
  characterId: string;
  messageId?: string;
  size?: Size;
}

// Each bar lives in its own component so hooks aren't called inside .map()
function WaveBar({ height, delay, color }: { height: number; delay: number; color: string }) {
  const scaleY = useSharedValue(height);

  useEffect(() => {
    scaleY.value = withRepeat(
      withSequence(
        withTiming(1.0,    { duration: 200 + delay }),
        withTiming(height, { duration: 200 + delay }),
      ),
      -1, false,
    );
  }, []);

  const style = useAnimatedStyle(() => ({ transform: [{ scaleY: scaleY.value }] }));
  return <Animated.View style={[s.waveBar, { backgroundColor: color, height: 12 }, style]} />;
}

function SoundWave({ color }: { color: string }) {
  const bars = [0.4, 0.9, 0.6, 1.0, 0.5, 0.8, 0.3];
  return (
    <View style={s.waveContainer}>
      {bars.map((height, i) => (
        <WaveBar key={i} height={height} delay={i * 60} color={color} />
      ))}
    </View>
  );
}

export default function AudioPlayer({ text, characterId, messageId, size = 'sm' }: Props) {
  const { language } = useLanguageStore();
  const [state, setState] = useState<PlayerState>('idle');
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);

  const dim = size === 'sm' ? 32 : 40;

  async function handlePress() {
    if (state === 'playing') {
      await soundRef.current?.stopAsync();
      setState('idle');
      return;
    }

    if (state === 'loading') return;

    let url = audioUrl;

    if (!url) {
      setState('loading');
      try {
        const token = await AsyncStorage.getItem('childToken');
        const normalised = nameToCharacterId(characterId);

        const res = await api.post<{ audioUrl: string }>(
          '/audio/generate',
          { text, characterId: normalised, language, messageId },
          token ? { headers: { Authorization: `Bearer ${token}` } } : undefined,
        );

        url = res.data.audioUrl.startsWith('http')
          ? res.data.audioUrl
          : `${api.defaults.baseURL ?? ''}${res.data.audioUrl}`;

        setAudioUrl(url);
      } catch {
        setState('idle');
        return;
      }
    }

    setState('playing');
    try {
      await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
      await soundRef.current?.unloadAsync();
      const { sound } = await Audio.Sound.createAsync({ uri: url! });
      soundRef.current = sound;
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          setState('idle');
        }
      });
      await sound.playAsync();
    } catch {
      setState('idle');
    }
  }

  const bgColor   = '#EEEDFE';
  const iconColor = '#7F77DD';

  return (
    <TouchableOpacity
      onPress={() => void handlePress()}
      style={[s.button, { width: dim, height: dim, borderRadius: dim / 2, backgroundColor: bgColor }]}
      activeOpacity={0.7}
    >
      {state === 'loading' && <ActivityIndicator size="small" color={iconColor} />}
      {state === 'playing' && <SoundWave color={iconColor} />}
      {state === 'idle'    && <Text style={{ fontSize: size === 'sm' ? 14 : 18 }}>🔊</Text>}
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  button: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  waveContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  waveBar: {
    width: 3,
    borderRadius: 2,
  },
});
