import { useState, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, SafeAreaView, ScrollView, Image } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle,
  withRepeat, withSequence, withTiming, Easing,
} from 'react-native-reanimated';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTranslation } from 'react-i18next';
import { useOnboardingStore } from '@/store/onboardingStore';
import { useLanguageStore } from '@/store/languageStore';
import { mascotAvatars as mascotAvatarApi } from '@/services/api';
import AudioPlayer from '@/components/AudioPlayer';

// ─── Intro text ───────────────────────────────────────────────────────────────

const EN_INTRO_TEXT_1 =
  "Hi! Before you meet your friends on Migo, you need a special guide — someone who will always be there for you, celebrate your wins, and keep you safe. That guide is called your mascot! 🌟 In a moment you'll meet Miga, Pixel, Finn and Sage — they're all amazing, so take your time choosing!";

const EN_INTRO_TEXT_2 =
  "I'm Miga! I'm a friendly dragon and I will ALWAYS have your back on Migo. I celebrate every win, help when things go wrong, and I will never ever go away — you're stuck with me! 💜 But peek below — you might also love Pixel, Finn or Sage!";

const FR_INTRO_TEXT_1 =
  "Salut ! Avant de rencontrer tes amis sur Migo, tu as besoin d'un guide spécial — quelqu'un qui sera toujours là pour toi, qui célèbrera tes victoires et qui te gardera en sécurité. Ce guide s'appelle ton mascotte ! 🌟 Dans un instant tu vas rencontrer Miga, Pixel, Finn et Sage — ils sont tous géniaux, prends ton temps pour choisir !";

const FR_INTRO_TEXT_2 =
  "Je suis Miga ! Je suis un petit dragon magique et je serai TOUJOURS là pour toi. Je célèbre chaque victoire, j'aide quand ça va pas, et je ne partirai jamais — tu es coincé(e) avec moi ! 💜 Mais regarde en bas — tu pourrais aussi aimer Pixel, Finn ou Sage !";

type MascotId = 'pixel' | 'finn' | 'miga' | 'sage';

// ─── Static mascot data ───────────────────────────────────────────────────────

const MASCOT_DATA = [
  { id: 'pixel' as const, name: 'Pixel', emoji: '🤖',
    bubble:   "Hi!! I'm Pixel! I love games and gadgets and I always know how to fix things. Pick me! 🤖⚡",
    bubbleFr: "Salut !! Je suis Pixel ! J'adore les jeux et les gadgets et je sais toujours comment réparer les choses. Choisis-moi ! 🤖⚡" },
  { id: 'finn'  as const, name: 'Finn',  emoji: '🦊',
    bubble:   "Heeey!! I'm Finn the fox! I know a million jokes and always have big ideas! 🦊😄",
    bubbleFr: "Hééé !! Je suis Finn le renard ! Je connais un million de blagues et j'ai toujours de grandes idées ! 🦊😄" },
  { id: 'miga'  as const, name: 'Miga',  emoji: '🧚',
    bubble:   "Hiii!! I'm Miga!! I'm a friendly dragon and I will always have your back! 🐉✨",
    bubbleFr: "Coucou !! Je suis Miga !! Je suis un petit dragon magique et je serai toujours là pour toi ! 🐉✨" },
  { id: 'sage'  as const, name: 'Sage',  emoji: '🦉',
    bubble:   "Hoooo there! I'm Sage. A wise owl who knows something about almost everything! 🦉📚",
    bubbleFr: "Houuu ! Je suis Sage. Un hibou sage qui sait quelque chose sur presque tout ! 🦉📚" },
];

// ─── Component ────────────────────────────────────────────────────────────────
export default function MascotScreen() {
  const { t } = useTranslation();
  const { language } = useLanguageStore();
  const { mascotId, setMascotId, preReader } = useOnboardingStore();

  const isFr = language === 'fr';

  const introText1 = isFr ? FR_INTRO_TEXT_1 : EN_INTRO_TEXT_1;
  const introText2 = isFr ? FR_INTRO_TEXT_2 : EN_INTRO_TEXT_2;

  const [selected, setSelected]           = useState<MascotId>((mascotId as MascotId) || 'miga');
  const [mascotAvatarUrls, setMascotAvatarUrls] = useState<Record<string, string>>({});
  const [introStarted, setIntroStarted]   = useState(false);
  const [introBubble, setIntroBubble]     = useState('');
  const [typingDone, setTypingDone]       = useState(false);
  const [showNext, setShowNext]           = useState(false);
  const [introComplete, setIntroComplete] = useState(false);
  const [phase2Started, setPhase2Started] = useState(false);

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
    mascotAvatarApi.get().then(res => setMascotAvatarUrls(res.data.mascots)).catch(() => {});
  }, []);

  useEffect(() => {
    floatY.value = withRepeat(
      withSequence(
        withTiming(-10, { duration: 1400, easing: Easing.inOut(Easing.sin) }),
        withTiming(0,   { duration: 1400, easing: Easing.inOut(Easing.sin) }),
      ),
      -1, false,
    );

    if (!preReader) beginIntro();

    return () => {
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

  function beginIntro() {
    setIntroStarted(true);
    startTypewriter(introText1);
    nextTimerRef.current = setTimeout(() => setShowNext(true), 4000);
  }

  function handleNext() {
    if (advancedRef.current) return;
    advancedRef.current = true;

    setShowNext(false);
    setPhase2Started(true);

    startTypewriter(introText2);

    gridTimerRef.current = setTimeout(() => setIntroComplete(true), 5000);
  }

  function skipIntro() {
    if (typingRef.current)    clearInterval(typingRef.current);
    if (nextTimerRef.current) clearTimeout(nextTimerRef.current);
    if (gridTimerRef.current) clearTimeout(gridTimerRef.current);
    advancedRef.current = true;
    setIntroComplete(true);
  }

  function handleSelect(id: MascotId) {
    setSelected(id);
  }

  async function handleConfirm() {
    setMascotId(selected);
    router.push('/onboarding/role');
  }

  const activeMascot = MASCOT_DATA.find((m) => m.id === selected)!;
  const activeBubble = isFr ? activeMascot.bubbleFr : activeMascot.bubble;

  const bubbleText  = introComplete ? activeBubble : introBubble;
  const heroEmoji   = introComplete ? activeMascot.emoji : '🐉';
  const heroSize    = introComplete ? 72 : 90;

  // AudioPlayer text and characterId for current intro phase
  const introAudioText = phase2Started ? introText2 : introText1;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F8F7FF' }}>
      <StatusBar style="dark" />

      {/* ── Top bar: progress + skip ── */}
      <View style={{ paddingHorizontal: 24, paddingTop: 20 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <View style={{ flex: 1, height: 6, backgroundColor: '#E0E0E0', borderRadius: 3, marginRight: 12 }}>
            <View style={{ width: '50%', height: '100%', backgroundColor: '#7F77DD', borderRadius: 3 }} />
          </View>
          {!introComplete && (
            <TouchableOpacity onPress={skipIntro} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={{ fontSize: 12, color: '#BDBDBD' }}>{t('onboarding.mascot.skipIntro')}</Text>
            </TouchableOpacity>
          )}
        </View>
        <Text style={{ fontSize: 13, color: '#888780' }}>
          {t('onboarding.stepOf', { current: 4, total: 8 })} · {t('onboarding.step4sub')} 🧒
        </Text>
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
            {mascotAvatarUrls[introComplete ? selected : 'miga']
			  ? <Animated.Image
				  source={{ uri: mascotAvatarUrls[introComplete ? selected : 'miga'] }}
				  style={[{ width: heroSize, height: heroSize, borderRadius: heroSize / 2 }, floatStyle]}
				/>
			  : <Animated.Text style={[{ fontSize: heroSize, lineHeight: heroSize * 1.2 }, floatStyle]}>
				  {heroEmoji}
				</Animated.Text>
			}
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

          {/* AudioPlayer for intro text (ElevenLabs TTS, correct per-language voice) */}
          {!introComplete && introStarted && (
            <View style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'center', marginTop: 10 }}>
              <AudioPlayer
                text={introAudioText}
                characterId="miga"
                size="sm"
              />
              <Text style={{ fontSize: 12, color: '#888780', fontWeight: '600', marginLeft: 6 }}>
                {t('onboarding.mascot.hearbutton')}
              </Text>
            </View>
          )}
        </View>

        {/* ── Second hint bubble (show as soon as intro starts, phase1 only) ── */}
        {!introComplete && introStarted && !phase2Started && (
          <View style={{
            backgroundColor: '#EEEDFE',
            borderRadius: 16,
            borderTopLeftRadius: 4,
            paddingHorizontal: 16,
            paddingVertical: 10,
            maxWidth: 300,
            alignSelf: 'center',
            marginTop: 8,
            marginBottom: 8,
          }}>
            <Text style={{ fontSize: 13, color: '#534AB7', textAlign: 'center', lineHeight: 19 }}>
              {t('onboarding.mascot.mascotChooseHint')}
            </Text>
          </View>
        )}

        {/* ── Intro-phase buttons ── */}
        {!introComplete && (
          <View style={{ alignItems: 'center', marginBottom: 8 }}>
            {preReader && !introStarted ? (
              <TouchableOpacity
                onPress={() => beginIntro()}
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
                <Text style={{ color: '#fff', fontSize: 16, fontWeight: 'bold' }}>{t('onboarding.mascot.nextButton')}</Text>
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
              {MASCOT_DATA.map((mascot) => {
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
                    {mascotAvatarUrls[mascot.id]
                      ? <Image source={{ uri: mascotAvatarUrls[mascot.id] }} style={{ width: 52, height: 52, borderRadius: 26, marginRight: 14 }} />
                      : <Text style={{ fontSize: 36, marginRight: 14 }}>{mascot.emoji}</Text>
                    }

                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 16, fontWeight: '700', color: isSel ? '#7F77DD' : '#2C2C2A', marginBottom: 6 }}>
                        {mascot.name}
                      </Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', marginTop: 4 }}>
                        <AudioPlayer
                          text={isFr ? mascot.bubbleFr : mascot.bubble}
                          characterId={mascot.id}
                          size="sm"
                        />
                        <Text style={{ fontSize: 12, color: isSel ? '#7F77DD' : '#888780', fontWeight: '600', marginLeft: 6 }}>
                          {t('onboarding.mascot.hearbutton')}
                        </Text>
                      </View>
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
                {t('onboarding.mascot.continuebutton')}
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
