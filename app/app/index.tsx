import { Redirect, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '@/constants/theme';
import { childSession } from '@/services/api';

export default function Index() {
  const [destination, setDestination] = useState<string | null>(null);

  useEffect(() => {
    async function check() {
      const [childToken, childProfile, authToken] = await AsyncStorage.multiGet([
        'childToken', 'childProfile', 'authToken',
      ]);
      if (childToken[1] && childProfile[1]) {
        try {
          const statusRes = await childSession.status(childToken[1]);
          if (statusRes.data.limitExceeded) {
            router.replace('/time-limit');
            return;
          }
        } catch { /* non-fatal — if check fails, proceed to feed normally */ }
        setDestination('/(tabs)/feed');
      } else if (authToken[1]) {
        setDestination('/parent-children');
      } else {
        setDestination('/landing');
      }
    }
    void check();
  }, []);

  if (!destination) {
    return (
      <View className="flex-1 bg-bg items-center justify-center">
        <ActivityIndicator size="large" color={Colors.purple} />
      </View>
    );
  }

  return <Redirect href={destination as never} />;
}
