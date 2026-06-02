import { useState, useRef, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, SafeAreaView,
  ScrollView, TextInput, Platform, useWindowDimensions,
} from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle,
  withRepeat, withSequence, withTiming, Easing,
} from 'react-native-reanimated';
import { Audio } from 'expo-av';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTranslation } from 'react-i18next';
import { useOnboardingStore } from '@/store/onboardingStore';

const MASCOT_MAP: Record<string, { emoji: string; audio: number }> = {
  pixel: { emoji: '🤖', audio: require('../../assets/audio/pixel_intro.mp3') },
  finn:  { emoji: '🦊', audio: require('../../assets/audio/finn_intro.mp3')  },
  miga:  { emoji: '🧚', audio: require('../../assets/audio/lumi_intro.mp3')  },
  sage:  { emoji: '🦉', audio: require('../../assets/audio/sage_intro.mp3')  },
};

const INTERESTS = [
  { id: 'art',      emoji: '🎨', name: 'Art'      },
  { id: 'sports',   emoji: '⚽', name: 'Sports'   },
  { id: 'animals',  emoji: '🐾', name: 'Animals'  },
  { id: 'gaming',   emoji: '🎮', name: 'Gaming'   },
  { id: 'reading',  emoji: '📚', name: 'Reading'  },
  { id: 'music',    emoji: '🎵', name: 'Music'    },
  { id: 'cooking',  emoji: '🍳', name: 'Cooking'  },
  { id: 'science',  emoji: '🚀', name: 'Science'  },
  { id: 'nature',   emoji: '🌿', name: 'Nature'   },
  { id: 'drama',    emoji: '🎭', name: 'Drama'    },
  { id: 'building', emoji: '🏗️', name: 'Building' },
  { id: 'dance',    emoji: '💃', name: 'Dance'    },
];

export default function InterestsScreen() {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const GAP   = 10;
  const HPAD  = 24;
  const tileW = (width - HPAD * 2 - GAP * 2) / 3;

  const {
    childName, mascotId,
    interests, setInterests,
    freeInterest, setFreeInterest,
  } = useOnboardingStore();

  const displayName = childName.trim() || 'you';
  const mascot      = MASCOT_MAP[mascotId] ?? MASCOT_MAP.miga;

  const [isRecording, setIsRecording]     = useState(false);
  const [voiceRecorded, setVoiceRecorded] = useState(false);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const soundRef     = useRef<Audio.Sound | null>(null);

  const floatY = useSharedValue(0);
  const pulse  = useSharedValue(1);

  useEffect(() => {
    Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
    floatY.value = withRepeat(
      withSequence(
        withTiming(-8, { duration: 1200, easing: Easing.inOut(Easing.sin) }),
        withTiming(0,  { duration: 1200, easing: Easing.inOut(Easing.sin) }),
      ),
      -1, false,
    );
    return () => {
      soundRef.current?.unloadAsync();
      recordingRef.current?.stopAndUnloadAsync();
    };
  }, []);

  const floatStyle = useAnimatedStyle(() => ({ transform: [{ translateY: floatY.value }] }));
  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));

  async function playMascotAudio() {
    try {
      await soundRef.current?.unloadAsync();
      const { sound } = await Audio.Sound.createAsync(mascot.audio);
      soundRef.current = sound;
      await sound.playAsync();
    } catch { /* file not yet copied */ }
  }

  function toggleInterest(name: string) {
    setInterests(
      interests.includes(name)
        ? interests.filter((i) => i !== name)
        : [...interests, name],
    );
  }

  async function handleMicPress() {
    if (Platform.OS === 'web') return;

    if (isRecording) {
      pulse.value = withTiming(1);
      setIsRecording(false);
      try {
        await recordingRef.current?.stopAndUnloadAsync();
      } catch { /* ignore */ }
      recordingRef.current = null;
      setVoiceRecorded(true);
      setFreeInterest((freeInterest + ' [voice note]').trim());
    } else {
      try {
        const { granted } = await Audio.requestPermissionsAsync();
        if (!granted) return;
        await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
        const { recording } = await Audio.Recording.createAsync(
          Audio.RecordingOptionsPresets.HIGH_QUALITY,
        );
        recordingRef.current = recording;
        setIsRecording(true);
        setVoiceRecorded(false);
        pulse.value = withRepeat(
          withSequence(
            withTiming(1.25, { duration: 500 }),
            withTiming(1,    { duration: 500 }),
          ),
          -1, false,
        );
      } catch { /* permission denied or unavailable */ }
    }
  }

  const canContinue = interests.length > 0;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F8F7FF' }}>
      <StatusBar style="dark" />
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: HPAD, paddingTop: 20, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Progress */}
        <View style={{ height: 6, backgroundColor: '#E0E0E0', borderRadius: 3, marginBottom: 8 }}>
          <View style={{ width: '66%', height: '100%', backgroundColor: '#7F77DD', borderRadius: 3 }} />
        </View>
        <Text style={{ fontSize: 13, color: '#888780', marginBottom: 16 }}>
          Step 6 of 9 · {t('onboarding.interests.title', { name: displayName })}
        </Text>

        {/* Badge */}
        <View style={{ backgroundColor: '#E8F8F3', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, alignSelf: 'flex-start', marginBottom: 24 }}>
          <Text style={{ color: '#5DCAA5', fontSize: 13, fontWeight: '600' }}>
            🌟 {t('onboarding.interests.title', { name: displayName })}
          </Text>
        </View>

        {/* Mascot speech bubble */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 28 }}>
          <TouchableOpacity onPress={() => void playMascotAudio()} activeOpacity={0.8}>
            <Animated.Text style={[{ fontSize: 36, marginRight: 10, marginTop: 4 }, floatStyle]}>
              {mascot.emoji}
            </Animated.Text>
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <View style={{
              backgroundColor: '#fff',
              borderRadius: 16,
              borderTopLeftRadius: 4,
              borderWidth: 1.5,
              borderColor: '#E0E0E0',
              padding: 12,
            }}>
              <Text style={{ fontSize: 13, color: '#2C2C2A', lineHeight: 20 }}>
                Now the fun part!! Tap everything you love — this helps me find your perfect friends! Pick as many as you want! 🎉
              </Text>
              <TouchableOpacity
                onPress={() => void playMascotAudio()}
                style={{
                  flexDirection: 'row', alignItems: 'center',
                  alignSelf: 'flex-start', marginTop: 8,
                  backgroundColor: '#F0F0F0', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20,
                }}
              >
                <Text style={{ fontSize: 12, marginRight: 4 }}>🔊</Text>
                <Text style={{ fontSize: 11, color: '#888780', fontWeight: '600' }}>Hear me</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Interest tiles — 3-column grid */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: GAP, marginBottom: 28 }}>
          {INTERESTS.map((item) => {
            const sel = interests.includes(item.name);
            return (
              <TouchableOpacity
                key={item.id}
                onPress={() => toggleInterest(item.name)}
                style={{
                  width: tileW,
                  aspectRatio: 1,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 12,
                  borderWidth: 2,
                  borderColor: sel ? '#7F77DD' : '#E8E6FF',
                  backgroundColor: sel ? '#EEEDFE' : '#fff',
                  padding: 6,
                }}
                activeOpacity={0.7}
              >
                <Text style={{ fontSize: 26 }}>{item.emoji}</Text>
                <Text style={{
                  fontSize: 11, fontWeight: 'bold', marginTop: 4, textAlign: 'center',
                  color: sel ? '#7F77DD' : '#2C2C2A',
                }}>
                  {item.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Free text + voice */}
        <Text style={{ fontSize: 12, fontWeight: '700', color: '#888780', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
          {t('onboarding.interests.freeTextLabel')}
        </Text>

        <View style={{
          backgroundColor: '#fff',
          borderRadius: 14,
          borderWidth: 1.5,
          borderColor: '#E0E0E0',
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 14,
          paddingVertical: 10,
          marginBottom: voiceRecorded ? 8 : 28,
        }}>
          <TextInput
            style={{ flex: 1, fontSize: 14, color: '#2C2C2A', minHeight: 40 }}
            placeholder={t('onboarding.interests.freeTextPlaceholder')}
            placeholderTextColor="#BDBDBD"
            value={freeInterest}
            onChangeText={setFreeInterest}
            multiline
          />
          {Platform.OS !== 'web' && (
            <Animated.View style={pulseStyle}>
              <TouchableOpacity
                onPress={() => void handleMicPress()}
                style={{
                  width: 38, height: 38, borderRadius: 19,
                  backgroundColor: isRecording ? '#D85A30' : '#EF9F27',
                  alignItems: 'center', justifyContent: 'center',
                  marginLeft: 10, flexShrink: 0,
                }}
                activeOpacity={0.8}
              >
                <Text style={{ fontSize: 18 }}>{isRecording ? '⏹️' : '🎤'}</Text>
              </TouchableOpacity>
            </Animated.View>
          )}
        </View>

        {voiceRecorded && (
          <Text style={{ fontSize: 12, color: '#5DCAA5', fontWeight: '600', marginBottom: 20 }}>
            ✓ Voice recorded!
          </Text>
        )}

        {/* Buttons */}
        <TouchableOpacity
          onPress={() => router.push('/onboarding/pack')}
          disabled={!canContinue}
          style={{
            backgroundColor: canContinue ? '#7F77DD' : '#E0E0E0',
            borderRadius: 9999, paddingVertical: 16, alignItems: 'center', marginBottom: 12,
          }}
          activeOpacity={0.85}
        >
          <Text style={{ color: canContinue ? '#fff' : '#BDBDBD', fontSize: 17, fontWeight: 'bold' }}>
            {t('onboarding.interests.continueButton')}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.back()} style={{ paddingVertical: 12, alignItems: 'center' }}>
          <Text style={{ color: '#BDBDBD', fontSize: 14 }}>← {t('common.back')}</Text>
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
}
