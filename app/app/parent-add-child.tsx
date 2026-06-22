import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, SafeAreaView,
  KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import { useOnboardingStore } from '@/store/onboardingStore';
import MigoLogo from '@/components/MigoLogo';
import { Colors } from '@/constants/theme';

const AGE_CHIPS = ['5–6', '7–8', '9–10', '11–12'];

export default function ParentAddChildScreen() {
  const { t } = useTranslation();
  const store = useOnboardingStore();

  const [name, setName] = useState('');
  const [age, setAge]   = useState('');
  const [error, setError] = useState('');

  async function handleStart() {
    if (!name.trim()) {
      setError(t('parentAddChild.errorNoName'));
      return;
    }
    if (!age) {
      setError(t('parentAddChild.errorNoAge'));
      return;
    }
    setError('');
    store.setChildName(name.trim());
    store.setAge(age);
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

          <Text style={{ fontSize: 13, fontWeight: '600', color: '#2C2C2A', marginBottom: 12 }}>
            {t('parentAddChild.ageLabel')}
          </Text>
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: error ? 12 : 28 }}>
            {AGE_CHIPS.map((chip) => {
              const selected = age === chip;
              return (
                <TouchableOpacity
                  key={chip}
                  onPress={() => { setAge(chip); setError(''); }}
                  style={{
                    flex: 1,
                    paddingVertical: 12,
                    alignItems: 'center',
                    borderRadius: 12,
                    borderWidth: 2,
                    borderColor: selected ? '#7F77DD' : '#E8E6FF',
                    backgroundColor: selected ? '#7F77DD' : '#fff',
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={{ fontSize: 14, fontWeight: '700', color: selected ? '#fff' : '#888780' }}>
                    {chip}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

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
