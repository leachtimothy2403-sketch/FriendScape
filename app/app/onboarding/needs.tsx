import { View, Text, TouchableOpacity, SafeAreaView, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTranslation } from 'react-i18next';
import { useOnboardingStore } from '@/store/onboardingStore';

export default function NeedsScreen() {
  const { t } = useTranslation();
  const {
    specialNeedsDetails, setSpecialNeedsDetails,
    setPreReader,
  } = useOnboardingStore();

  const NEEDS_OPTIONS = [
    { id: 'autism',     emoji: '🧩', label: t('onboarding.needs.autism'),     desc: t('onboarding.needs.autismDesc')     },
    { id: 'dyslexia',   emoji: '📖', label: t('onboarding.needs.dyslexia'),   desc: t('onboarding.needs.dyslexiaDesc')   },
    { id: 'adhd',       emoji: '⚡', label: t('onboarding.needs.adhd'),       desc: t('onboarding.needs.adhdDesc')       },
    { id: 'preReader',  emoji: '🔤', label: t('onboarding.needs.preReader'),  desc: t('onboarding.needs.preReaderDesc')  },
    { id: 'motor',      emoji: '🤲', label: t('onboarding.needs.motorNeeds'), desc: t('onboarding.needs.motorNeedsDesc') },
    { id: 'none',       emoji: '✨', label: t('onboarding.needs.none'),       desc: t('onboarding.needs.noneDesc')       },
  ];

  function toggle(id: string) {
    if (id === 'none') {
      setSpecialNeedsDetails(['none']);
      return;
    }
    setSpecialNeedsDetails(
      specialNeedsDetails.includes(id)
        ? specialNeedsDetails.filter((s) => s !== id && s !== 'none')
        : [...specialNeedsDetails.filter((s) => s !== 'none'), id],
    );
    if (id === 'preReader') {
      setPreReader(!specialNeedsDetails.includes('preReader'));
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F8F7FF' }}>
      <StatusBar style="dark" />

      <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 20, paddingBottom: 40 }}>

        {/* Progress bar */}
        <View style={{ height: 6, backgroundColor: '#E0E0E0', borderRadius: 3, marginBottom: 8 }}>
          <View style={{ width: '25%', height: '100%', backgroundColor: '#7F77DD', borderRadius: 3 }} />
        </View>
        <Text style={{ fontSize: 13, color: '#888780', marginBottom: 16 }}>Step 2 of 8 · Together 👨‍👩‍👧</Text>

        {/* Together badge */}
        <View style={{ backgroundColor: '#E8F8F3', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, alignSelf: 'flex-start', marginBottom: 20 }}>
          <Text style={{ color: '#5DCAA5', fontSize: 13, fontWeight: '600' }}>{t('onboarding.togetherBadge')}</Text>
        </View>

        <Text style={{ fontSize: 22, fontWeight: 'bold', color: '#2C2C2A', marginBottom: 6 }}>{t('onboarding.needs.title')}</Text>
        <Text style={{ fontSize: 14, color: '#888780', marginBottom: 28, lineHeight: 20 }}>
          {t('onboarding.needs.subtitle')}
        </Text>

        {/* 2-column grid */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 36 }}>
          {NEEDS_OPTIONS.map((opt) => {
            const selected = specialNeedsDetails.includes(opt.id);
            return (
              <TouchableOpacity
                key={opt.id}
                onPress={() => toggle(opt.id)}
                style={{
                  width: '47%',
                  padding: 16,
                  borderRadius: 16,
                  borderWidth: 2,
                  borderColor: selected ? '#7F77DD' : '#E0E0E0',
                  backgroundColor: selected ? '#EEEDFE' : '#fff',
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: 0.05,
                  shadowRadius: 4,
                  elevation: 2,
                }}
                activeOpacity={0.75}
              >
                <Text style={{ fontSize: 28, marginBottom: 8 }}>{opt.emoji}</Text>
                <Text style={{ fontSize: 13, fontWeight: '700', color: selected ? '#7F77DD' : '#2C2C2A', marginBottom: 4 }}>
                  {opt.label}
                </Text>
                <Text style={{ fontSize: 11, color: '#888780', lineHeight: 16 }}>{opt.desc}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Buttons */}
        <TouchableOpacity
          onPress={() => router.push('/onboarding/photo')}
          style={{ backgroundColor: '#7F77DD', borderRadius: 9999, paddingVertical: 16, alignItems: 'center', marginBottom: 12 }}
          activeOpacity={0.85}
        >
          <Text style={{ color: '#fff', fontSize: 17, fontWeight: 'bold' }}>{t('common.continue')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => router.back()}
          style={{ paddingVertical: 12, alignItems: 'center' }}
        >
          <Text style={{ color: '#BDBDBD', fontSize: 14 }}>← {t('common.back')}</Text>
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
}
