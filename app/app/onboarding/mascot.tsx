import { useState, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, SafeAreaView, ScrollView } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle,
  withRepeat, withSequence, withTiming, Easing,
} from 'react-native-reanimated';
import { Audio, AVPlaybackStatus } from 'expo-av';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTranslation } from 'react-i18next';
import { useOnboardingStore } from '@/store/onboardingStore';
import { useLanguageStore } from '@/store/languageStore';

// ─── Intro script ─────────────────────────────────────────────────────────────
const INTRO_TEXT_1 =
  "Hi! Before you meet your friends on Migo, you need a special guide — someone who will always be there for you, celebrate your wins, and keep you safe. That guide is called your mascot! 🌟";

const INTRO_TEXT_1_FR =
  "Salut ! Avant de rencontrer tes amis sur Migo, tu as besoin d'un guide spécial — quelqu'un qui sera toujours là pour toi, qui célèbrera tes victoires et qui te gardera en sécurité. Ce guide s'appelle ton mascotte ! 🌟";

const INTRO_TEXT_2 =
  "I'm Miga! I'm a sparkly fairy and I will ALWAYS have your back on Migo. I'd love to be your mascot! But you can also meet Pixel, Finn, and Sage below — tap them to hear their voices and learn about them. Then pick the one you love most! 💜";

const INTRO_TEXT_2_FR =
  "Je suis Miga ! Je suis une fée scintillante et je serai TOUJOURS là pour toi sur Migo. J'adorerais être ta mascotte ! Tu peux aussi rencontrer Pixel, Finn et Sage ci-dessous — appuie sur eux pour entendre leurs voix. Puis choisis celui que tu préfères ! 💜";

// ─── Audio assets — all use English files; swap in FR recordings when available ─
const AUDIO = {
  lumi_intro:    require('../../assets/audio/lumi_intro.mp3'),
  lumi_selected: require('../../assets/audio/lumi_selected.mp3'),
  lumi_hear:     require('../../assets/audio/lumi_hear.mp3'),
  finn_intro:    require('../../assets/audio/finn_intro.mp3'),
  pixel_intro:   require('../../assets/audio/pixel_intro.mp3'),
  sage_intro:    require('../../assets/audio/sage_intro.mp3'),
};

type AudioSource = (typeof AUDIO)[keyof typeof AUDIO];

// ─── Mascots ──────────────────────────────────────────────────────────────────
const MASCOTS = [
  { id: 'pixel', name: 'Pixel', emoji: '🤖',
    bubble:   "Hi!! I'm Pixel! I love games and gadgets and I always know how to fix things. Pick me! 🤖⚡",
    bubbleFr: "Salut !! Je suis Pixel ! J'adore les jeux et les gadgets et je sais toujours comment réparer les choses. Choisis-moi ! 🤖⚡",
    intro:    AUDIO.pixel_intro, hear: AUDIO.pixel_intro, selected: null },
  { id: 'finn',  name: 'Finn',  emoji: '🦊',
    bubble:   "Heeey!! I'm Finn the fox! I know a million jokes and always have big ideas! 🦊😄",
    bubbleFr: "Hééé !! Je suis Finn le renard ! Je connais un million de blagues et j'ai toujours de grandes idées ! 🦊😄",
    intro:    AUDIO.finn_intro,  hear: AUDIO.finn_intro,  selected: null },
  { id: 'miga',  name: 'Miga',  emoji: '🧚',
    bubble:   "Hiii!! I'm Miga!! I'm a sparkly little fairy and I will always have your back! 🧚✨",
    bubbleFr: "Coucou !! Je suis Miga !! Je suis une petite fée scintillante et je serai toujours là pour toi ! 🧚✨",
    intro:    AUDIO.lumi_intro,  hear: AUDIO.lumi_hear,   selected: AUDIO.lumi_selected },
  { id: 'sage',  name: 'Sage',  emoji: '🦉',
    bubble:   "Hoooo there! I'm Sage. A wise owl who knows something about almost everything! 🦉📚",
    bubbleFr: "Houuu ! Je suis Sage. Un hibou sage qui sait quelque chose sur presque tout ! 🦉📚",
    intro:    AUDIO.sage_intro,  hear: AUDIO.sage_intro,  selected: null },
] as const;

type MascotId = (typeof MASCOTS)[number]['id'];

// ─── Component ────────────────────────────────────────────────────────────────
export default function MascotScreen() {
  const { t } = useTranslation();
  const { language } = useLanguageStore();
  const { mascotId, setMascotId, preReader } = useOnboardingStore();

  const isFr = language === 'fr';
  const INTRO_TEXT_1_ACTIVE = isFr ? INTRO_TEXT_1_FR : INTRO_TEXT_1;
  const INTRO_TEXT_2_ACTIVE = isFr ? INTRO_TEXT_2_FR : INTRO_TEXT_2;

  const [selected, setSelected]           = useState<MascotId>((mascotId as MascotId) || 'miga');
  const [introStarted, setIntroStarted]   = useState(false);
  const [introBubble, setIntroBubble]     = useState('');
  const [typingDone, setTypingDone]       = useState(false);
  const [showNext, setShowNext]           = useState(false);
  const [introComplete, setIntroComplete] = useState(false);

  const soundRef     = useRef<Audio.Sound | null>(null);
  const typingRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const advancedRef  = useRef(false);
  const nextTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gridTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const floatY  = useSharedValue(0);
  const cardsY  = useSharedValue(60);
  const cardsOp = useSharedValue(0);

  const floatStyle = useAnimatedStyle(() => ({ transform: [{ translateY: floatY.value }] }));
  const cardsStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: cardsY.value }],
    opacity: cardsOp.value,
  }));

  useEffect(() => {
    Audio.setAudioModeAsync({ playsInSilentModeIOS: true });

    floatY.value = withRepeat(
      withSequence(
        withTiming(-10, { duration: 1400, easing: Easing.inOut(Easing.sin) }),
        withTiming(0,   { duration: 1400, easing: Easing.inOut(Easing.sin) }),
      ),
      -1, false,
    );

    if (!preReader) beginIntro(false);

    return () => {
      soundRef.current?.unloadAsync();
      if (typingRef.current)    clearInterval(typingRef.current);
      if (nextTimerRef.current) clearTimeout(nextTimerRef.current);
      if (gridTimerRef.current) clearTimeout(gridTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (typingDone && !introComplete) setShowNext(true);
  }, [typingDone]);

  useEffect(() => {
    if (introComplete) {
      cardsY.value  = withTiming(0, { duration: 500, easing: Easing.out(Easing.cubic) });
      cardsOp.value = withTiming(1, { duration: 400 });
    }
  }, [introComplete]);

  function startTypewriter(text: string) {
    if (typingRef.current) clearInterval(typingRef.current);
    setTypingDone(false);
    setIntroBubble('');
    let i = 0;
    typingRef.current = setInterval(() => {
      i++;
      setIntroBubble(text.slice(0, i));
      if (i >= text.length) {
        clearInterval(typingRef.current!);
        typingRef.current = null;
        setTypingDone(true);
      }
    }, 30);
  }

  async function playAudio(source: AudioSource, onFinish?: () => void) {
    try {
      await soundRef.current?.unloadAsync();
      soundRef.current = null;
      const { sound } = await Audio.Sound.createAsync(source);
      soundRef.current = sound;
      if (onFinish) {
        sound.setOnPlaybackStatusUpdate((status: AVPlaybackStatus) => {
          if (status.isLoaded && status.didJustFinish) onFinish();
        });
      }
      await sound.playAsync();
    } catch {
      if (onFinish) setTimeout(onFinish, 3000);
    }
  }

  function beginIntro(autoAdvance: boolean) {
    setIntroStarted(true);
    startTypewriter(INTRO_TEXT_1_ACTIVE);
    nextTimerRef.current = setTimeout(() => setShowNext(true), 4000);

    if (autoAdvance) {
      setTimeout(() => playAudio(AUDIO.lumi_intro, () => handleNext()), 500);
    } else {
      setTimeout(() => playAudio(AUDIO.lumi_intro), 500);
    }
  }

  function handleNext() {
    if (advancedRef.current) return;
    advancedRef.current = true;

    setShowNext(false);
    startTypewriter(INTRO_TEXT_2_ACTIVE);
    playAudio(AUDIO.lumi_selected);

    gridTimerRef.current = setTimeout(() => setIntroComplete(true), 1000);
  }

  function skipIntro() {
    if (typingRef.current)    clearInterval(typingRef.current);
    if (nextTimerRef.current) clearTimeout(nextTimerRef.current);
    if (gridTimerRef.current) clearTimeout(gridTimerRef.current);
    advancedRef.current = true;
    soundRef.current?.stopAsync();
    setIntroComplete(true);
  }

  function handleSelect(id: MascotId) {
    setSelected(id);
    const m = MASCOTS.find((m) => m.id === id)!;
    playAudio(m.intro);
  }

  async function handleConfirm() {
    setMascotId(selected);
    const m = MASCOTS.find((m) => m.id === selected)!;
    if (m.selected) await playAudio(m.selected);
    router.push('/onboarding/role');
  }

  const activeMascot = MASCOTS.find((m) => m.id === selected)!;
  const activeBubble = isFr ? activeMascot.bubbleFr : activeMascot.bubble;

  const bubbleText = introComplete ? activeBubble : introBubble;
  const heroEmoji  = introComplete ? activeMascot.emoji : '🧚';
  const heroSize   = introComplete ? 72 : 90;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F8F7FF' }}>
      <StatusBar style="dark" />

      {/* ── Top bar: progress + skip ── */}
      <View style={{ paddingHorizontal: 24, paddingTop: 20 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <View style={{ flex: 1, height: 6, backgroundColor: '#E0E0E0', borderRadius: 3, marginRight: 12 }}>
            <View style={{ width: '44%', height: '100%', backgroundColor: '#7F77DD', borderRadius: 3 }} />
          </View>
          {!introComplete && (
            <TouchableOpacity onPress={skipIntro} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={{ fontSize: 12, color: '#BDBDBD' }}>{t('onboarding.mascot.skipIntro')}</Text>
            </TouchableOpacity>
          )}
        </View>
        <Text style={{ fontSize: 13, color: '#888780' }}>Step 4 of 9 · Child 🧒</Text>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 24, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >

        {/* ── Hero ── */}
        <View style={{ alignItems: 'center', marginBottom: 28 }}>
          <View style={{ alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
            {!introComplete && (
              <>
                <View style={{
                  position: 'absolute',
                  width: 160, height: 160, borderRadius: 80,
                  backgroundColor: 'rgba(127,119,221,0.07)',
                }} />
                <View style={{
                  position: 'absolute',
                  width: 120, height: 120, borderRadius: 60,
                  backgroundColor: 'rgba(127,119,221,0.14)',
                }} />
              </>
            )}
            <Animated.Text style={[{ fontSize: heroSize, lineHeight: heroSize * 1.2 }, floatStyle]}>
              {heroEmoji}
            </Animated.Text>
          </View>

          {/* Speech bubble */}
          <View style={{
            backgroundColor: '#fff',
            borderRadius: 20,
            borderWidth: 2,
            borderColor: '#7F77DD',
            paddingHorizontal: 20,
            paddingVertical: 14,
            maxWidth: 300,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.07,
            shadowRadius: 8,
            elevation: 3,
          }}>
            <View style={{
              position: 'absolute', top: -10, alignSelf: 'center',
              width: 0, height: 0,
              borderLeftWidth: 10, borderRightWidth: 10, borderBottomWidth: 10,
              borderLeftColor: 'transparent', borderRightColor: 'transparent',
              borderBottomColor: '#7F77DD',
            }} />
            <Text style={{ fontSize: 14, color: '#2C2C2A', textAlign: 'center', lineHeight: 21 }}>
              {bubbleText}
              {!introComplete && !typingDone && introBubble.length > 0
                ? <Text style={{ color: '#7F77DD', fontWeight: 'bold' }}>▎</Text>
                : null}
            </Text>
          </View>
        </View>

        {/* ── Intro-phase buttons ── */}
        {!introComplete && (
          <View style={{ alignItems: 'center', marginBottom: 8 }}>
            {preReader && !introStarted ? (
              <TouchableOpacity
                onPress={() => beginIntro(true)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: '#EF9F27',
                  borderRadius: 9999,
                  paddingVertical: 18,
                  paddingHorizontal: 32,
                  shadowColor: '#EF9F27',
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.4,
                  shadowRadius: 12,
                  elevation: 6,
                }}
                activeOpacity={0.85}
              >
                <Text style={{ fontSize: 22, marginRight: 10 }}>🔊</Text>
                <Text style={{ color: '#fff', fontSize: 18, fontWeight: 'bold' }}>{t('onboarding.mascot.tapToHear')}</Text>
              </TouchableOpacity>
            ) : showNext ? (
              <TouchableOpacity
                onPress={handleNext}
                style={{
                  backgroundColor: '#7F77DD',
                  borderRadius: 9999,
                  paddingVertical: 14,
                  paddingHorizontal: 40,
                }}
                activeOpacity={0.85}
              >
                <Text style={{ color: '#fff', fontSize: 16, fontWeight: 'bold' }}>Next →</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        )}

        {/* ── Mascot cards ── */}
        {introComplete && (
          <>
            <Text style={{ fontSize: 22, fontWeight: 'bold', color: '#2C2C2A', marginBottom: 20 }}>
              {t('onboarding.mascot.title')}
            </Text>

            <Animated.View style={[cardsStyle, { gap: 12, marginBottom: 36 }]}>
              {MASCOTS.map((mascot) => {
                const isSel = selected === mascot.id;
                return (
                  <TouchableOpacity
                    key={mascot.id}
                    onPress={() => handleSelect(mascot.id)}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      padding: 16,
                      borderRadius: 18,
                      borderWidth: 2,
                      borderColor: isSel ? '#7F77DD' : '#E0E0E0',
                      backgroundColor: isSel ? '#EEEDFE' : '#fff',
                      shadowColor: '#000',
                      shadowOffset: { width: 0, height: 1 },
                      shadowOpacity: 0.05,
                      shadowRadius: 4,
                      elevation: 2,
                    }}
                    activeOpacity={0.75}
                  >
                    <Text style={{ fontSize: 36, marginRight: 14 }}>{mascot.emoji}</Text>

                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 16, fontWeight: '700', color: isSel ? '#7F77DD' : '#2C2C2A', marginBottom: 6 }}>
                        {mascot.name}
                      </Text>
                      <TouchableOpacity
                        onPress={() => playAudio(mascot.hear)}
                        style={{
                          flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start',
                          backgroundColor: isSel ? '#D8D5FF' : '#F0F0F0',
                          paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20,
                        }}
                      >
                        <Text style={{ fontSize: 13, marginRight: 4 }}>🔊</Text>
                        <Text style={{ fontSize: 12, color: isSel ? '#7F77DD' : '#888780', fontWeight: '600' }}>
                          {t('onboarding.mascot.hearButton', { name: mascot.name })}
                        </Text>
                      </TouchableOpacity>
                    </View>

                    <View style={{
                      width: 22, height: 22, borderRadius: 11,
                      borderWidth: 2,
                      borderColor: isSel ? '#7F77DD' : '#BDBDBD',
                      backgroundColor: isSel ? '#7F77DD' : '#fff',
                      alignItems: 'center', justifyContent: 'center',
                      marginLeft: 8, flexShrink: 0,
                    }}>
                      {isSel && <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>✓</Text>}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </Animated.View>

            <TouchableOpacity
              onPress={() => void handleConfirm()}
              style={{ backgroundColor: '#7F77DD', borderRadius: 9999, paddingVertical: 16, alignItems: 'center', marginBottom: 12 }}
              activeOpacity={0.85}
            >
              <Text style={{ color: '#fff', fontSize: 17, fontWeight: 'bold' }}>
                {t('onboarding.mascot.continueButton', { name: activeMascot.name })}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => router.back()} style={{ paddingVertical: 12, alignItems: 'center' }}>
              <Text style={{ color: '#BDBDBD', fontSize: 14 }}>← {t('common.back')}</Text>
            </TouchableOpacity>
          </>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}
