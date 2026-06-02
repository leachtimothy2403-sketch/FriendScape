import { useState } from 'react';
import { View, Text, TouchableOpacity, SafeAreaView, ScrollView, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTranslation } from 'react-i18next';
import { useOnboardingStore } from '@/store/onboardingStore';

const MASCOT_EMOJI: Record<string, string> = {
  pixel: '🤖', finn: '🦊', miga: '🧚', sage: '🦉',
};

const PACK_IDS = ['sketch-crew', 'animal-gang', 'fantasy-world', 'toon-town'] as const;
type PackId = (typeof PACK_IDS)[number];

export default function PackScreen() {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const { childName, mascotId, avatarPack, setAvatarPack } = useOnboardingStore();

  const displayName = childName.trim() || 'you';
  const mascotEmoji = MASCOT_EMOJI[mascotId] ?? '🧚';
  const initialPack = (avatarPack as PackId) || 'sketch-crew';
  const [selected, setSelected] = useState<PackId>(initialPack);

  const GAP   = 12;
  const HPAD  = 24;
  const cardW = (width - HPAD * 2 - GAP) / 2;

  const PACKS: { id: PackId; preview: string; name: string; desc: string }[] = [
    { id: 'sketch-crew',   preview: '🎨👧🧑', name: t('onboarding.pack.packs.sketchCrew'),   desc: t('onboarding.pack.packs.sketchCrewDesc')   },
    { id: 'animal-gang',   preview: '🐱🦊🐼', name: t('onboarding.pack.packs.animalGang'),   desc: t('onboarding.pack.packs.animalGangDesc')   },
    { id: 'fantasy-world', preview: '🧚🧙⚔️', name: t('onboarding.pack.packs.fantasyWorld'), desc: t('onboarding.pack.packs.fantasyWorldDesc') },
    { id: 'toon-town',     preview: '😄🌈✨', name: t('onboarding.pack.packs.toonTown'),     desc: t('onboarding.pack.packs.toonTownDesc')     },
  ];

  function handleSelect(id: PackId) {
    setSelected(id);
    setAvatarPack(id);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F8F7FF' }}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={{ paddingHorizontal: HPAD, paddingTop: 20, paddingBottom: 40 }}>

        {/* Progress */}
        <View style={{ height: 6, backgroundColor: '#E0E0E0', borderRadius: 3, marginBottom: 8 }}>
          <View style={{ width: '77%', height: '100%', backgroundColor: '#7F77DD', borderRadius: 3 }} />
        </View>
        <Text style={{ fontSize: 13, color: '#888780', marginBottom: 16 }}>
          Step 7 of 9 · {t('onboarding.pack.title', { name: displayName })}
        </Text>

        {/* Badge */}
        <View style={{ backgroundColor: '#E8F8F3', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, alignSelf: 'flex-start', marginBottom: 24 }}>
          <Text style={{ color: '#5DCAA5', fontSize: 13, fontWeight: '600' }}>
            🌟 {t('onboarding.pack.title', { name: displayName })}
          </Text>
        </View>

        {/* Mascot speech bubble */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 28 }}>
          <Text style={{ fontSize: 34, marginRight: 10, marginTop: 4 }}>{mascotEmoji}</Text>
          <View style={{
            flex: 1,
            backgroundColor: '#fff',
            borderRadius: 16,
            borderTopLeftRadius: 4,
            borderWidth: 1.5,
            borderColor: '#E0E0E0',
            padding: 12,
          }}>
            <Text style={{ fontSize: 13, color: '#2C2C2A', lineHeight: 20 }}>
              Amazing choices!! Now — what should your friends look like? Pick the style you love most!
            </Text>
          </View>
        </View>

        {/* 2×2 pack grid */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: GAP, marginBottom: 32 }}>
          {PACKS.map((pack) => {
            const sel = selected === pack.id;
            return (
              <TouchableOpacity
                key={pack.id}
                onPress={() => handleSelect(pack.id)}
                style={{
                  width: cardW,
                  padding: 16,
                  borderRadius: 16,
                  borderWidth: 2.5,
                  borderColor: sel ? '#7F77DD' : '#E8E6FF',
                  backgroundColor: sel ? '#EEEDFE' : '#fff',
                  alignItems: 'center',
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: sel ? 0.1 : 0.05,
                  shadowRadius: 8,
                  elevation: sel ? 4 : 2,
                }}
                activeOpacity={0.75}
              >
                <Text style={{ fontSize: 30, marginBottom: 10 }}>{pack.preview}</Text>
                <Text style={{
                  fontSize: 14, fontWeight: 'bold', textAlign: 'center',
                  color: sel ? '#7F77DD' : '#2C2C2A',
                  marginBottom: 6,
                }}>
                  {pack.name}
                </Text>
                <Text style={{ fontSize: 11, color: '#888780', textAlign: 'center', lineHeight: 16 }}>
                  {pack.desc}
                </Text>
                {sel && (
                  <View style={{
                    marginTop: 10,
                    width: 22, height: 22, borderRadius: 11,
                    backgroundColor: '#7F77DD',
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>✓</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Buttons */}
        <TouchableOpacity
          onPress={() => router.push('/onboarding/friends')}
          style={{ backgroundColor: '#7F77DD', borderRadius: 9999, paddingVertical: 16, alignItems: 'center', marginBottom: 12 }}
          activeOpacity={0.85}
        >
          <Text style={{ color: '#fff', fontSize: 17, fontWeight: 'bold' }}>{t('onboarding.pack.continueButton')}</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.back()} style={{ paddingVertical: 12, alignItems: 'center' }}>
          <Text style={{ color: '#BDBDBD', fontSize: 14 }}>← {t('common.back')}</Text>
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
}
