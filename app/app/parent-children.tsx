import { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, SafeAreaView, Image,
  ActivityIndicator, FlatList, ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import { children as childrenApi } from '@/services/api';
import { Colors } from '@/constants/theme';

const MASCOT_EMOJI: Record<string, string> = {
  pixel: '🤖',
  finn:  '🦊',
  miga:  '🧚',
  sage:  '🦉',
};

interface ChildRow {
  id: string;
  name: string;
  age: number;
  avatar_url: string | null;
  mascot: string | null;
}

type ListItem = ChildRow | { addNew: true };

export default function ParentChildrenScreen() {
  const { t } = useTranslation();
  const [childList, setChildList] = useState<ChildRow[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');

  useEffect(() => {
    childrenApi.list()
      .then(res => {
        const data = res.data as { children: ChildRow[] };
        setChildList(data.children ?? []);
      })
      .catch(() => setError(t('common.error')))
      .finally(() => setLoading(false));
  }, [t]);

  async function handleSelect(child: ChildRow) {
    await AsyncStorage.setItem('selectedChild', JSON.stringify({
      childId:   child.id,
      name:      child.name,
      avatarUrl: child.avatar_url,
    }));
    router.push('/parent/activity' as never);
  }

  async function handleLogOut() {
    await AsyncStorage.removeItem('authToken');
    router.replace('/landing' as never);
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

  const allItems: ListItem[] = [...childList, { addNew: true }];

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <StatusBar style="dark" />

      <View style={{ paddingTop: 32, paddingBottom: 12, paddingHorizontal: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View>
          <Text style={{ fontSize: 26, fontWeight: '800', color: '#2C2C2A' }}>
            {t('parentChildren.title')}
          </Text>
          <Text style={{ fontSize: 14, color: '#888780', marginTop: 4 }}>
            {t('parentChildren.subtitle')}
          </Text>
        </View>
        <TouchableOpacity onPress={() => void handleLogOut()} activeOpacity={0.7}>
          <Text style={{ fontSize: 13, color: '#888780' }}>{t('parentChildren.logOut')}</Text>
        </TouchableOpacity>
      </View>

      {error ? (
        <View style={{ paddingHorizontal: 24, marginBottom: 12 }}>
          <Text style={{ color: '#E53E3E', fontSize: 13 }}>{error}</Text>
        </View>
      ) : null}

      <FlatList
        data={allItems}
        keyExtractor={item => ('addNew' in item ? '__add__' : item.id)}
        numColumns={2}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
        columnWrapperStyle={{ justifyContent: 'space-between', marginBottom: 16 }}
        renderItem={({ item, index }) => {
          if ('addNew' in item) {
            const isOdd = childList.length % 2 !== 0;
            return (
              <TouchableOpacity
                onPress={() => router.push('/parent-add-child' as never)}
                activeOpacity={0.8}
                style={{
                  flex: 1,
                  marginLeft: isOdd ? 8 : 0,
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
                  {t('parentChildren.addChild')}
                </Text>
              </TouchableOpacity>
            );
          }

          const fallbackEmoji = MASCOT_EMOJI[item.mascot ?? ''] ?? '🧚';
          const isRightColumn = index % 2 !== 0;

          return (
            <TouchableOpacity
              onPress={() => void handleSelect(item)}
              activeOpacity={0.85}
              style={{
                flex: 1,
                marginLeft: isRightColumn ? 8 : 0,
                marginRight: isRightColumn ? 0 : 8,
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
              }}
            >
              {item.avatar_url ? (
                <Image
                  source={{ uri: item.avatar_url }}
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
              <Text style={{ fontSize: 12, color: '#888780', marginTop: 2 }}>
                {t('parentChildren.age', { age: item.age })}
              </Text>
            </TouchableOpacity>
          );
        }}
      />
    </SafeAreaView>
  );
}
