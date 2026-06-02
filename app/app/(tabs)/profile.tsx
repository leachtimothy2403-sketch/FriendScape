import { View, Text, SafeAreaView, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import { Mascots } from '@/constants/theme';
import { useLanguageStore } from '@/store/languageStore';

interface Profile {
  name: string;
  age: number;
  mascot: string;
  interests: string[];
  selectedPack: string;
  preReader: boolean;
}

export default function ProfileScreen() {
  const { t } = useTranslation();
  const { language, setLanguage } = useLanguageStore();
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    AsyncStorage.getItem('childProfile').then((raw) => {
      if (raw) setProfile(JSON.parse(raw));
    });
  }, []);

  async function handleLogout() {
    Alert.alert(
      'Switch accounts?',
      'This will return to the enrolment screen. Your progress is saved!',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Switch',
          style: 'destructive',
          onPress: async () => {
            await AsyncStorage.multiRemove(['authToken', 'childProfile']);
            router.replace('/enroll');
          },
        },
      ],
    );
  }

  const mascotKey = profile?.mascot || 'luna';
  const mascot    = Mascots[mascotKey];

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <View className="px-5 py-4 bg-white border-b border-gray-100">
        <Text className="text-2xl font-bold text-purple">My Profile 😊</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <View className="items-center mb-8">
          <View className="w-24 h-24 rounded-full bg-purple/10 items-center justify-center mb-4">
            <Text className="text-5xl">{mascot?.emoji || '😊'}</Text>
          </View>
          <Text className="text-2xl font-bold text-gray-800">{profile?.name || 'Explorer'}</Text>
          <Text className="text-base text-gray-400 mt-1">Age {profile?.age} · Migo Member</Text>
        </View>

        {/* ── Language picker ── */}
        <Text style={{ fontSize: 12, fontWeight: '700', color: '#888780', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
          Language / Langue
        </Text>
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 28 }}>
          <TouchableOpacity
            onPress={() => void setLanguage('en')}
            style={{
              flex: 1,
              paddingVertical: 12,
              alignItems: 'center',
              borderRadius: 12,
              borderWidth: 2,
              borderColor: language === 'en' ? '#7F77DD' : '#E0E0E0',
              backgroundColor: language === 'en' ? '#7F77DD' : '#fff',
            }}
            activeOpacity={0.8}
          >
            <Text style={{ fontSize: 14, fontWeight: '600', color: language === 'en' ? '#fff' : '#888780' }}>
              🇬🇧 English
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => void setLanguage('fr')}
            style={{
              flex: 1,
              paddingVertical: 12,
              alignItems: 'center',
              borderRadius: 12,
              borderWidth: 2,
              borderColor: language === 'fr' ? '#7F77DD' : '#E0E0E0',
              backgroundColor: language === 'fr' ? '#7F77DD' : '#fff',
            }}
            activeOpacity={0.8}
          >
            <Text style={{ fontSize: 14, fontWeight: '600', color: language === 'fr' ? '#fff' : '#888780' }}>
              🇫🇷 Français
            </Text>
          </TouchableOpacity>
        </View>

        <View className="bg-white rounded-2xl border border-gray-100 mb-6">
          <InfoRow label="Mascot" value={`${mascot?.emoji} ${mascotKey.charAt(0).toUpperCase() + mascotKey.slice(1)}`} />
          <InfoRow label="Pack" value={profile?.selectedPack || '—'} />
          <InfoRow label="Pre-reader mode" value={profile?.preReader ? 'On' : 'Off'} last />
        </View>

        {profile?.interests && profile.interests.length > 0 && (
          <View className="mb-6">
            <Text className="text-sm font-semibold text-gray-500 uppercase tracking-widest mb-3">Interests</Text>
            <View className="flex-row flex-wrap gap-2">
              {profile.interests.map((interest) => (
                <View key={interest} className="bg-purple/10 rounded-full px-4 py-2">
                  <Text className="text-sm text-purple font-semibold capitalize">{interest}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        <TouchableOpacity
          className="bg-white border border-red/30 rounded-2xl py-4 items-center mt-2"
          onPress={() => void handleLogout()}
        >
          <Text className="text-red font-semibold">Switch Child Account</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function InfoRow({ label, value, last = false }: { label: string; value: string; last?: boolean }) {
  return (
    <View className={`flex-row justify-between items-center px-4 py-4 ${!last ? 'border-b border-gray-100' : ''}`}>
      <Text className="text-sm text-gray-500">{label}</Text>
      <Text className="text-sm font-semibold text-gray-800">{value}</Text>
    </View>
  );
}
