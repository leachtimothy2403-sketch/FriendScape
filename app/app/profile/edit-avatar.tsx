import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, SafeAreaView, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import AvatarBuilderCore from '@/components/AvatarBuilderCore';
import { avatarApi } from '@/services/api';
import { DEFAULT_AVATAR } from '@/types/avatar';
import type { AvatarConfig } from '@/types/avatar';

export default function EditAvatarScreen() {
  const { t }                            = useTranslation();
  const [loading,    setLoading]         = useState(true);
  const [saving,     setSaving]          = useState(false);
  const [initConfig, setInitConfig]      = useState<AvatarConfig>(DEFAULT_AVATAR);
  const [initBg,     setInitBg]          = useState('#EEEDFE');
  const [token,      setToken]           = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const tok = await AsyncStorage.getItem('childToken');
      if (!tok) { setLoading(false); return; }
      setToken(tok);
      try {
        const res = await avatarApi.get(tok);
        if (res.data.avatarConfig) setInitConfig(res.data.avatarConfig as unknown as AvatarConfig);
        if (res.data.avatarBackground) setInitBg(res.data.avatarBackground);
      } catch {
        // keep defaults
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  async function handleSave(config: AvatarConfig, bg: string) {
    if (!token) return;
    setSaving(true);
    try {
      await avatarApi.save(token, config as unknown as Record<string, unknown>, bg);
      router.back();
    } catch {
      setSaving(false);
    }
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
          {t('onboarding.avatarBuilder.editTitle')}
        </Text>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color="#7F77DD" size="large" />
        </View>
      ) : (
        <AvatarBuilderCore
          initialConfig={initConfig}
          initialBackground={initBg}
          saveLabel={t('onboarding.avatarBuilder.saveMyLook')}
          isSaving={saving}
          onSave={(config, bg) => void handleSave(config, bg)}
        />
      )}
    </SafeAreaView>
  );
}
