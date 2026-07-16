import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, SafeAreaView,
  KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import { useOnboardingStore } from '@/store/onboardingStore';
import MigoLogo from '@/components/MigoLogo';
import { Colors } from '@/constants/theme';

const today = new Date();
const MAX_DATE = new Date(today.getFullYear() - 5, today.getMonth(), today.getDate());
const MIN_DATE = new Date(today.getFullYear() - 13, today.getMonth(), today.getDate());
const DEFAULT_DATE = new Date(today.getFullYear() - 8, today.getMonth(), today.getDate());

function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default function ParentAddChildScreen() {
  const { t, i18n } = useTranslation();
  const store = useOnboardingStore();
  // Without an explicit locale, iOS's native spinner can fall back to raw
  // month codes ("M01", "M02"...) instead of localized month names — this is
  // a known @react-native-community/datetimepicker quirk, not app state.
  const pickerLocale = i18n.language === 'fr' ? 'fr-FR' : 'en-US';

  const [name, setName]             = useState('');
  const [dateOfBirth, setDob]       = useState('');
  const [showPicker, setShowPicker] = useState(false);
  const [error, setError]           = useState('');

  const pickerDate = dateOfBirth ? new Date(dateOfBirth) : DEFAULT_DATE;

  function onDateChange(_event: DateTimePickerEvent, selected?: Date) {
    if (Platform.OS === 'android') setShowPicker(false);
    if (selected) { setDob(toIso(selected)); setError(''); }
  }

  const displayDate = dateOfBirth
    ? new Date(dateOfBirth).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : 'Select date of birth';

  async function handleStart() {
    if (!name.trim()) {
      setError(t('parentAddChild.errorNoName'));
      return;
    }
    if (!dateOfBirth) {
      setError(t('parentAddChild.errorNoAge'));
      return;
    }
    setError('');
    store.setChildName(name.trim());
    store.setDateOfBirth(dateOfBirth);
    await AsyncStorage.setItem('parentAddingChild', 'true');
    router.push('/onboarding/basics');
  }

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: 28, paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ alignItems: 'center', marginBottom: 40 }}>
            <MigoLogo size="lg" showTagline />
          </View>

          <Text style={{ fontSize: 24, fontWeight: '800', color: '#2C2C2A', marginBottom: 6 }}>
            {t('parentAddChild.title')}
          </Text>
          <Text style={{ fontSize: 14, color: '#888780', marginBottom: 28, lineHeight: 20 }}>
            {t('parentAddChild.subtitle')}
          </Text>

          <Text style={{ fontSize: 13, fontWeight: '600', color: '#2C2C2A', marginBottom: 6 }}>
            {t('parentAddChild.nameLabel')}
          </Text>
          <TextInput
            style={{
              borderWidth: 1.5,
              borderColor: '#E8E6FF',
              borderRadius: 14,
              paddingHorizontal: 16,
              paddingVertical: 14,
              fontSize: 16,
              color: '#2C2C2A',
              backgroundColor: '#fff',
              marginBottom: 24,
            }}
            value={name}
            onChangeText={v => { setName(v); setError(''); }}
            placeholder={t('parentAddChild.namePlaceholder')}
            placeholderTextColor={Colors.gray[400]}
            autoCapitalize="words"
            autoCorrect={false}
          />

          <Text style={{ fontSize: 13, fontWeight: '600', color: '#2C2C2A', marginBottom: 8 }}>
            Date of birth
          </Text>

          {Platform.OS === 'ios' ? (
            <View style={{
              backgroundColor: '#fff',
              borderWidth: 1.5,
              borderColor: dateOfBirth ? '#7F77DD' : '#E8E6FF',
              borderRadius: 14,
              paddingHorizontal: 4,
              paddingVertical: 4,
              marginBottom: error ? 12 : 28,
            }}>
              <DateTimePicker
                value={pickerDate}
                mode="date"
                display="spinner"
                locale={pickerLocale}
                maximumDate={MAX_DATE}
                minimumDate={MIN_DATE}
                onChange={onDateChange}
              />
            </View>
          ) : (
            <View style={{ marginBottom: error ? 12 : 28 }}>
              <TouchableOpacity
                onPress={() => setShowPicker(true)}
                style={{
                  backgroundColor: '#fff',
                  borderWidth: 1.5,
                  borderColor: dateOfBirth ? '#7F77DD' : '#E8E6FF',
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
                  locale={pickerLocale}
                  maximumDate={MAX_DATE}
                  minimumDate={MIN_DATE}
                  onChange={onDateChange}
                />
              )}
            </View>
          )}

          {error ? (
            <Text style={{ fontSize: 13, color: '#E53E3E', marginBottom: 16, lineHeight: 18 }}>
              {error}
            </Text>
          ) : null}

          <TouchableOpacity
            onPress={() => void handleStart()}
            activeOpacity={0.85}
            style={{
              backgroundColor: '#7F77DD',
              borderRadius: 14,
              paddingVertical: 16,
              alignItems: 'center',
            }}
          >
            <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>
              {t('parentAddChild.startButton')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => router.back()}
            style={{ marginTop: 20, alignItems: 'center' }}
            activeOpacity={0.7}
          >
            <Text style={{ fontSize: 14, color: '#888780' }}>{t('common.back')}</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
