import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import { auth } from '@/services/api';
import { useLanguageStore } from '@/store/languageStore';

export default function EnrollScreen() {
  const { t } = useTranslation();
  const { language, setLanguage } = useLanguageStore();

  const [email, setEmail]     = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [focused, setFocused] = useState(false);

  const translateY = useSharedValue(0);

  useEffect(() => {
    translateY.value = withRepeat(
      withSequence(
        withTiming(-14, { duration: 1500, easing: Easing.inOut(Easing.sin) }),
        withTiming(0,   { duration: 1500, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    );
  }, []);

  const floatStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const validateEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

  const handleSend = async () => {
    const trimmed = email.trim();
    if (!validateEmail(trimmed)) {
      setError("That doesn't look like a valid email — check and try again!");
      return;
    }
    setError('');
    setLoading(true);
    try {
      const res = await auth.enroll({ parentEmail: trimmed });
      await AsyncStorage.setItem('pendingParentEmail', trimmed);
      if (res.data.status === 'already_approved') {
        router.replace('/celebration');
      } else {
        router.push('/waiting');
      }
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'Something went wrong. Please try again!';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
        >
          <View className="flex-1 items-center justify-center px-8 py-12">

            {/* Logo */}
            <View style={{ flexDirection: 'row', marginBottom: 16 }}>
              <Text style={{ fontSize: 32, fontWeight: 'bold', color: '#2C2C2A' }}>Mi</Text>
              <Text style={{ fontSize: 32, fontWeight: 'bold', color: '#7F77DD' }}>go</Text>
            </View>

            {/* Language picker */}
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 24 }}>
              <TouchableOpacity
                onPress={() => void setLanguage('en')}
                style={{
                  paddingHorizontal: 18,
                  paddingVertical: 9,
                  borderRadius: 9999,
                  borderWidth: 1.5,
                  borderColor: language === 'en' ? '#7F77DD' : '#E0E0E0',
                  backgroundColor: language === 'en' ? '#7F77DD' : '#fff',
                }}
                activeOpacity={0.8}
              >
                <Text style={{
                  fontSize: 14,
                  fontWeight: '600',
                  color: language === 'en' ? '#fff' : '#888780',
                }}>
                  🇬🇧 English
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => void setLanguage('fr')}
                style={{
                  paddingHorizontal: 18,
                  paddingVertical: 9,
                  borderRadius: 9999,
                  borderWidth: 1.5,
                  borderColor: language === 'fr' ? '#7F77DD' : '#E0E0E0',
                  backgroundColor: language === 'fr' ? '#7F77DD' : '#fff',
                }}
                activeOpacity={0.8}
              >
                <Text style={{
                  fontSize: 14,
                  fontWeight: '600',
                  color: language === 'fr' ? '#fff' : '#888780',
                }}>
                  🇫🇷 Français
                </Text>
              </TouchableOpacity>
            </View>

            {/* Floating fairy */}
            <Animated.Text style={[{ fontSize: 80, marginBottom: 28 }, floatStyle]}>
              🧚
            </Animated.Text>

            {/* Heading */}
            <Text style={{ fontSize: 24, fontWeight: 'bold', color: '#2C2C2A', textAlign: 'center', marginBottom: 12 }}>
              {t('enroll.title')}
            </Text>

            {/* Subtext */}
            <Text style={{ fontSize: 14, color: '#888780', textAlign: 'center', maxWidth: 300, lineHeight: 22, marginBottom: 36 }}>
              {t('enroll.subtitle')}
            </Text>

            {/* Email input */}
            <TextInput
              style={{
                width: '100%',
                backgroundColor: '#fff',
                paddingHorizontal: 24,
                paddingVertical: 16,
                borderRadius: 9999,
                borderWidth: 2,
                borderColor: focused ? '#7F77DD' : '#E0E0E0',
                fontSize: 16,
                color: '#2C2C2A',
                marginBottom: 12,
              }}
              placeholder={t('enroll.placeholder')}
              placeholderTextColor="#BDBDBD"
              value={email}
              onChangeText={(v) => { setEmail(v); setError(''); }}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />

            {/* Error */}
            {!!error && (
              <Text className="text-red text-sm text-center mb-3" style={{ maxWidth: 300 }}>
                {error}
              </Text>
            )}

            {/* Send button */}
            <TouchableOpacity
              style={{
                width: '100%',
                alignItems: 'center',
                paddingVertical: 16,
                marginBottom: 20,
                backgroundColor: '#7F77DD',
                borderRadius: 9999,
                opacity: loading ? 0.75 : 1,
              }}
              onPress={() => void handleSend()}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={{ color: '#fff', fontSize: 18, fontWeight: 'bold' }}>{t('enroll.sendButton')}</Text>
              }
            </TouchableOpacity>

            {/* Already approved */}
            <TouchableOpacity onPress={() => router.push('/celebration')}>
              <Text style={{ color: '#7F77DD', fontSize: 14 }}>{t('enroll.alreadyApproved')}</Text>
            </TouchableOpacity>

            {/* Privacy note */}
            <Text style={{ fontSize: 11, color: '#BDBDBD', textAlign: 'center', marginTop: 28, maxWidth: 280 }}>
              {t('enroll.privacyNote')}
            </Text>

          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
