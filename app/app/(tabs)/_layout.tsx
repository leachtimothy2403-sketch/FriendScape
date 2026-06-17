import { Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Text, Animated } from 'react-native';
import { useRef, useEffect } from 'react';
import { Colors } from '@/constants/theme';
import { useTourStore } from '@/store/tourStore';

const HOME_STEP_IDS = new Set(['friends_row', 'audio_button', 'post_button', 'friend_post', 'dm_hint']);

export default function TabsLayout() {
  const { t } = useTranslation();
  const tourStepId = useTourStore(s => s.tourStepId);

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
        options={{
          title: t('tabs.home'),
          tabBarIcon: ({ color }) => (
            <AnimatedTabIcon emoji="🏡" color={color} pulsing={HOME_STEP_IDS.has(tourStepId ?? '')} />
          ),
        }}
      />
      <Tabs.Screen
        name="discover"
        options={{
          title: t('tabs.discover'),
          tabBarIcon: ({ color }) => (
            <AnimatedTabIcon emoji="🔭" color={color} pulsing={tourStepId === 'discover_tab'} />
          ),
        }}
      />
      <Tabs.Screen
        name="badges"
        options={{
          title: t('tabs.badges'),
          tabBarIcon: ({ color }) => (
            <AnimatedTabIcon emoji="🏅" color={color} pulsing={tourStepId === 'badges_tab'} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('tabs.me'),
          tabBarIcon: ({ color }) => (
            <AnimatedTabIcon emoji="😊" color={color} pulsing={tourStepId === 'me_tab'} />
          ),
        }}
      />
    </Tabs>
  );
}

function AnimatedTabIcon({ emoji, color, pulsing }: { emoji: string; color: string; pulsing: boolean }) {
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (pulsing) {
      const anim = Animated.loop(
        Animated.sequence([
          Animated.timing(scale, { toValue: 2.0, duration: 400, useNativeDriver: true }),
          Animated.timing(scale, { toValue: 1.0, duration: 400, useNativeDriver: true }),
        ]),
        { iterations: 3 },
      );
      anim.start();
      return () => anim.stop();
    } else {
      scale.setValue(1);
    }
  }, [pulsing, scale]);

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Text style={{ fontSize: 22, opacity: color === Colors.purple ? 1 : 0.5 }}>{emoji}</Text>
    </Animated.View>
  );
}
