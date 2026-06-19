import { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, SafeAreaView,
  ScrollView, TextInput, Platform, KeyboardAvoidingView, Image,
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

const MASCOT_EMOJI: Record<string, string> = {
  pixel: '🤖',
  finn:  '🦊',
  miga:  '🧚',
  sage:  '🦉',
};

interface Option {
  id: string;
  labelKey: string;
  descKey?: string;
}

interface Question {
  id: string;
  questionKey: string;
  options: Option[];
}

const QUESTIONS: Question[] = [
  {
    id: 'q1',
    questionKey: 'q1',
    options: [
      { id: 'quiet_listener', labelKey: 'q1_quiet', descKey: 'q1_quiet_desc' },
      { id: 'middle',         labelKey: 'q1_mid'   },
      { id: 'chatty',         labelKey: 'q1_chatty', descKey: 'q1_chatty_desc' },
    ],
  },
  {
    id: 'q2',
    questionKey: 'q2',
    options: [
      { id: 'feels_deeply',   labelKey: 'q2_deeply',    descKey: 'q2_deeply_desc' },
      { id: 'resilient_mid',  labelKey: 'q2_mid'        },
      { id: 'resilient',      labelKey: 'q2_resilient',  descKey: 'q2_resilient_desc' },
    ],
  },
  {
    id: 'q3',
    questionKey: 'q3',
    options: [
      { id: 'funny',          labelKey: 'q3_funny'      },
      { id: 'kind_caring',    labelKey: 'q3_kind'       },
      { id: 'thoughtful',     labelKey: 'q3_thoughtful' },
      { id: 'creative',       labelKey: 'q3_creative'   },
    ],
  },
  {
    id: 'q4',
    questionKey: 'q4',
    options: [
      { id: 'homebody',       labelKey: 'q4_home', descKey: 'q4_home_desc' },
      { id: 'balanced',       labelKey: 'q4_both' },
      { id: 'adventurous',    labelKey: 'q4_out',  descKey: 'q4_out_desc'  },
    ],
  },
  {
    id: 'q5',
    questionKey: 'q5',
    options: [
      { id: 'shy',            labelKey: 'q5_nervous', descKey: 'q5_nervous_desc' },
      { id: 'situational',    labelKey: 'q5_depends'  },
      { id: 'outgoing',       labelKey: 'q5_excited', descKey: 'q5_excited_desc' },
    ],
  },
];

const MAX_FREE_TEXT = 200;

export default function PersonalityScreen() {
  const { t } = useTranslation();
  const language = useLanguageStore((s) => s.language);

  const {
    childName,
    gender,
    mascotId,
    personalityTraits, setPersonalityTraits,
    personalityFreeText, setPersonalityFreeText,
  } = useOnboardingStore();

  const displayName = childName.trim() || 'you';
  const mascotEmoji = MASCOT_EMOJI[mascotId] ?? '🧚';
  const mascotName  = mascotId ? (mascotId.charAt(0).toUpperCase() + mascotId.slice(1)) : 'Miga';

  // selections: one chosen traitId per question group
  const [selections, setSelections] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const q of QUESTIONS) {
      const match = personalityTraits.find((t) => q.options.some((o) => o.id === t));
      if (match) init[q.id] = match;
    }
    return init;
  });

  const scrollRef   = useRef<ScrollView>(null);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const floatY      = useSharedValue(0);
  const pulse       = useSharedValue(1);

  const [mascotAvatarUrl, setMascotAvatarUrl] = useState<string | null>(null);
  const [isRecording, setIsRecording]         = useState(false);
  const [voiceRecorded, setVoiceRecorded]     = useState(false);

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
    return () => { recordingRef.current?.stopAndUnloadAsync(); };
  }, []);

  const floatStyle = useAnimatedStyle(() => ({ transform: [{ translateY: floatY.value }] }));
  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));

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
          if (personalityFreeText.length + transcript.length <= MAX_FREE_TEXT) {
            setPersonalityFreeText((personalityFreeText + ' ' + transcript).trim());
          } else {
            setPersonalityFreeText(transcript.slice(0, MAX_FREE_TEXT));
          }
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

  function selectTrait(questionId: string, traitId: string) {
    const next = { ...selections };
    if (next[questionId] === traitId) {
      delete next[questionId];
    } else {
      next[questionId] = traitId;
    }
    setSelections(next);
    setPersonalityTraits(Object.values(next));
  }

  function handleFreeText(text: string) {
    if (text.length <= MAX_FREE_TEXT) {
      setPersonalityFreeText(text);
    }
  }

  function handleContinue() {
    setPersonalityTraits(Object.values(selections));
    router.push('/onboarding/pack');
  }

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
        contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 20, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Progress */}
        <View style={{ height: 6, backgroundColor: '#E0E0E0', borderRadius: 3, marginBottom: 8 }}>
          <View style={{ width: '77%', height: '100%', backgroundColor: '#7F77DD', borderRadius: 3 }} />
        </View>
        <Text style={{ fontSize: 13, color: '#888780', marginBottom: 16 }}>
          {t('onboarding.stepOf', { current: 7, total: 9 })} · {t('onboarding.step7sub')}
        </Text>

        {/* Badge */}
        <View style={{
          backgroundColor: '#E8F8F3', paddingHorizontal: 12, paddingVertical: 6,
          borderRadius: 20, alignSelf: 'flex-start', marginBottom: 24,
        }}>
          <Text style={{ color: '#5DCAA5', fontSize: 13, fontWeight: '600' }}>
            🌟 {t('onboarding.personality.title', { name: displayName })}
          </Text>
        </View>

        {/* Mascot bubble */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 28 }}>
          <Animated.View style={[floatStyle, { marginRight: 10, marginTop: 4 }]}>
            {mascotAvatarUrl
              ? <Image source={{ uri: mascotAvatarUrl }} style={{ width: 36, height: 36, borderRadius: 18 }} />
              : <Text style={{ fontSize: 36 }}>{mascotEmoji}</Text>
            }
          </Animated.View>
          <View style={{ flex: 1 }}>
            <View style={{
              backgroundColor: '#fff', borderRadius: 16, borderTopLeftRadius: 4,
              borderWidth: 1.5, borderColor: '#E0E0E0', padding: 12,
            }}>
              <Text style={{ fontSize: 13, color: '#2C2C2A', lineHeight: 20 }}>
                {t(gender === 'girl' ? 'onboarding.personality.migaBubble_girl' : 'onboarding.personality.migaBubble')}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', marginTop: 8 }}>
                <AudioPlayer
                  text={t(gender === 'girl' ? 'onboarding.personality.migaBubble_girl' : 'onboarding.personality.migaBubble')}
                  characterId={mascotId || 'miga'}
                  size="sm"
                />
                <Text style={{ fontSize: 11, color: '#888780', fontWeight: '600', marginLeft: 6 }}>{t('onboarding.personality.hearButton')}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Questions */}
        {QUESTIONS.map((q) => (
          <View key={q.id} style={{ marginBottom: 28 }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: '#2C2C2A', marginBottom: 12 }}>
              {t(`onboarding.personality.${q.questionKey}`)}
            </Text>
            <View style={{ gap: 8 }}>
              {q.options.map((opt) => {
                const selected = selections[q.id] === opt.id;
                const labelKey = gender === 'girl' && language === 'fr'
                  ? `onboarding.personality.${opt.labelKey}_girl`
                  : `onboarding.personality.${opt.labelKey}`;
                return (
                  <TouchableOpacity
                    key={opt.id}
                    onPress={() => selectTrait(q.id, opt.id)}
                    activeOpacity={0.75}
                    style={{
                      borderRadius: 14,
                      borderWidth: 2,
                      borderColor: selected ? '#7F77DD' : '#E8E6FF',
                      backgroundColor: selected ? '#EEEDFE' : '#fff',
                      paddingHorizontal: 16,
                      paddingVertical: 12,
                    }}
                  >
                    <Text style={{
                      fontSize: 15,
                      fontWeight: '600',
                      color: selected ? '#534AB7' : '#2C2C2A',
                    }}>
                      {t(labelKey)}
                    </Text>
                    {opt.descKey && (
                      <Text style={{ fontSize: 12, color: selected ? '#7F77DD' : '#888780', marginTop: 2 }}>
                        {t(`onboarding.personality.${opt.descKey}`)}
                      </Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        ))}

        {/* Free text */}
        <View style={{
          backgroundColor: '#fff', borderRadius: 14,
          borderWidth: 1.5, borderColor: '#E8E6FF',
          padding: 14, marginTop: 4, marginBottom: voiceRecorded ? 8 : 28,
        }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: '#2C2C2A', marginBottom: 2 }}>
            {t('onboarding.personality.freeTextLabel', { mascot: mascotName })}
          </Text>
          <Text style={{ fontSize: 11, color: '#888780', marginBottom: 10 }}>
            {t('onboarding.personality.freeTextSub')}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
            <TextInput
              multiline
              value={personalityFreeText}
              onChangeText={handleFreeText}
              placeholder={t('onboarding.personality.freeTextPlaceholder', { mascot: mascotName })}
              placeholderTextColor="#BDBDBD"
              onFocus={() => { setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100); }}
              style={{
                flex: 1, fontSize: 14, color: '#2C2C2A',
                minHeight: 80, textAlignVertical: 'top',
              }}
            />
            {Platform.OS !== 'web' && (
              <Animated.View style={[pulseStyle, { marginLeft: 10, flexShrink: 0 }]}>
                <TouchableOpacity
                  onPress={() => void handleMicPress()}
                  style={{
                    width: 38, height: 38, borderRadius: 19,
                    backgroundColor: isRecording ? '#D85A30' : '#EF9F27',
                    alignItems: 'center', justifyContent: 'center',
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={{ fontSize: 18 }}>{isRecording ? '⏹️' : '🎤'}</Text>
                </TouchableOpacity>
              </Animated.View>
            )}
          </View>
          <Text style={{ fontSize: 11, color: '#B4B2A9', textAlign: 'right', marginTop: 6 }}>
            {personalityFreeText.length}/{MAX_FREE_TEXT}
          </Text>
        </View>

        {voiceRecorded && (
          <Text style={{ fontSize: 12, color: '#5DCAA5', fontWeight: '600', marginBottom: 20 }}>
            {t('onboarding.personality.voiceRecorded')}
          </Text>
        )}

        {/* Continue */}
        <TouchableOpacity
          onPress={handleContinue}
          style={{
            backgroundColor: '#7F77DD',
            borderRadius: 9999, paddingVertical: 16,
            alignItems: 'center', marginBottom: 12,
          }}
          activeOpacity={0.85}
        >
          <Text style={{ color: '#fff', fontSize: 17, fontWeight: 'bold' }}>
            {t('onboarding.personality.continueButton')}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => router.back()}
          style={{ paddingVertical: 12, alignItems: 'center' }}
        >
          <Text style={{ color: '#BDBDBD', fontSize: 14 }}>← {t('common.back')}</Text>
        </TouchableOpacity>
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
