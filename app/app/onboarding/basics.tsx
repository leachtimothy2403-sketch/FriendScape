import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  SafeAreaView, ScrollView, Modal, FlatList,
} from 'react-native';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTranslation } from 'react-i18next';
import { useOnboardingStore } from '@/store/onboardingStore';

const AGE_CHIPS = ['5–6', '7–8', '9–10', '11–12'];

const LANGUAGES = [
  { code: 'en', label: 'English'       },
  { code: 'fr', label: 'Français'      },
  { code: 'es', label: 'Español'       },
  { code: 'ar', label: 'العربية'       },
  { code: 'zh', label: '中文'           },
  { code: 'other', label: 'Other'      },
];

export default function BasicsScreen() {
  const { t } = useTranslation();
  const {
    initParentEmail,
    childName, setChildName,
    age, setAge,
    gender, setGender,
    language, setLanguage,
    specialNeeds, setSpecialNeeds,
    preReader, setPreReader,
  } = useOnboardingStore();

  const GENDER_CHIPS = [
    { label: t('onboarding.basics.genderGirl'), value: 'girl'  },
    { label: t('onboarding.basics.genderBoy'),  value: 'boy'   },
    { label: t('onboarding.basics.genderOther'), value: 'other' },
  ];

  const [langOpen, setLangOpen] = useState(false);

  useEffect(() => { void initParentEmail(); }, []);

  const canContinue = childName.trim().length > 0 && age !== '' && gender !== '';

  function handleContinue() {
    if (!canContinue) return;
    router.push(specialNeeds ? '/onboarding/needs' : '/onboarding/photo');
  }

  const selectedLangLabel = LANGUAGES.find(l => l.code === language)?.label ?? 'English';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F8F7FF' }}>
      <StatusBar style="dark" />

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 20, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Progress bar */}
        <View style={{ height: 6, backgroundColor: '#E0E0E0', borderRadius: 3, marginBottom: 8 }}>
          <View style={{ width: '12%', height: '100%', backgroundColor: '#7F77DD', borderRadius: 3 }} />
        </View>
        <Text style={{ fontSize: 13, color: '#888780', marginBottom: 16 }}>
          {t('onboarding.stepOf', { current: 1, total: 8 })} · {t('onboarding.step1sub')} 👨‍👩‍👧
        </Text>

        {/* Together badge */}
        <View style={{ backgroundColor: '#E8F8F3', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, alignSelf: 'flex-start', marginBottom: 20 }}>
          <Text style={{ color: '#5DCAA5', fontSize: 13, fontWeight: '600' }}>{t('onboarding.togetherBadge')}</Text>
        </View>

        <Text style={{ fontSize: 22, fontWeight: 'bold', color: '#2C2C2A', marginBottom: 6 }}>{t('onboarding.basics.title')}</Text>
        <Text style={{ fontSize: 14, color: '#888780', marginBottom: 28 }}>
          {t('onboarding.basics.subtitle')}
        </Text>

        {/* ── Name ── */}
        <Text style={{ fontSize: 14, fontWeight: '600', color: '#2C2C2A', marginBottom: 8 }}>{t('onboarding.basics.nameLabel')}</Text>
        <TextInput
          style={{
            backgroundColor: '#fff',
            borderWidth: 1.5,
            borderColor: '#E0E0E0',
            borderRadius: 14,
            paddingHorizontal: 16,
            paddingVertical: 14,
            fontSize: 16,
            color: '#2C2C2A',
            marginBottom: 28,
          }}
          placeholder={t('onboarding.basics.namePlaceholder')}
          placeholderTextColor="#BDBDBD"
          value={childName}
          onChangeText={setChildName}
          autoCapitalize="words"
          autoCorrect={false}
        />

        {/* ── Age ── */}
        <Text style={{ fontSize: 14, fontWeight: '600', color: '#2C2C2A', marginBottom: 12 }}>{t('onboarding.basics.ageLabel')}</Text>
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 28 }}>
          {AGE_CHIPS.map((chip) => {
            const selected = age === chip;
            return (
              <TouchableOpacity
                key={chip}
                onPress={() => setAge(chip)}
                style={{
                  flex: 1,
                  paddingVertical: 12,
                  alignItems: 'center',
                  borderRadius: 12,
                  borderWidth: 2,
                  borderColor: selected ? '#7F77DD' : '#E0E0E0',
                  backgroundColor: selected ? '#7F77DD' : '#fff',
                }}
              >
                <Text style={{ fontSize: 14, fontWeight: '700', color: selected ? '#fff' : '#888780' }}>
                  {chip}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ── Gender ── */}
        <Text style={{ fontSize: 14, fontWeight: '600', color: '#2C2C2A', marginBottom: 12 }}>{t('onboarding.basics.genderLabel')}</Text>
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 28 }}>
          {GENDER_CHIPS.map((chip) => {
            const selected = gender === chip.value;
            return (
              <TouchableOpacity
                key={chip.value}
                onPress={() => setGender(chip.value)}
                style={{
                  flex: 1,
                  paddingVertical: 12,
                  alignItems: 'center',
                  borderRadius: 12,
                  borderWidth: 2,
                  borderColor: selected ? '#7F77DD' : '#E0E0E0',
                  backgroundColor: selected ? '#7F77DD' : '#fff',
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: '700', color: selected ? '#fff' : '#888780' }}>
                  {chip.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ── Language ── */}
        <Text style={{ fontSize: 14, fontWeight: '600', color: '#2C2C2A', marginBottom: 8 }}>{t('onboarding.basics.languageLabel')}</Text>
        <TouchableOpacity
          onPress={() => setLangOpen(true)}
          style={{
            backgroundColor: '#fff',
            borderWidth: 1.5,
            borderColor: '#E0E0E0',
            borderRadius: 14,
            paddingHorizontal: 16,
            paddingVertical: 14,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 28,
          }}
        >
          <Text style={{ fontSize: 16, color: '#2C2C2A' }}>{selectedLangLabel}</Text>
          <Text style={{ fontSize: 12, color: '#BDBDBD' }}>▼</Text>
        </TouchableOpacity>

        {/* Language modal */}
        <Modal visible={langOpen} transparent animationType="fade">
          <TouchableOpacity
            style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}
            activeOpacity={1}
            onPress={() => setLangOpen(false)}
          >
            <View style={{ backgroundColor: '#fff', borderRadius: 24, paddingBottom: 32, overflow: 'hidden' }}>
              <View style={{ padding: 20, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: '#2C2C2A', textAlign: 'center' }}>
                  {t('onboarding.basics.languageLabel')}
                </Text>
              </View>
              <FlatList
                data={LANGUAGES}
                keyExtractor={(item) => item.code}
                renderItem={({ item }) => {
                  const selected = language === item.code;
                  return (
                    <TouchableOpacity
                      onPress={() => { setLanguage(item.code); setLangOpen(false); }}
                      style={{
                        paddingHorizontal: 24,
                        paddingVertical: 16,
                        backgroundColor: selected ? '#EEEDFE' : '#fff',
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <Text style={{ fontSize: 16, color: selected ? '#7F77DD' : '#2C2C2A', fontWeight: selected ? '600' : '400' }}>
                        {item.label}
                      </Text>
                      {selected && <Text style={{ color: '#7F77DD', fontWeight: '700' }}>✓</Text>}
                    </TouchableOpacity>
                  );
                }}
              />
            </View>
          </TouchableOpacity>
        </Modal>

        {/* ── Special needs ── */}
        <TouchableOpacity
          onPress={() => setSpecialNeeds(!specialNeeds)}
          style={{
            backgroundColor: specialNeeds ? '#EEEDFE' : '#fff',
            borderWidth: 1.5,
            borderColor: specialNeeds ? '#7F77DD' : '#E0E0E0',
            borderRadius: 16,
            padding: 16,
            flexDirection: 'row',
            alignItems: 'flex-start',
            marginBottom: 12,
          }}
          activeOpacity={0.8}
        >
          <View style={{
            width: 22, height: 22, borderRadius: 6,
            borderWidth: 2,
            borderColor: specialNeeds ? '#7F77DD' : '#BDBDBD',
            backgroundColor: specialNeeds ? '#7F77DD' : '#fff',
            alignItems: 'center', justifyContent: 'center',
            marginRight: 12, marginTop: 1, flexShrink: 0,
          }}>
            {specialNeeds && <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700', lineHeight: 16 }}>✓</Text>}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: '#2C2C2A', marginBottom: 3 }}>
              {t('onboarding.basics.specialNeedsLabel')}
            </Text>
            <Text style={{ fontSize: 12, color: '#888780', lineHeight: 18 }}>
              {t('onboarding.basics.specialNeedsDesc')}
            </Text>
          </View>
        </TouchableOpacity>

        {/* ── Pre-reader ── */}
        <TouchableOpacity
          onPress={() => setPreReader(!preReader)}
          style={{
            backgroundColor: preReader ? '#FFF8EC' : '#fff',
            borderWidth: 1.5,
            borderColor: preReader ? '#EF9F27' : '#E0E0E0',
            borderRadius: 16,
            padding: 16,
            flexDirection: 'row',
            alignItems: 'flex-start',
            marginBottom: 36,
          }}
          activeOpacity={0.8}
        >
          <View style={{
            width: 22, height: 22, borderRadius: 6,
            borderWidth: 2,
            borderColor: preReader ? '#EF9F27' : '#BDBDBD',
            backgroundColor: preReader ? '#EF9F27' : '#fff',
            alignItems: 'center', justifyContent: 'center',
            marginRight: 12, marginTop: 1, flexShrink: 0,
          }}>
            {preReader && <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700', lineHeight: 16 }}>✓</Text>}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: '#2C2C2A', marginBottom: 3 }}>
              {t('onboarding.basics.preReaderLabel')}
            </Text>
            <Text style={{ fontSize: 12, color: '#888780', lineHeight: 18 }}>
              {t('onboarding.basics.preReaderDesc')}
            </Text>
          </View>
        </TouchableOpacity>

        {/* ── Continue ── */}
        <TouchableOpacity
          onPress={handleContinue}
          disabled={!canContinue}
          style={{
            backgroundColor: canContinue ? '#7F77DD' : '#E0E0E0',
            borderRadius: 9999,
            paddingVertical: 16,
            alignItems: 'center',
          }}
          activeOpacity={0.85}
        >
          <Text style={{ color: canContinue ? '#fff' : '#BDBDBD', fontSize: 17, fontWeight: 'bold' }}>
            {t('common.continue')}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
