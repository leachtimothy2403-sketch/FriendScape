import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '@/constants/theme';

export default function Index() {
  const [destination, setDestination] = useState<string | null>(null);

  useEffect(() => {
    async function check() {
      const [token, profile] = await AsyncStorage.multiGet(['authToken', 'childProfile']);
      if (token[1] && profile[1]) {
        setDestination('/(tabs)/feed');
      } else {
        setDestination('/enroll');
      }
    }
    check();
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
