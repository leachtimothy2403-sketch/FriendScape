import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, SafeAreaView,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import { auth } from '@/services/api';
import MigoLogo from '@/components/MigoLogo';
import { Colors } from '@/constants/theme';

export default function ParentLoginScreen() {
  const { t } = useTranslation();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  async function handleLogin() {
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setError(t('parentLogin.errorEmptyFields'));
      return;
    }
    setError('');
    setLoading(true);
    try {
      const res = await auth.login({ email: trimmedEmail, password });
      const token = (res.data as { token: string }).token;
      await AsyncStorage.setItem('authToken', token);
      router.replace('/parent-children' as never);
    } catch (err: unknown) {
      const serverMsg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(serverMsg ?? t('parentLogin.errorInvalid'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
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
            {t('parentLogin.title')}
          </Text>
          <Text style={{ fontSize: 14, color: '#888780', marginBottom: 28, lineHeight: 20 }}>
            {t('parentLogin.subtitle')}
          </Text>

          <Text style={{ fontSize: 13, fontWeight: '600', color: '#2C2C2A', marginBottom: 6 }}>
            {t('parentLogin.emailLabel')}
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
              marginBottom: 16,
            }}
            value={email}
            onChangeText={v => { setEmail(v); setError(''); }}
            placeholder={t('parentLogin.emailPlaceholder')}
            placeholderTextColor={Colors.gray[400]}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!loading}
          />

          <Text style={{ fontSize: 13, fontWeight: '600', color: '#2C2C2A', marginBottom: 6 }}>
            {t('parentLogin.passwordLabel')}
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
              marginBottom: error ? 12 : 24,
            }}
            value={password}
            onChangeText={v => { setPassword(v); setError(''); }}
            placeholder={t('parentLogin.passwordPlaceholder')}
            placeholderTextColor={Colors.gray[400]}
            secureTextEntry
            editable={!loading}
            onSubmitEditing={() => void handleLogin()}
            returnKeyType="go"
          />

          {error ? (
            <Text style={{ fontSize: 13, color: '#E53E3E', marginBottom: 16, lineHeight: 18 }}>
              {error}
            </Text>
          ) : null}

          <TouchableOpacity
            onPress={() => void handleLogin()}
            disabled={loading}
            activeOpacity={0.85}
            style={{
              backgroundColor: '#7F77DD',
              borderRadius: 14,
              paddingVertical: 16,
              alignItems: 'center',
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>{t('parentLogin.loginButton')}</Text>
            }
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
