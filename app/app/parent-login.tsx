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
import { useLanguageStore } from '@/store/languageStore';
import MigoLogo from '@/components/MigoLogo';
import { Colors } from '@/constants/theme';

export default function ParentLoginScreen() {
  const { t } = useTranslation();
  const { setLanguage } = useLanguageStore();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [resetSent, setResetSent] = useState(false);
  const [otpToken, setOtpToken] = useState('');
  const [code, setCode]         = useState('');
  const [resent, setResent]     = useState(false);

  function serverError(err: unknown): string | undefined {
    return (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
  }

  async function handleForgotPassword() {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError(t('parentLogin.errorEnterEmailFirst'));
      return;
    }
    setError('');
    setResetSent(false);
    try {
      await auth.forgotPassword(trimmedEmail);
      setResetSent(true);
    } catch {
      // forgotPassword always returns success regardless — this catch is just network-failure safety
      setResetSent(true);
    }
  }

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
      setOtpToken((res.data as { otpToken: string }).otpToken);
    } catch (err: unknown) {
      setError(serverError(err) ?? t('parentLogin.errorInvalid'));
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp() {
    if (code.length !== 6) return;
    setError('');
    setLoading(true);
    try {
      const res = await auth.verifyOtp({ otpToken, code });
      const token = (res.data as { token: string }).token;
      await AsyncStorage.setItem('authToken', token);
      const lang = (res.data as Record<string, unknown>).language as string | undefined;
      if (lang === 'en' || lang === 'fr') {
        await setLanguage(lang);
      }
      router.replace('/parent-children' as never);
    } catch (err: unknown) {
      setError(serverError(err) ?? t('parentLogin.otpErrorGeneric'));
    } finally {
      setLoading(false);
    }
  }

  async function handleResendOtp() {
    setError('');
    setResent(false);
    try {
      await auth.resendOtp(otpToken);
      setResent(true);
    } catch (err: unknown) {
      setError(serverError(err) ?? t('parentLogin.otpErrorGeneric'));
    }
  }

  if (otpToken) {
    return (
      <SafeAreaView className="flex-1 bg-bg">
        <StatusBar style="dark" />
        <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView
            contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: 28, paddingBottom: 40 }}
            keyboardShouldPersistTaps="handled"
          >
            <View style={{ alignItems: 'center', marginBottom: 40 }}>
              <MigoLogo size="lg" showTagline />
            </View>

            <Text style={{ fontSize: 24, fontWeight: '800', color: '#2C2C2A', marginBottom: 6 }}>
              {t('parentLogin.otpTitle')}
            </Text>
            <Text style={{ fontSize: 14, color: '#888780', marginBottom: 28, lineHeight: 20 }}>
              {t('parentLogin.otpSubtitle', { email })}
            </Text>

            <Text style={{ fontSize: 13, fontWeight: '600', color: '#2C2C2A', marginBottom: 6 }}>
              {t('parentLogin.otpLabel')}
            </Text>
            <TextInput
              style={{
                borderWidth: 1.5,
                borderColor: '#E8E6FF',
                borderRadius: 14,
                paddingHorizontal: 16,
                paddingVertical: 14,
                fontSize: 22,
                letterSpacing: 8,
                textAlign: 'center',
                color: '#2C2C2A',
                backgroundColor: '#fff',
                marginBottom: error ? 12 : 24,
              }}
              value={code}
              onChangeText={v => { setCode(v.replace(/\D/g, '').slice(0, 6)); setError(''); }}
              placeholder="000000"
              placeholderTextColor={Colors.gray[400]}
              keyboardType="number-pad"
              maxLength={6}
              editable={!loading}
              autoFocus
              onSubmitEditing={() => void handleVerifyOtp()}
              returnKeyType="go"
            />

            {error ? (
              <Text style={{ fontSize: 13, color: '#E53E3E', marginBottom: 16, lineHeight: 18 }}>
                {error}
              </Text>
            ) : null}

            {resent ? (
              <Text style={{ fontSize: 13, color: '#7F77DD', marginBottom: 16, lineHeight: 18 }}>
                {t('parentLogin.otpResent')}
              </Text>
            ) : null}

            <TouchableOpacity
              onPress={() => void handleVerifyOtp()}
              disabled={loading || code.length !== 6}
              activeOpacity={0.85}
              style={{
                backgroundColor: '#7F77DD',
                borderRadius: 14,
                paddingVertical: 16,
                alignItems: 'center',
                opacity: loading || code.length !== 6 ? 0.7 : 1,
              }}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>{t('parentLogin.otpButton')}</Text>
              }
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => void handleResendOtp()}
              style={{ marginTop: 14, alignItems: 'center' }}
              activeOpacity={0.7}
            >
              <Text style={{ fontSize: 13, color: '#7F77DD', fontWeight: '600' }}>{t('parentLogin.otpResend')}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => { setOtpToken(''); setCode(''); setError(''); }}
              style={{ marginTop: 20, alignItems: 'center' }}
              activeOpacity={0.7}
            >
              <Text style={{ fontSize: 14, color: '#888780' }}>{t('parentLogin.otpBack')}</Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
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

          {resetSent ? (
            <Text style={{ fontSize: 13, color: '#7F77DD', marginBottom: 16, lineHeight: 18 }}>
              {t('parentLogin.resetLinkSent')}
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
            onPress={() => void handleForgotPassword()}
            style={{ marginTop: 14, alignItems: 'center' }}
            activeOpacity={0.7}
          >
            <Text style={{ fontSize: 13, color: '#7F77DD', fontWeight: '600' }}>{t('parentLogin.forgotPassword')}</Text>
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
