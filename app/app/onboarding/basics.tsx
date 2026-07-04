import { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  SafeAreaView, ScrollView, Platform,
} from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTranslation } from 'react-i18next';
import { useOnboardingStore } from '@/store/onboardingStore';
import { useLanguageStore } from '@/store/languageStore';
import { dedupeDictatedText } from '@/utils/dedupeDictatedText';

// Children on Migo must be 5–12 years old.
const today = new Date();
const MAX_DATE = new Date(today.getFullYear() - 5, today.getMonth(), today.getDate());
const MIN_DATE = new Date(today.getFullYear() - 13, today.getMonth(), today.getDate());
const DEFAULT_DATE = new Date(today.getFullYear() - 8, today.getMonth(), today.getDate());

function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default function BasicsScreen() {
  const { t } = useTranslation();
  const {
    initParentEmail,
    childName, setChildName,
    dateOfBirth, setDateOfBirth,
    gender, setGender,
    setLanguage,
    specialNeeds, setSpecialNeeds,
    preReader, setPreReader,
  } = useOnboardingStore();

  const { language: globalLang } = useLanguageStore();

  const GENDER_CHIPS = [
    { label: t('onboarding.basics.genderGirl'), value: 'girl'  },
    { label: t('onboarding.basics.genderBoy'),  value: 'boy'   },
    { label: t('onboarding.basics.genderOther'), value: 'other' },
  ];

  const pickerDate = dateOfBirth ? new Date(dateOfBirth) : DEFAULT_DATE;

  const [showPicker, setShowPicker] = useState(false);

  useEffect(() => { void initParentEmail(); }, []);
  useEffect(() => { setLanguage(globalLang); }, [globalLang]);

  const canContinue = childName.trim().length > 0 && dateOfBirth !== '' && gender !== '';

  function handleContinue() {
    if (!canContinue) return;
    router.push(specialNeeds ? '/onboarding/needs' : '/onboarding/photo');
  }

  function onDateChange(_event: DateTimePickerEvent, selected?: Date) {
    if (Platform.OS === 'android') setShowPicker(false);
    if (selected) setDateOfBirth(toIso(selected));
  }

  const displayDate = dateOfBirth
    ? new Date(dateOfBirth).toLocaleDateString(globalLang === 'fr' ? 'fr-FR' : 'en-US', {
        year: 'numeric', month: 'long', day: 'numeric',
      })
    : (globalLang === 'fr' ? 'Sélectionner une date' : 'Select date of birth');

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
          onChangeText={(text) => setChildName(dedupeDictatedText(text))}
          autoCapitalize="words"
          autoCorrect={false}
        />

        {/* ── Date of Birth ── */}
        <Text style={{ fontSize: 14, fontWeight: '600', color: '#2C2C2A', marginBottom: 8 }}>
          {globalLang === 'fr' ? 'Date de naissance' : 'Date of birth'}
        </Text>

        {Platform.OS === 'ios' ? (
          <View style={{
            backgroundColor: '#fff',
            borderWidth: 1.5,
            borderColor: dateOfBirth ? '#7F77DD' : '#E0E0E0',
            borderRadius: 14,
            paddingHorizontal: 4,
            paddingVertical: 4,
            marginBottom: 28,
          }}>
            <DateTimePicker
              value={pickerDate}
              mode="date"
              display="spinner"
              maximumDate={MAX_DATE}
              minimumDate={MIN_DATE}
              onChange={onDateChange}
              locale={globalLang === 'fr' ? 'fr-FR' : 'en-US'}
            />
          </View>
        ) : (
          <View style={{ marginBottom: 28 }}>
            <TouchableOpacity
              onPress={() => setShowPicker(true)}
              style={{
                backgroundColor: '#fff',
                borderWidth: 1.5,
                borderColor: dateOfBirth ? '#7F77DD' : '#E0E0E0',
                borderRadius: 14,
                paddingHorizontal: 16,
                paddingVertical: 14,
              }}
              activeOpacity={0.7}
            >
              <Text style={{ fontSize: 15, color: dateOfBirth ? '#2C2C2A' : '#BDBDBD' }}>
                {displayDate}
              </Text>
            </TouchableOpacity>
            {showPicker && (
              <DateTimePicker
                value={pickerDate}
                mode="date"
                display="default"
                maximumDate={MAX_DATE}
                minimumDate={MIN_DATE}
                onChange={onDateChange}
              />
            )}
          </View>
        )}

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
