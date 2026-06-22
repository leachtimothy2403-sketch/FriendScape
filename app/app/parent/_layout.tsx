import { Tabs, router, useFocusEffect } from 'expo-router';
import { Text, View, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '@/constants/theme';

function TabIcon({ emoji, active }: { emoji: string; active: boolean }) {
  return <Text style={{ fontSize: 22, opacity: active ? 1 : 0.5 }}>{emoji}</Text>;
}

export default function ParentLayout() {
  const insets = useSafeAreaInsets();
  const [childName, setChildName] = useState('');

  useFocusEffect(useCallback(() => {
    AsyncStorage.getItem('selectedChild').then(raw => {
      try {
        const parsed = JSON.parse(raw ?? '{}') as { name?: string };
        setChildName(parsed.name ?? '');
      } catch {
        setChildName('');
      }
    });
  }, []));

  async function handleLogOut() {
    await AsyncStorage.removeItem('authToken');
    router.replace('/landing');
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        header: () => (
          <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: '#fff',
            paddingHorizontal: 16,
            paddingTop: insets.top + 8,
            paddingBottom: 12,
            borderBottomWidth: 1,
            borderBottomColor: '#F0EFF8',
          }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: '#2C2C2A' }} numberOfLines={1}>
              {childName || '—'}
            </Text>
            <View style={{ flexDirection: 'row', gap: 4 }}>
              <TouchableOpacity
                onPress={() => router.push('/parent-children')}
                style={{ padding: 8 }}
                activeOpacity={0.7}
              >
                <Text style={{ fontSize: 20 }}>🔄</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => void handleLogOut()}
                style={{ padding: 8 }}
                activeOpacity={0.7}
              >
                <Text style={{ fontSize: 20 }}>🚪</Text>
              </TouchableOpacity>
            </View>
          </View>
        ),
        tabBarActiveTintColor: Colors.purple,
        tabBarInactiveTintColor: Colors.gray[400],
        tabBarStyle: {
          backgroundColor: Colors.white,
          borderTopColor: Colors.gray[200],
          borderTopWidth: 1,
          paddingBottom: 8,
          paddingTop: 4,
          height: 64,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
        },
      }}
    >
      <Tabs.Screen
        name="activity"
        options={{
          title: 'Activity',
          tabBarIcon: ({ focused }) => <TabIcon emoji="📅" active={focused} />,
        }}
      />
      <Tabs.Screen
        name="mood"
        options={{
          title: 'Mood',
          tabBarIcon: ({ focused }) => <TabIcon emoji="😊" active={focused} />,
        }}
      />
      <Tabs.Screen
        name="friends"
        options={{
          title: 'Friends',
          tabBarIcon: ({ focused }) => <TabIcon emoji="👥" active={focused} />,
        }}
      />
      <Tabs.Screen
        name="badges"
        options={{
          title: 'Badges',
          tabBarIcon: ({ focused }) => <TabIcon emoji="🏅" active={focused} />,
        }}
      />
      <Tabs.Screen
        name="alerts"
        options={{
          title: 'Alerts',
          tabBarIcon: ({ focused }) => <TabIcon emoji="🔔" active={focused} />,
        }}
      />
    </Tabs>
  );
}
