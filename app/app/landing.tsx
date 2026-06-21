import { View, Text, TouchableOpacity, SafeAreaView } from 'react-native';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTranslation } from 'react-i18next';
import MigoLogo from '@/components/MigoLogo';
import { getChildProfiles } from '@/utils/childProfiles';

export default function LandingScreen() {
  const { t } = useTranslation();

  async function handleKid() {
    const profiles = await getChildProfiles();
    if (profiles.length > 0) {
      router.push('/kid-picker');
    } else {
      router.push('/enroll');
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <StatusBar style="dark" />
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 }}>

        <MigoLogo size="lg" showTagline />

        <View style={{ height: 52 }} />

        <TouchableOpacity
          onPress={() => void handleKid()}
          activeOpacity={0.85}
          style={{
            width: '100%',
            backgroundColor: '#7F77DD',
            borderRadius: 20,
            paddingVertical: 22,
            alignItems: 'center',
            marginBottom: 16,
            shadowColor: '#7F77DD',
            shadowOpacity: 0.25,
            shadowRadius: 10,
            elevation: 4,
          }}
        >
          <Text style={{ fontSize: 22, fontWeight: '800', color: '#fff', marginBottom: 4 }}>
            {t('landing.kidButton')}
          </Text>
          <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)' }}>
            {t('landing.kidSubtitle')}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => router.push('/parent-login' as never)}
          activeOpacity={0.85}
          style={{
            width: '100%',
            backgroundColor: '#fff',
            borderRadius: 20,
            paddingVertical: 22,
            alignItems: 'center',
            borderWidth: 2,
            borderColor: '#7F77DD',
            shadowColor: '#000',
            shadowOpacity: 0.06,
            shadowRadius: 8,
            elevation: 2,
          }}
        >
          <Text style={{ fontSize: 22, fontWeight: '800', color: '#7F77DD', marginBottom: 4 }}>
            {t('landing.parentButton')}
          </Text>
          <Text style={{ fontSize: 13, color: '#888780' }}>
            {t('landing.parentSubtitle')}
          </Text>
        </TouchableOpacity>

      </View>
    </SafeAreaView>
  );
}
