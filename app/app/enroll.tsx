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
import DevResetButton from '@/components/DevResetButton';
import MigoLogo from '@/components/MigoLogo';

export default function EnrollScreen() {
  const { t } = useTranslation();
  const { language, setLanguage } = useLanguageStore();

  const [email, setEmail]               = useState('');
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState('');
  const [focused, setFocused]           = useState(false);

  // "Already approved?" check state
  const [showCheckRow, setShowCheckRow] = useState(false);
  const [checkEmail, setCheckEmail]     = useState('');
  const [checkFocused, setCheckFocused] = useState(false);
  const [checking, setChecking]         = useState(false);
  const [checkMessage, setCheckMessage] = useState<{ text: string; color: string } | null>(null);

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
      const res = await auth.enroll({ parentEmail: trimmed, language });
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

  const handleAlreadyApproved = () => {
    // Pre-fill the check email with the main input if it looks valid
    if (validateEmail(email.trim())) setCheckEmail(email.trim());
    setShowCheckRow(true);
    setCheckMessage(null);
  };

  const handleCheckApproval = async () => {
    const trimmed = checkEmail.trim();
    if (!validateEmail(trimmed)) {
      setCheckMessage({ text: "Please enter a valid email address.", color: '#E53E3E' });
      return;
    }
    setCheckMessage(null);
    setChecking(true);
    try {
      const res = await auth.enrollmentStatus(trimmed);
      const status = res.data.status;
      if (status === 'approved') {
        await AsyncStorage.setItem('pendingParentEmail', trimmed);
        router.replace('/celebration');
      } else if (status === 'pending') {
        setCheckMessage({ text: t('enroll.approvalPending'), color: '#EF9F27' });
      } else {
        setCheckMessage({ text: t('enroll.approvalNotFound'), color: '#E53E3E' });
      }
    } catch {
      setCheckMessage({ text: t('enroll.approvalNotFound'), color: '#E53E3E' });
    } finally {
      setChecking(false);
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
            <View style={{ marginBottom: 16 }}>
              <MigoLogo size="lg" />
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

            {/* Already approved — tap to reveal check row */}
            <TouchableOpacity onPress={handleAlreadyApproved}>
              <Text style={{ color: '#7F77DD', fontSize: 14 }}>{t('enroll.alreadyApproved')}</Text>
            </TouchableOpacity>

            {/* Approval check row */}
            {showCheckRow && (
              <View style={{ width: '100%', marginTop: 20 }}>
                <TextInput
                  style={{
                    width: '100%',
                    backgroundColor: '#fff',
                    paddingHorizontal: 24,
                    paddingVertical: 14,
                    borderRadius: 9999,
                    borderWidth: 2,
                    borderColor: checkFocused ? '#7F77DD' : '#E0E0E0',
                    fontSize: 15,
                    color: '#2C2C2A',
                    marginBottom: 10,
                  }}
                  placeholder={t('enroll.placeholder')}
                  placeholderTextColor="#BDBDBD"
                  value={checkEmail}
                  onChangeText={(v) => { setCheckEmail(v); setCheckMessage(null); }}
                  onFocus={() => setCheckFocused(true)}
                  onBlur={() => setCheckFocused(false)}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />

                <TouchableOpacity
                  style={{
                    width: '100%',
                    alignItems: 'center',
                    paddingVertical: 14,
                    backgroundColor: '#5DCAA5',
                    borderRadius: 9999,
                    opacity: checking ? 0.75 : 1,
                  }}
                  onPress={() => void handleCheckApproval()}
                  disabled={checking}
                  activeOpacity={0.85}
                >
                  {checking
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={{ color: '#fff', fontSize: 16, fontWeight: 'bold' }}>{t('enroll.alreadyApprovedCheck')}</Text>
                  }
                </TouchableOpacity>

                {checkMessage && (
                  <Text style={{
                    color: checkMessage.color,
                    fontSize: 13,
                    textAlign: 'center',
                    marginTop: 10,
                    maxWidth: 300,
                    alignSelf: 'center',
                  }}>
                    {checkMessage.text}
                  </Text>
                )}
              </View>
            )}

            {/* Privacy note */}
            <Text style={{ fontSize: 11, color: '#BDBDBD', textAlign: 'center', marginTop: 28, maxWidth: 280 }}>
              {t('enroll.privacyNote')}
            </Text>

            {/* Dev-only skip */}
            {__DEV__ && (
              <TouchableOpacity
                onPress={() => router.replace('/celebration')}
                style={{ marginTop: 16 }}
              >
                <Text style={{ color: '#BDBDBD', fontSize: 11 }}>Skip to celebration (dev only)</Text>
              </TouchableOpacity>
            )}

            {/* Dev-only reset tools */}
            {__DEV__ && <DevResetButton />}

          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
