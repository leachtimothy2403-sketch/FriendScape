import { View, Image, Text } from 'react-native';

const SIZES = {
  sm: { width: 80,  height: 32 },
  md: { width: 140, height: 56 },
  lg: { width: 220, height: 88 },
} as const;

interface MigoLogoProps {
  size?: keyof typeof SIZES;
  showTagline?: boolean;
}

export default function MigoLogo({ size = 'md', showTagline = false }: MigoLogoProps) {
  const { width, height } = SIZES[size];
  return (
    <View style={{ alignItems: 'center' }}>
      <Image
        source={require('../assets/images/migo-logo.jpg')}
        style={{ width, height, resizeMode: 'contain' }}
      />
      {showTagline && (
        <Text style={{ fontSize: 11, color: '#888780', fontWeight: '600', marginTop: 4, textAlign: 'center' }}>
          Learn, Discover &amp; Make Friends Together
        </Text>
      )}
    </View>
  );
}
