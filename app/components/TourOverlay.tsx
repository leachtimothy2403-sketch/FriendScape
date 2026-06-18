import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import AudioPlayer from '@/components/AudioPlayer';
import { TourStep } from '@/constants/tourSteps';

interface Props {
  steps: TourStep[];
  currentStep: number;
  onNext: () => void;
  onSkip: () => void;
  mascotEmoji: string;
  mascotId: string;
  language: 'en' | 'fr';
}

export default function TourOverlay({ steps, currentStep, onNext, onSkip, mascotEmoji, mascotId, language }: Props) {
  const [childToken, setChildToken] = useState<string | null>(null);
  useEffect(() => {
    AsyncStorage.getItem('childToken').then(t => { if (t) setChildToken(t); });
  }, []);

  void childToken; // warm AsyncStorage before AudioPlayer fires

  const step = steps[currentStep];
  if (!step) return null;
  const text = language === 'fr' ? step.textFr : step.text;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* Full screen tap catcher — behind bubble */}
      <TouchableOpacity
        style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 1 }]}
        activeOpacity={1}
        onPress={onNext}
      />

      {/* Speech bubble — above tap catcher, receives its own taps */}
      <View style={[s.bubble, { zIndex: 10 }]}>
        <View style={s.bubbleRow}>
          <Text style={{ fontSize: 36 }}>{mascotEmoji}</Text>
          <Text style={s.bubbleText}>{text}</Text>
        </View>
        <View style={s.bubbleActions}>
          {mascotId.length > 0 && <AudioPlayer text={text} characterId={mascotId} size="sm" />}
          <TouchableOpacity onPress={onNext} style={s.nextBtn}>
            <Text style={s.nextBtnText}>
              {language === 'fr' ? 'Suivant →' : 'Next →'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Step dots — above tap catcher */}
      <View style={[s.dots, { zIndex: 10 }]}>
        {steps.map((_, i) => (
          <View key={i} style={[s.dot, i === currentStep ? s.dotFilled : s.dotOutline]} />
        ))}
      </View>

      {/* Skip — above tap catcher */}
      <TouchableOpacity onPress={onSkip} style={[s.skipBtn, { zIndex: 10 }]}>
        <Text style={s.skipText}>{language === 'fr' ? 'Passer' : 'Skip'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  bubble:        { position: 'absolute', bottom: 100, left: 16, right: 16,
                   backgroundColor: '#fff', borderRadius: 20, padding: 20,
                   shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 16, elevation: 10 },
  bubbleRow:     { flexDirection: 'row', gap: 12, marginBottom: 16, alignItems: 'flex-start' },
  bubbleText:    { flex: 1, fontSize: 16, color: '#2C2C2A', lineHeight: 23 },
  bubbleActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  nextBtn:       { backgroundColor: '#7F77DD', borderRadius: 9999, paddingHorizontal: 20, paddingVertical: 10 },
  nextBtnText:   { color: '#fff', fontWeight: '700', fontSize: 15 },
  dots:          { position: 'absolute', bottom: 60, left: 0, right: 0,
                   flexDirection: 'row', justifyContent: 'center', gap: 8 },
  dot:           { width: 8, height: 8, borderRadius: 4 },
  dotFilled:     { backgroundColor: '#7F77DD' },
  dotOutline:    { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: '#7F77DD' },
  skipBtn:       { position: 'absolute', top: 52, right: 20 },
  skipText:      { color: '#fff', fontSize: 14, fontWeight: '600' },
});
