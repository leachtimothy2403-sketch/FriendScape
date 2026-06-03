import { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, SafeAreaView,
  ScrollView, TextInput,
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
import { useLanguageStore } from '@/store/languageStore';

const MIGA_HEAR_AUDIO = {
  en: require('../../assets/audio/miga_hear.mp3'),
  fr: require('../../assets/audio/miga_hear_fr.mp3'),
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
    personalityTraits, setPersonalityTraits,
    personalityFreeText, setPersonalityFreeText,
  } = useOnboardingStore();

  const displayName = childName.trim() || 'you';

  // selections: one chosen traitId per question group
  const [selections, setSelections] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const q of QUESTIONS) {
      const match = personalityTraits.find((t) => q.options.some((o) => o.id === t));
      if (match) init[q.id] = match;
    }
    return init;
  });

  const soundRef = useRef<Audio.Sound | null>(null);
  const floatY   = useSharedValue(0);

  useEffect(() => {
    Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
    floatY.value = withRepeat(
      withSequence(
        withTiming(-8, { duration: 1200, easing: Easing.inOut(Easing.sin) }),
        withTiming(0,  { duration: 1200, easing: Easing.inOut(Easing.sin) }),
      ),
      -1, false,
    );
    return () => { void soundRef.current?.unloadAsync(); };
  }, []);

  const floatStyle = useAnimatedStyle(() => ({ transform: [{ translateY: floatY.value }] }));

  async function playMigaHear() {
    try {
      await soundRef.current?.unloadAsync();
      const src = language === 'fr' ? MIGA_HEAR_AUDIO.fr : MIGA_HEAR_AUDIO.en;
      const { sound } = await Audio.Sound.createAsync(src);
      soundRef.current = sound;
      await sound.playAsync();
    } catch { /* audio not yet available */ }
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
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 20, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Progress */}
        <View style={{ height: 6, backgroundColor: '#E0E0E0', borderRadius: 3, marginBottom: 8 }}>
          <View style={{ width: '70%', height: '100%', backgroundColor: '#7F77DD', borderRadius: 3 }} />
        </View>
        <Text style={{ fontSize: 13, color: '#888780', marginBottom: 16 }}>
          Step 7 of 10 · Just for you!
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

        {/* Miga bubble */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 28 }}>
          <TouchableOpacity onPress={() => void playMigaHear()} activeOpacity={0.8}>
            <Animated.Text style={[{ fontSize: 36, marginRight: 10, marginTop: 4 }, floatStyle]}>
              🧚
            </Animated.Text>
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <View style={{
              backgroundColor: '#fff', borderRadius: 16, borderTopLeftRadius: 4,
              borderWidth: 1.5, borderColor: '#E0E0E0', padding: 12,
            }}>
              <Text style={{ fontSize: 13, color: '#2C2C2A', lineHeight: 20 }}>
                {t('onboarding.personality.migaBubble')}
              </Text>
              <TouchableOpacity
                onPress={() => void playMigaHear()}
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

        {/* Questions */}
        {QUESTIONS.map((q) => (
          <View key={q.id} style={{ marginBottom: 28 }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: '#2C2C2A', marginBottom: 12 }}>
              {t(`onboarding.personality.${q.questionKey}`)}
            </Text>
            <View style={{ gap: 8 }}>
              {q.options.map((opt) => {
                const selected = selections[q.id] === opt.id;
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
                      {t(`onboarding.personality.${opt.labelKey}`)}
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
          padding: 14, marginTop: 4, marginBottom: 28,
        }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: '#2C2C2A', marginBottom: 2 }}>
            {t('onboarding.personality.freeTextLabel')}
          </Text>
          <Text style={{ fontSize: 11, color: '#888780', marginBottom: 10 }}>
            {t('onboarding.personality.freeTextSub')}
          </Text>
          <TextInput
            multiline
            value={personalityFreeText}
            onChangeText={handleFreeText}
            placeholder={t('onboarding.personality.freeTextPlaceholder')}
            placeholderTextColor="#BDBDBD"
            style={{
              fontSize: 14, color: '#2C2C2A',
              minHeight: 80, textAlignVertical: 'top',
            }}
          />
          <Text style={{ fontSize: 11, color: '#B4B2A9', textAlign: 'right', marginTop: 6 }}>
            {personalityFreeText.length}/{MAX_FREE_TEXT}
          </Text>
        </View>

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
          <Text style={{ color: '#BDBDBD', fontSize: 14 }}>← Back</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
