import { Stack, router } from 'expo-router';
import { useEffect } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import { I18nextProvider } from 'react-i18next';
import i18n from '@/i18n';
import { useLanguageStore } from '@/store/languageStore';
import { useNotificationStore } from '@/store/notificationStore';
import NotificationBanner from '@/components/NotificationBanner';
import '../global.css';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const initLanguage      = useLanguageStore((s) => s.initLanguage);
  const notification      = useNotificationStore((s) => s.notification);
  const clearNotification = useNotificationStore((s) => s.clearNotification);

  useEffect(() => {
    void initLanguage().finally(() => SplashScreen.hideAsync());
  }, []);

  return (
    <I18nextProvider i18n={i18n}>
      <Stack screenOptions={{ headerShown: false, animation: 'fade' }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="enroll" />
        <Stack.Screen name="waiting" />
        <Stack.Screen name="celebration" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="dm/[friendId]"
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="notifications"
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="parent"
          options={{ animation: 'slide_from_bottom' }}
        />
      </Stack>
      <NotificationBanner
        visible={notification !== null}
        friendName={notification?.friendName ?? ''}
        friendEmoji={notification?.friendEmoji ?? '🌟'}
        message={notification?.message ?? ''}
        onPress={() => {
          if (notification) {
            const id = notification.friendId;
            clearNotification();
            router.push(`/dm/${id}` as never);
          }
        }}
        onDismiss={clearNotification}
      />
    </I18nextProvider>
  );
}
