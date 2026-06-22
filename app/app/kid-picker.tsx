import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, SafeAreaView, Image, ActivityIndicator, FlatList, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTranslation } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { childAuth, childSession } from '@/services/api';
import { getChildProfiles, setActiveChildProfile, type LocalChildProfile } from '@/utils/childProfiles';
import { Colors } from '@/constants/theme';

const MASCOT_EMOJI: Record<string, string> = {
  pixel: '🤖',
  finn:  '🦊',
  miga:  '🧚',
  sage:  '🦉',
};

export default function KidPickerScreen() {
  const { t } = useTranslation();
  const [profiles, setProfiles] = useState<LocalChildProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState<string | null>(null);

  useEffect(() => {
    getChildProfiles().then(p => {
      if (p.length === 0) {
        router.replace('/enroll');
      } else {
        setProfiles(p);
        setLoading(false);
      }
    });
  }, []);

  async function handleSelect(profile: LocalChildProfile) {
    setSwitching(profile.childId);
    try {
      const tokenRes = await childAuth.login(profile.childId);
      const token = tokenRes.data.token;
      await setActiveChildProfile(profile, token);
      await AsyncStorage.setItem('childId', profile.childId);
      try { await childSession.start(token); } catch { /* non-fatal, don't block navigation */ }
      router.replace('/(tabs)/feed');
    } catch {
      setSwitching(null);
    }
  }

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-bg">
        <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator size="large" color={Colors.purple} />
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  const allItems: Array<LocalChildProfile | { addNew: true }> = [...profiles, { addNew: true }];

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <StatusBar style="dark" />

      <View style={{ paddingTop: 32, paddingBottom: 12, alignItems: 'center' }}>
        <Text style={{ fontSize: 26, fontWeight: '800', color: '#2C2C2A' }}>
          {t('kidPicker.title')}
        </Text>
        <Text style={{ fontSize: 14, color: '#888780', marginTop: 6 }}>
          {t('kidPicker.subtitle')}
        </Text>
      </View>

      <FlatList
        data={allItems}
        keyExtractor={(item) => ('addNew' in item ? '__add__' : item.childId)}
        numColumns={2}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
        columnWrapperStyle={{ justifyContent: 'space-between', marginBottom: 16 }}
        renderItem={({ item }) => {
          if ('addNew' in item) {
            return (
              <TouchableOpacity
                onPress={() => router.push('/enroll')}
                activeOpacity={0.8}
                style={{
                  flex: 1,
                  marginLeft: 8,
                  backgroundColor: '#EEEDFE',
                  borderRadius: 20,
                  paddingVertical: 28,
                  alignItems: 'center',
                  borderWidth: 2,
                  borderColor: '#7F77DD',
                  borderStyle: 'dashed',
                }}
              >
                <Text style={{ fontSize: 36, marginBottom: 10 }}>➕</Text>
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#7F77DD', textAlign: 'center' }}>
                  {t('kidPicker.addChild')}
                </Text>
              </TouchableOpacity>
            );
          }

          const isBusy = switching === item.childId;
          const fallbackEmoji = MASCOT_EMOJI[item.mascotId ?? ''] ?? '🧚';

          return (
            <TouchableOpacity
              onPress={() => !switching && void handleSelect(item)}
              activeOpacity={0.85}
              style={{
                flex: 1,
                marginRight: 8,
                backgroundColor: '#fff',
                borderRadius: 20,
                paddingVertical: 28,
                alignItems: 'center',
                borderWidth: 1.5,
                borderColor: '#E8E6FF',
                shadowColor: '#7F77DD',
                shadowOpacity: 0.08,
                shadowRadius: 8,
                elevation: 3,
                opacity: switching && !isBusy ? 0.5 : 1,
              }}
            >
              {isBusy ? (
                <View style={{ width: 72, height: 72, alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                  <ActivityIndicator size="large" color={Colors.purple} />
                </View>
              ) : item.avatarUrl ? (
                <Image
                  source={{ uri: item.avatarUrl }}
                  style={{ width: 72, height: 72, borderRadius: 36, marginBottom: 12 }}
                />
              ) : (
                <View style={{
                  width: 72, height: 72, borderRadius: 36,
                  backgroundColor: '#EEEDFE',
                  alignItems: 'center', justifyContent: 'center',
                  marginBottom: 12,
                }}>
                  <Text style={{ fontSize: 36 }}>{fallbackEmoji}</Text>
                </View>
              )}
              <Text style={{ fontSize: 15, fontWeight: '700', color: '#2C2C2A', textAlign: 'center' }}>
                {item.name}
              </Text>
            </TouchableOpacity>
          );
        }}
      />
    </SafeAreaView>
  );
}
