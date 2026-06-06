import { View, Text, TouchableOpacity, SafeAreaView } from 'react-native';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

export default function AvatarBuilderScreen() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F8F7FF' }}>
      <StatusBar style="dark" />
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
        <Text style={{ fontSize: 64, marginBottom: 24 }}>🎨</Text>
        <Text style={{ fontSize: 22, fontWeight: 'bold', color: '#2C2C2A', textAlign: 'center', marginBottom: 12 }}>
          Avatar Builder
        </Text>
        <Text style={{ fontSize: 14, color: '#888780', textAlign: 'center', lineHeight: 22, marginBottom: 32 }}>
          Build your custom avatar — coming soon!
        </Text>
        <TouchableOpacity
          onPress={() => router.back()}
          style={{ backgroundColor: '#7F77DD', borderRadius: 9999, paddingVertical: 14, paddingHorizontal: 32 }}
          activeOpacity={0.85}
        >
          <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>← Go Back</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
