import { View, Text } from 'react-native';

interface Props {
  emoji: string;
  background: string;
  size: number;
}

export default function EmojiAvatar({ emoji, background, size }: Props) {
  return (
    <View style={{
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: background,
      alignItems: 'center', justifyContent: 'center',
    }}>
      <Text style={{ fontSize: size * 0.5 }}>{emoji}</Text>
    </View>
  );
}
