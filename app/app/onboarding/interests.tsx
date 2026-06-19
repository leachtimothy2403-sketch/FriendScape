import { useState, useRef, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, SafeAreaView,
  ScrollView, TextInput, Platform, useWindowDimensions,
  KeyboardAvoidingView, Image,
} from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle,
  withRepeat, withSequence, withTiming, Easing,
} from 'react-native-reanimated';
import { Audio } from 'expo-av';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTranslation } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useOnboardingStore } from '@/store/onboardingStore';
import { useLanguageStore } from '@/store/languageStore';
import { audioApi, mascotAvatars as mascotAvatarApi } from '@/services/api';
import AudioPlayer from '@/components/AudioPlayer';

const MASCOT_MAP: Record<string, { emoji: string }> = {
  pixel: { emoji: '🤖' },
  finn:  { emoji: '🦊' },
  miga:  { emoji: '🧚' },
  sage:  { emoji: '🦉' },
};

const INTERESTS_BASE = [
  { id: 'art',      emoji: '🎨' },
  { id: 'sports',   emoji: '⚽' },
  { id: 'animals',  emoji: '🐾' },
  { id: 'gaming',   emoji: '🎮' },
  { id: 'reading',  emoji: '📚' },
  { id: 'music',    emoji: '🎵' },
  { id: 'cooking',  emoji: '🍳' },
  { id: 'science',  emoji: '🚀' },
  { id: 'nature',   emoji: '🌿' },
  { id: 'drama',    emoji: '🎭' },
  { id: 'building', emoji: '🏗️' },
  { id: 'dance',    emoji: '💃' },
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

  const { language } = useLanguageStore();
  const displayName = childName.trim() || 'you';
  const mascot      = MASCOT_MAP[mascotId] ?? MASCOT_MAP.miga;

  const scrollRef = useRef<ScrollView>(null);

  const [mascotAvatarUrl, setMascotAvatarUrl] = useState<string | null>(null);
  const [isRecording, setIsRecording]         = useState(false);
  const [voiceRecorded, setVoiceRecorded]     = useState(false);
  const recordingRef = useRef<Audio.Recording | null>(null);

  const floatY = useSharedValue(0);
  const pulse  = useSharedValue(1);

  useEffect(() => {
    mascotAvatarApi.get().then(res => {
      const url = res.data.mascots[mascotId];
      if (url) setMascotAvatarUrl(url);
    }).catch(() => {});
  }, [mascotId]);

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
      recordingRef.current?.stopAndUnloadAsync();
    };
  }, []);

  const floatStyle = useAnimatedStyle(() => ({ transform: [{ translateY: floatY.value }] }));
  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));

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
        const uri = recordingRef.current?.getURI();
        recordingRef.current = null;
        await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
        if (!uri) return;

        const base64 = await new Promise<string>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.responseType = 'arraybuffer';
          xhr.onload = () => {
            const bytes = new Uint8Array(xhr.response as ArrayBuffer);
            let binary = '';
            for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
            resolve(btoa(binary));
          };
          xhr.onerror = reject;
          xhr.open('GET', uri);
          xhr.send();
        });

        const token = await AsyncStorage.getItem('childToken');
        const result = await audioApi.transcribe(token, {
          audioBase64: base64,
          mimeType: 'audio/m4a',
          language,
        });
        const transcript = result.data.transcript?.trim();
        if (transcript) {
          setFreeInterest(transcript);
          setVoiceRecorded(true);
        }
      } catch { /* ignore */ }
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
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{ paddingHorizontal: HPAD, paddingTop: 20, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Progress */}
        <View style={{ height: 6, backgroundColor: '#E0E0E0', borderRadius: 3, marginBottom: 8 }}>
          <View style={{ width: '75%', height: '100%', backgroundColor: '#7F77DD', borderRadius: 3 }} />
        </View>
        <Text style={{ fontSize: 13, color: '#888780', marginBottom: 16 }}>
          {t('onboarding.stepOf', { current: 6, total: 8 })} · {t('onboarding.step6sub')}
        </Text>

        {/* Badge */}
        <View style={{ backgroundColor: '#E8F8F3', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, alignSelf: 'flex-start', marginBottom: 24 }}>
          <Text style={{ color: '#5DCAA5', fontSize: 13, fontWeight: '600' }}>
            🌟 {t('onboarding.interests.title', { name: displayName })}
          </Text>
        </View>

        {/* Mascot speech bubble */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 28 }}>
          <Animated.View style={[floatStyle, { marginRight: 10, marginTop: 4 }]}>
            {mascotAvatarUrl
              ? <Image source={{ uri: mascotAvatarUrl }} style={{ width: 36, height: 36, borderRadius: 18 }} />
              : <Text style={{ fontSize: 36 }}>{mascot.emoji}</Text>
            }
          </Animated.View>
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
                {t('onboarding.interests.mascotSpeech')}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', marginTop: 8 }}>
                <AudioPlayer
                  text={t('onboarding.interests.mascotSpeech')}
                  characterId={mascotId || 'miga'}
                  size="sm"
                />
                <Text style={{ fontSize: 11, color: '#888780', fontWeight: '600', marginLeft: 6 }}>{t('discover.hearMe')}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Interest tiles — 3-column grid */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: GAP, marginBottom: 28 }}>
          {INTERESTS_BASE.map((item) => {
            const itemName = t(`onboarding.interests.${item.id}`);
            const sel = interests.includes(itemName);
            return (
              <TouchableOpacity
                key={item.id}
                onPress={() => toggleInterest(itemName)}
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
                  {itemName}
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
            onFocus={() => { setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100); }}
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
          onPress={() => router.push('/onboarding/personality' as never)}
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
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
