import { Modal, View, Text, TouchableOpacity, Dimensions, StyleSheet } from 'react-native';
import AudioPlayer from '@/components/AudioPlayer';
import { TourStep } from '@/constants/tourSteps';

const { width: SW, height: SH } = Dimensions.get('window');

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
  const step = steps[currentStep];
  if (!step || step.spotlight.width === 0) return null;

  const { spotlight } = step;
  const text = language === 'fr' ? step.textFr : step.text;

  const bubbleMaxW = 280;
  const bubbleLeft = Math.max(16, Math.min(spotlight.x - 40, SW - 296));

  let bubbleStyle: { top?: number; bottom?: number };
  if (step.position === 'bottom') {
    const top = spotlight.y + spotlight.height + 12;
    bubbleStyle = top > SH - 200
      ? { bottom: SH - spotlight.y + 12 }
      : { top };
  } else {
    const bottom = SH - spotlight.y + 12;
    bubbleStyle = bottom > SH - 100
      ? { top: spotlight.y + spotlight.height + 12 }
      : { bottom };
  }

  return (
    <Modal visible transparent animationType="fade">
      <View style={StyleSheet.absoluteFill}>
        {/* 4 dark strips leaving a hole at spotlight */}
        <View style={[s.strip, { top: 0, left: 0, right: 0, height: spotlight.y }]} />
        <View style={[s.strip, { top: spotlight.y + spotlight.height, left: 0, right: 0, bottom: 0 }]} />
        <View style={[s.strip, { top: spotlight.y, left: 0, width: spotlight.x, height: spotlight.height }]} />
        <View style={[s.strip, { top: spotlight.y, left: spotlight.x + spotlight.width, right: 0, height: spotlight.height }]} />

        {/* Spotlight border highlight */}
        <View style={{
          position: 'absolute',
          top: spotlight.y,
          left: spotlight.x,
          width: spotlight.width,
          height: spotlight.height,
          borderRadius: spotlight.shape === 'circle' ? spotlight.width / 2 : 16,
          borderWidth: 3,
          borderColor: 'rgba(255,255,255,0.7)',
        }} />

        {/* Speech bubble */}
        <View style={[s.bubble, { ...bubbleStyle, left: bubbleLeft, width: bubbleMaxW }]}>
          <View style={s.bubbleRow}>
            <Text style={{ fontSize: 32 }}>{mascotEmoji}</Text>
            <Text style={s.bubbleText}>{text}</Text>
          </View>
          <View style={s.bubbleActions}>
            <AudioPlayer text={text} characterId={mascotId} size="sm" />
            <TouchableOpacity onPress={onNext} style={s.nextBtn}>
              <Text style={s.nextBtnText}>
                {language === 'fr' ? 'Suivant →' : 'Next →'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Step counter dots */}
        <View style={s.dots}>
          {steps.map((_, i) => (
            <View
              key={i}
              style={[s.dot, i === currentStep ? s.dotFilled : s.dotOutline]}
            />
          ))}
        </View>

        {/* Skip button */}
        <TouchableOpacity onPress={onSkip} style={s.skipBtn}>
          <Text style={s.skipText}>
            {language === 'fr' ? 'Passer' : 'Skip'}
          </Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  strip:        { position: 'absolute', backgroundColor: 'rgba(0,0,0,0.65)' },
  bubble:       { position: 'absolute', backgroundColor: '#fff', borderRadius: 16, padding: 16,
                  shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 12, elevation: 8 },
  bubbleRow:    { flexDirection: 'row', gap: 8, marginBottom: 12 },
  bubbleText:   { flex: 1, fontSize: 15, color: '#2C2C2A', lineHeight: 22 },
  bubbleActions:{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  nextBtn:      { backgroundColor: '#7F77DD', borderRadius: 9999, paddingHorizontal: 16, paddingVertical: 8 },
  nextBtnText:  { color: '#fff', fontWeight: '700', fontSize: 14 },
  dots:         { position: 'absolute', bottom: 90, left: 0, right: 0,
                  flexDirection: 'row', justifyContent: 'center', gap: 8 },
  dot:          { width: 8, height: 8, borderRadius: 4 },
  dotFilled:    { backgroundColor: '#7F77DD' },
  dotOutline:   { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: '#7F77DD' },
  skipBtn:      { position: 'absolute', top: 52, right: 20 },
  skipText:     { color: '#fff', fontSize: 14, fontWeight: '600' },
});
