import { View, Text, TouchableOpacity, SafeAreaView } from 'react-native';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTranslation } from 'react-i18next';
import AvatarBuilderCore from '@/components/AvatarBuilderCore';
import { useOnboardingStore } from '@/store/onboardingStore';
import { DEFAULT_AVATAR } from '../../../shared/types/avatar';
import type { AvatarConfig } from '../../../shared/types/avatar';

export default function AvatarBuilderScreen() {
  const { t }                                                     = useTranslation();
  const { avatarConfig, avatarBackground, setAvatarConfig, setAvatarBackground } = useOnboardingStore();

  function handleSave(config: AvatarConfig, bg: string) {
    setAvatarConfig(config);
    setAvatarBackground(bg);
    router.back();
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F8F7FF' }}>
      <StatusBar style="dark" />

      {/* Header */}
      <View style={{
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: '#fff',
        borderBottomWidth: 1, borderBottomColor: '#F0EFF8',
        paddingHorizontal: 16, paddingVertical: 12,
      }}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 4, marginRight: 4 }}>
          <Text style={{ fontSize: 20, color: '#2C2C2A' }}>←</Text>
        </TouchableOpacity>
        <Text style={{ flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', color: '#2C2C2A', marginRight: 32 }}>
          {t('onboarding.avatarBuilder.title')}
        </Text>
      </View>

      <AvatarBuilderCore
        initialConfig={avatarConfig ?? DEFAULT_AVATAR}
        initialBackground={avatarBackground}
        saveLabel={t('onboarding.avatarBuilder.saveMyLook')}
        onSave={handleSave}
      />
    </SafeAreaView>
  );
}
