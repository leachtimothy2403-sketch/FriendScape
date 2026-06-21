import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '@/constants/theme';

export default function Index() {
  const [destination, setDestination] = useState<string | null>(null);

  useEffect(() => {
    async function check() {
      const [childToken, childProfile, authToken] = await AsyncStorage.multiGet([
        'childToken', 'childProfile', 'authToken',
      ]);
      if (childToken[1] && childProfile[1]) {
        setDestination('/(tabs)/feed');
      } else if (authToken[1]) {
        setDestination('/parent-children');
      } else {
        setDestination('/landing');
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
