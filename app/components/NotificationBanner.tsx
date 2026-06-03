import { View, Text, TouchableOpacity, Animated, StyleSheet } from 'react-native';
import { useEffect, useRef } from 'react';

interface Props {
  visible: boolean;
  friendName: string;
  friendEmoji: string;
  message: string;
  onPress: () => void;
  onDismiss: () => void;
}

export default function NotificationBanner({
  visible, friendName, friendEmoji, message, onPress, onDismiss,
}: Props) {
  const translateY    = useRef(new Animated.Value(-120)).current;
  const dismissTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isVisible     = useRef(false);

  useEffect(() => {
    if (visible && !isVisible.current) {
      isVisible.current = true;
      Animated.timing(translateY, {
        toValue: 0, duration: 350, useNativeDriver: true,
      }).start();
      dismissTimer.current = setTimeout(() => slideOut(), 4000);
    }

    if (!visible && isVisible.current) {
      isVisible.current = false;
      slideOut();
    }

    return () => {
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
    };
  }, [visible]);

  function slideOut() {
    if (dismissTimer.current) { clearTimeout(dismissTimer.current); dismissTimer.current = null; }
    Animated.timing(translateY, {
      toValue: -120, duration: 300, useNativeDriver: true,
    }).start();
  }

  function handleDismiss() {
    slideOut();
    onDismiss();
  }

  if (!visible) return null;

  const preview = message.length > 40 ? message.slice(0, 40) + '...' : message;

  return (
    <Animated.View style={[s.container, { transform: [{ translateY }] }]} pointerEvents="box-none">
      <TouchableOpacity style={s.card} onPress={onPress} activeOpacity={0.9}>
        <View style={s.avatar}>
          <Text style={{ fontSize: 20 }}>{friendEmoji}</Text>
        </View>
        <View style={s.textBlock}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text style={s.name}>{friendName}</Text>
            <Text style={s.replied}>replied!</Text>
          </View>
          <Text style={s.preview} numberOfLines={1}>{preview}</Text>
        </View>
        <TouchableOpacity
          onPress={handleDismiss}
          style={s.closeBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={s.closeText}>×</Text>
        </TouchableOpacity>
      </TouchableOpacity>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 50,
    left: 12,
    right: 12,
    zIndex: 999,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#EEEDFE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  textBlock: { flex: 1 },
  name:      { fontSize: 13, fontWeight: '700', color: '#2C2C2A' },
  replied:   { fontSize: 12, color: '#888780' },
  preview:   { fontSize: 12, color: '#888780', marginTop: 1 },
  closeBtn:  { paddingHorizontal: 4 },
  closeText: { fontSize: 18, color: '#B4B2A9', lineHeight: 20 },
});
