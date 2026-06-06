import { useState } from 'react';
import { View, Text, TouchableOpacity, SafeAreaView, ScrollView, Image, ActivityIndicator } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTranslation } from 'react-i18next';
import { useOnboardingStore } from '@/store/onboardingStore';
import api from '@/services/api';

type Mode = 'photo' | 'builder' | 'skip';

export default function PhotoScreen() {
  const { t } = useTranslation();
  const { childName, avatarTheme, setAvatarTheme } = useOnboardingStore();

  const [mode, setMode]             = useState<Mode>('photo');
  const [photoUri, setPhotoUri]     = useState<string | null>(null);
  const [suggesting, setSuggesting] = useState(false);

  const displayName = childName.trim() || 'your child';
  const initial     = childName.trim() ? childName.trim()[0].toUpperCase() : '?';

  const THEMES = [
    { id: 'princess',  emoji: '👑', label: t('onboarding.photo.themes.princess')  },
    { id: 'astronaut', emoji: '🚀', label: t('onboarding.photo.themes.astronaut') },
    { id: 'cat',       emoji: '🐱', label: t('onboarding.photo.themes.cat')       },
    { id: 'superhero', emoji: '🦸', label: t('onboarding.photo.themes.superhero') },
    { id: 'nature',    emoji: '🌸', label: t('onboarding.photo.themes.nature')    },
    { id: 'wizard',    emoji: '🧙', label: t('onboarding.photo.themes.wizard')    },
    { id: 'artist',    emoji: '🎨', label: t('onboarding.photo.themes.artist')    },
    { id: 'dino',      emoji: '🦕', label: t('onboarding.photo.themes.dino')      },
  ];

  const OPTION_CARDS: { id: Mode; emoji: string; title: string; subtitle: string }[] = [
    { id: 'photo',   emoji: '📸', title: t('onboarding.photo.uploadPhoto'), subtitle: t('onboarding.photo.uploadDesc') },
    { id: 'builder', emoji: '🎨', title: t('onboarding.photo.buildAvatar'), subtitle: t('onboarding.photo.buildDesc')  },
    { id: 'skip',    emoji: '⏭️', title: t('onboarding.photo.skip'),        subtitle: t('onboarding.photo.skipDesc')   },
  ];

  async function pickPhoto() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
      base64: true,
    });
    if (result.canceled) return;

    const asset = result.assets[0];
    setPhotoUri(asset.uri);

    if (asset.base64) {
      setSuggesting(true);
      try {
        const res = await api.post<{ theme: string }>('/children/generate-avatar', {
          imageBase64: asset.base64,
          mediaType: asset.mimeType ?? 'image/jpeg',
        });
        if (THEMES.some((t) => t.id === res.data.theme)) {
          setAvatarTheme(res.data.theme);
        }
      } catch {
        // theme suggestion failed — user can still pick manually
      } finally {
        setSuggesting(false);
      }
    }
  }

  const selectedTheme = THEMES.find((th) => th.id === avatarTheme);
  const showThemeGrid = mode === 'photo' || mode === 'skip';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F8F7FF' }}>
      <StatusBar style="dark" />

      <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 20, paddingBottom: 40 }}>

        {/* Progress bar */}
        <View style={{ height: 6, backgroundColor: '#E0E0E0', borderRadius: 3, marginBottom: 8 }}>
          <View style={{ width: '33%', height: '100%', backgroundColor: '#7F77DD', borderRadius: 3 }} />
        </View>
        <Text style={{ fontSize: 13, color: '#888780', marginBottom: 16 }}>
          {t('onboarding.stepOf', { current: 3, total: 9 })} · {t('onboarding.step3sub')} 👨‍👩‍👧
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
                {photoUri ? t('common.retry') : t('onboarding.photo.tapToChoosePhoto')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => void pickPhoto()}
              style={{ backgroundColor: '#7F77DD', borderRadius: 9999, paddingVertical: 12, alignItems: 'center', marginBottom: 12 }}
              activeOpacity={0.85}
            >
              <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>{t('onboarding.photo.chooseFromLibrary')}</Text>
            </TouchableOpacity>

            <View style={{ flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#E8F8F3', borderRadius: 12, padding: 12, marginBottom: 20 }}>
              <Text style={{ fontSize: 14, marginRight: 6 }}>🔒</Text>
              <Text style={{ fontSize: 12, color: '#3A9974', flex: 1, lineHeight: 18 }}>
                {t('onboarding.photo.privacyNote')}
              </Text>
            </View>
          </View>
        )}

        {/* ── Builder mode content ── */}
        {mode === 'builder' && (
          <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20, marginTop: 8, marginBottom: 20, alignItems: 'center' }}>
            <Text style={{ fontSize: 36, marginBottom: 12 }}>🎨</Text>
            <Text style={{ fontSize: 14, color: '#888780', textAlign: 'center', lineHeight: 20 }}>
              Avatar builder coming soon! For now, your child will get a themed avatar with their initial.
            </Text>
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

        {/* ── Theme grid (photo + skip modes) ── */}
        {showThemeGrid && (
          <>
            <Text style={{ fontSize: 14, fontWeight: '600', color: '#2C2C2A', marginBottom: 12 }}>
              {t('onboarding.photo.themeLabel', { name: displayName })}
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 }}>
              {THEMES.map((th) => {
                const sel = avatarTheme === th.id;
                return (
                  <TouchableOpacity
                    key={th.id}
                    onPress={() => setAvatarTheme(th.id)}
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
                    <Text style={{ fontSize: 22 }}>{th.emoji}</Text>
                    <Text style={{ fontSize: 9, color: sel ? '#7F77DD' : '#888780', fontWeight: sel ? '700' : '400', marginTop: 3 }}>
                      {th.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {suggesting && (
              <View style={{ alignItems: 'center', marginBottom: 12 }}>
                <ActivityIndicator color="#7F77DD" />
                <Text style={{ fontSize: 12, color: '#888780', marginTop: 6 }}>
                  {t('onboarding.photo.suggestingTheme')}
                </Text>
              </View>
            )}

            {!suggesting && avatarTheme !== '' && (
              <View style={{ alignItems: 'center', marginBottom: 8 }}>
                <View style={{
                  width: 72, height: 72, borderRadius: 36,
                  backgroundColor: '#EEEDFE',
                  alignItems: 'center', justifyContent: 'center',
                  borderWidth: 3, borderColor: '#7F77DD',
                }}>
                  <Text style={{ fontSize: 34 }}>{selectedTheme?.emoji ?? '🌟'}</Text>
                </View>
                <Text style={{ fontSize: 12, color: '#888780', marginTop: 6 }}>
                  {initial}'s avatar preview
                </Text>
              </View>
            )}
          </>
        )}

        {/* ── Buttons ── */}
        <View style={{ marginTop: 12 }}>
          <TouchableOpacity
            onPress={() => router.push('/onboarding/mascot')}
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
