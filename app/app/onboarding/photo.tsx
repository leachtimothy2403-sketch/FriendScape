import { useState } from 'react';
import { View, Text, TouchableOpacity, SafeAreaView, ScrollView, Image } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTranslation } from 'react-i18next';
import { useOnboardingStore } from '@/store/onboardingStore';
import { DEFAULT_AVATAR } from '@/types/avatar';
import { API_URL } from '@/services/api';

type Mode = 'photo' | 'skip';

const HUMAN_FACE_STYLES = [
  { id: 'classic',   emoji: '👦', labelKey: 'onboarding.photo.faceStyleClassic'    },
  { id: 'sporty',    emoji: '👧', labelKey: 'onboarding.photo.faceStyleSporty'     },
  { id: 'artistic',  emoji: '🧑', labelKey: 'onboarding.photo.faceStyleArtistic'   },
  { id: 'cool',      emoji: '👱', labelKey: 'onboarding.photo.faceStyleCool'       },
  { id: 'sweet',     emoji: '🧒', labelKey: 'onboarding.photo.faceStyleSweet'      },
  { id: 'cowboy',    emoji: '🤠', labelKey: 'onboarding.photo.faceStyleCowboy'     },
  { id: 'superhero', emoji: '🦸', labelKey: 'onboarding.photo.faceStyleSuperhero'  },
  { id: 'princess',  emoji: '👸', labelKey: 'onboarding.photo.faceStylePrincess'   },
];

const ANIMAL_OPTIONS = [
  { id: 'cat',    emoji: '🐱' },
  { id: 'dog',    emoji: '🐶' },
  { id: 'fox',    emoji: '🦊' },
  { id: 'rabbit', emoji: '🐰' },
  { id: 'bear',   emoji: '🐻' },
  { id: 'owl',    emoji: '🦉' },
  { id: 'lion',   emoji: '🦁' },
  { id: 'panda',  emoji: '🐼' },
];

export default function PhotoScreen() {
  const { t } = useTranslation();
  const { childName, avatarTheme, setAvatarTheme, avatarStyle, setAvatarStyle, humanFaceStyle, setHumanFaceStyle, setAvatarConfig, setAvatarBackground, setCartoonUrl } = useOnboardingStore();

  const [mode, setMode]         = useState<Mode>('photo');
  const [photoUri, setPhotoUri] = useState<string | null>(null);

  const displayName = childName.trim() || 'your child';
  const initial     = childName.trim() ? childName.trim()[0].toUpperCase() : '?';

  const OPTION_CARDS: { id: Mode; emoji: string; title: string; subtitle: string }[] = [
    { id: 'photo', emoji: '📸', title: t('onboarding.photo.generateTitle'), subtitle: t('onboarding.photo.uploadDesc') },
    { id: 'skip',  emoji: '🎨', title: t('onboarding.photo.chooseAvatarTitle'),       subtitle: t('onboarding.photo.skipDesc')   },
  ];

  async function pickPhoto() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    });
    if (result.canceled) return;
    setPhotoUri(result.assets[0].uri);
  }

  async function takePhoto() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') return;
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    });
    if (result.canceled) return;
    setPhotoUri(result.assets[0].uri);
  }

  const selectedAnimal  = ANIMAL_OPTIONS.find((a) => a.id === avatarTheme);
  const showStylePicker = mode === 'skip';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F8F7FF' }}>
      <StatusBar style="dark" />

      <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 20, paddingBottom: 40 }}>

        {/* Progress bar */}
        <View style={{ height: 6, backgroundColor: '#E0E0E0', borderRadius: 3, marginBottom: 8 }}>
          <View style={{ width: '37%', height: '100%', backgroundColor: '#7F77DD', borderRadius: 3 }} />
        </View>
        <Text style={{ fontSize: 13, color: '#888780', marginBottom: 16 }}>
          {t('onboarding.stepOf', { current: 3, total: 8 })} · {t('onboarding.step3sub')} 👨‍👩‍👧
        </Text>

        {/* Orange parent badge */}
        <View style={{ backgroundColor: '#FFF3DC', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, alignSelf: 'flex-start', marginBottom: 20 }}>
          <Text style={{ color: '#EF9F27', fontSize: 13, fontWeight: '600' }}>👨‍👩‍👧 {t('onboarding.parentsNote')}</Text>
        </View>

        <Text style={{ fontSize: 22, fontWeight: 'bold', color: '#2C2C2A', marginBottom: 6 }}>
          {t('onboarding.photo.title', { name: displayName })}
        </Text>
        <Text style={{ fontSize: 14, color: '#888780', marginBottom: 28 }}>
          {t('onboarding.photo.subtitle')}
        </Text>

        {/* ── Option cards ── */}
        {OPTION_CARDS.map((card) => {
          const selected = mode === card.id;
          return (
            <TouchableOpacity
              key={card.id}
              onPress={() => setMode(card.id)}
              style={{
                backgroundColor: selected ? '#EEEDFE' : '#fff',
                borderWidth: 2,
                borderColor: selected ? '#7F77DD' : '#E0E0E0',
                borderRadius: 16,
                padding: 16,
                flexDirection: 'row',
                alignItems: 'center',
                marginBottom: 12,
              }}
              activeOpacity={0.8}
            >
              <Text style={{ fontSize: 28, marginRight: 14 }}>{card.emoji}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: selected ? '#7F77DD' : '#2C2C2A', marginBottom: 3 }}>
                  {card.title}
                </Text>
                <Text style={{ fontSize: 12, color: '#888780', lineHeight: 17 }}>{card.subtitle}</Text>
              </View>
              <View style={{
                width: 20, height: 20, borderRadius: 10,
                borderWidth: 2,
                borderColor: selected ? '#7F77DD' : '#BDBDBD',
                backgroundColor: selected ? '#7F77DD' : '#fff',
                alignItems: 'center', justifyContent: 'center',
              }}>
                {selected && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff' }} />}
              </View>
            </TouchableOpacity>
          );
        })}

        {/* ── Photo mode content ── */}
        {mode === 'photo' && (
          <View style={{ marginTop: 8, marginBottom: 4 }}>
            <TouchableOpacity
              onPress={() => void pickPhoto()}
              style={{
                borderWidth: 2,
                borderColor: '#D0CEFA',
                borderStyle: 'dashed',
                borderRadius: 16,
                padding: 24,
                alignItems: 'center',
                backgroundColor: '#F8F7FF',
                marginBottom: 12,
              }}
            >
              {photoUri ? (
                <Image source={{ uri: photoUri }} style={{ width: 80, height: 80, borderRadius: 40, marginBottom: 8 }} />
              ) : (
                <Text style={{ fontSize: 40, marginBottom: 8 }}>📷</Text>
              )}
              <Text style={{ fontSize: 14, color: '#888780', textAlign: 'center' }}>
                {photoUri ? t('onboarding.photo.changePhoto') : t('onboarding.photo.tapToChoosePhoto')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => void pickPhoto()}
              style={{ backgroundColor: '#7F77DD', borderRadius: 9999, paddingVertical: 12, alignItems: 'center', marginBottom: 10 }}
              activeOpacity={0.85}
            >
              <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>{t('onboarding.photo.chooseFromLibrary')}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => void takePhoto()}
              style={{ backgroundColor: '#534AB7', borderRadius: 9999, paddingVertical: 12, alignItems: 'center', marginBottom: 12 }}
              activeOpacity={0.85}
            >
              <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>📷 {t('onboarding.photo.takePhotoButton')}</Text>
            </TouchableOpacity>

            <View style={{ flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#E8F8F3', borderRadius: 12, padding: 12, marginBottom: 20 }}>
              <Text style={{ fontSize: 14, marginRight: 6 }}>🔒</Text>
              <Text style={{ fontSize: 12, color: '#3A9974', flex: 1, lineHeight: 18 }}>
                {t('onboarding.photo.privacyNote')}
              </Text>
            </View>
          </View>
        )}

        {/* ── Skip mode content ── */}
        {mode === 'skip' && (
          <View style={{ alignItems: 'center', marginTop: 8, marginBottom: 20 }}>
            <View style={{
              width: 80, height: 80, borderRadius: 40,
              backgroundColor: '#EEEDFE',
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Text style={{ fontSize: 36, fontWeight: 'bold', color: '#7F77DD' }}>{initial}</Text>
            </View>
          </View>
        )}

        {/* ── Avatar style picker (photo + skip modes) ── */}
        {showStylePicker && (
          <>
            <Text style={{ fontSize: 14, fontWeight: '600', color: '#2C2C2A', marginBottom: 12 }}>
              {t('onboarding.photo.avatarStyleLabel')}
            </Text>
            <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
              {(['human', 'animal'] as const).map((style) => {
                const sel   = avatarStyle === style;
                const label = style === 'human' ? t('onboarding.photo.styleHuman') : t('onboarding.photo.styleAnimal');
                const desc  = style === 'human' ? t('onboarding.photo.styleHumanDesc') : t('onboarding.photo.styleAnimalDesc');
                const emoji = style === 'human' ? '🧑' : '🐾';
                return (
                  <TouchableOpacity
                    key={style}
                    onPress={() => setAvatarStyle(style)}
                    style={{
                      flex: 1,
                      backgroundColor: sel ? '#EEEDFE' : '#fff',
                      borderWidth: 2,
                      borderColor: sel ? '#7F77DD' : '#E0E0E0',
                      borderRadius: 16,
                      padding: 14,
                      alignItems: 'center',
                    }}
                    activeOpacity={0.8}
                  >
                    <Text style={{ fontSize: 28, marginBottom: 6 }}>{emoji}</Text>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: sel ? '#7F77DD' : '#2C2C2A', marginBottom: 3 }}>
                      {label}
                    </Text>
                    <Text style={{ fontSize: 11, color: '#888780', textAlign: 'center' }}>{desc}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Human face style grid */}
            {avatarStyle === 'human' && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 }}>
                {HUMAN_FACE_STYLES.map((face) => {
                  const sel = humanFaceStyle === face.id;
                  return (
                    <TouchableOpacity
                      key={face.id}
                      onPress={() => setHumanFaceStyle(face.id)}
                      style={{
                        width: '18%',
                        aspectRatio: 1,
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: 12,
                        borderWidth: 2,
                        borderColor: sel ? '#7F77DD' : '#E0E0E0',
                        backgroundColor: sel ? '#EEEDFE' : '#fff',
                      }}
                    >
                      <Text style={{ fontSize: 26 }}>{face.emoji}</Text>
                      <Text style={{ fontSize: 9, color: sel ? '#7F77DD' : '#888780', textAlign: 'center', marginTop: 2 }}>
                        {t(face.labelKey)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {/* Animal selection grid */}
            {avatarStyle === 'animal' && (
              <>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 }}>
                  {ANIMAL_OPTIONS.map((animal) => {
                    const sel = avatarTheme === animal.id;
                    return (
                      <TouchableOpacity
                        key={animal.id}
                        onPress={() => setAvatarTheme(animal.id)}
                        style={{
                          width: '22%',
                          aspectRatio: 1,
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderRadius: 12,
                          borderWidth: 2,
                          borderColor: sel ? '#7F77DD' : '#E0E0E0',
                          backgroundColor: sel ? '#EEEDFE' : '#fff',
                        }}
                      >
                        <Text style={{ fontSize: 28 }}>{animal.emoji}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {avatarTheme !== '' && (
                  <View style={{ alignItems: 'center', marginBottom: 8 }}>
                    <View style={{
                      width: 72, height: 72, borderRadius: 36,
                      backgroundColor: '#EEEDFE',
                      alignItems: 'center', justifyContent: 'center',
                      borderWidth: 3, borderColor: '#7F77DD',
                    }}>
                      <Text style={{ fontSize: 34 }}>{selectedAnimal?.emoji ?? '🐾'}</Text>
                    </View>
                    <Text style={{ fontSize: 12, color: '#888780', marginTop: 6 }}>
                      {t('onboarding.photo.avatarPreview', { name: displayName })}
                    </Text>
                  </View>
                )}
              </>
            )}
          </>
        )}

        {/* ── Buttons ── */}
        <View style={{ marginTop: 12 }}>
          <TouchableOpacity
            onPress={() => {
              if (mode === 'photo' && photoUri) {
                void (async () => {
                  try {
                    const response = await fetch(photoUri);
                    const blob = await response.blob();
                    const base64 = await new Promise<string>((resolve) => {
                      const reader = new FileReader();
                      reader.onloadend = () => resolve(reader.result as string);
                      reader.readAsDataURL(blob);
                    });
                    const avatarRes = await fetch(API_URL + '/avatar/generate', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ imageBase64: base64 }),
                    });
                    if (avatarRes.ok) {
                      const data = await avatarRes.json() as { cartoonUrl?: string };
                      if (data.cartoonUrl) setCartoonUrl(data.cartoonUrl);
                    }
                  } catch (e) {
                    console.warn('[photo] avatar generation failed:', e);
                  }
                })();
              }
              if (true) {
                setAvatarConfig(DEFAULT_AVATAR);
                const humanBg: Record<string, string> = {
                  princess:  '#FFD6E7',
                  cowboy:    '#F5DEB3',
                  superhero: '#D6E4FF',
                  classic:   '#E8F5E9',
                  sporty:    '#E3F2FD',
                  artistic:  '#F3E5F5',
                  cool:      '#E0F4FF',
                  sweet:     '#FCE4EC',
                };
                const animalBg: Record<string, string> = {
                  cat:    '#FFF3E0',
                  dog:    '#E8F5E9',
                  fox:    '#FFF8E1',
                  rabbit: '#FCE4EC',
                  bear:   '#EFEBE9',
                  owl:    '#F3E5F5',
                  lion:   '#FFF8E1',
                  panda:  '#F5F5F5',
                };
                const bg = avatarStyle === 'animal'
                  ? (animalBg[avatarTheme] ?? '#EEEDFE')
                  : (humanBg[humanFaceStyle] ?? '#EEEDFE');
                setAvatarBackground(bg);
              }
              router.push('/onboarding/mascot');
            }}
            style={{ backgroundColor: '#7F77DD', borderRadius: 9999, paddingVertical: 16, alignItems: 'center', marginBottom: 12 }}
            activeOpacity={0.85}
          >
            <Text style={{ color: '#fff', fontSize: 17, fontWeight: 'bold' }}>{t('common.continue')}</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.back()} style={{ paddingVertical: 12, alignItems: 'center' }}>
            <Text style={{ color: '#BDBDBD', fontSize: 14 }}>← {t('common.back')}</Text>
          </TouchableOpacity>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}
