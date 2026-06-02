import { Tabs } from 'expo-router';
import { Colors } from '@/constants/theme';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
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
        name="feed"
        options={{ title: 'Home', tabBarIcon: ({ color }) => <TabIcon emoji="🏡" color={color} /> }}
      />
      <Tabs.Screen
        name="discover"
        options={{ title: 'Discover', tabBarIcon: ({ color }) => <TabIcon emoji="🔭" color={color} /> }}
      />
      <Tabs.Screen
        name="badges"
        options={{ title: 'Badges', tabBarIcon: ({ color }) => <TabIcon emoji="🏅" color={color} /> }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: 'Me', tabBarIcon: ({ color }) => <TabIcon emoji="😊" color={color} /> }}
      />
    </Tabs>
  );
}

function TabIcon({ emoji, color }: { emoji: string; color: string }) {
  const { Text } = require('react-native');
  return <Text style={{ fontSize: 22, opacity: color === Colors.purple ? 1 : 0.5 }}>{emoji}</Text>;
}
