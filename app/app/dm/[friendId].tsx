import {
  View, Text, SafeAreaView, FlatList, TextInput,
  TouchableOpacity, KeyboardAvoidingView, Platform,
  Animated, StyleSheet,
} from 'react-native';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useLocalSearchParams, router, useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import { childMessages, childFriends, childAuth } from '@/services/api';
import { Colors } from '@/constants/theme';
import AudioPlayer from '@/components/AudioPlayer';
import { useNotificationStore } from '@/store/notificationStore';
import { sendWebNotification } from '@/utils/webNotifications';

interface ChatMessage {
  id: string;
  sender_id: string;
  sender_type: 'child' | 'ai';
  content: string;
  created_at: string;
  conversation_id?: string;
}

type DisplayItem = ChatMessage | { id: string; sender_type: 'typing' };

function firstEmoji(str: string | null | undefined): string {
  if (!str) return '🌟';
  return [...str][0] ?? '🌟';
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en', {
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

const FRIEND_BG: Record<string, string> = {
  Mia:  '#EEEDFE',
  Jake: '#E1F5EE',
  Zara: '#FAECE7',
};

export default function DMScreen() {
  const { t } = useTranslation();
  const { friendId } = useLocalSearchParams<{ friendId: string }>();

  const [messages, setMessages]               = useState<ChatMessage[]>([]);
  const [inputText, setInputText]             = useState('');
  const [sending, setSending]                 = useState(false);
  const [showTyping, setShowTyping]           = useState(false);
  const [friendName, setFriendName]           = useState('Friend');
  const [friendEmoji, setFriendEmoji]         = useState('🌟');
  const [friendBg, setFriendBg]               = useState('#EEEDFE');
  const [childToken, setChildToken]           = useState<string | null>(null);
  const [toast, setToast]                     = useState('');
  const [isOnline, setIsOnline]               = useState<boolean | null>(null);
  const [replyTimedOut, setReplyTimedOut]     = useState(false);
  const [countdown, setCountdown]             = useState<number | null>(null);

  const listRef        = useRef<FlatList<DisplayItem>>(null);
  const inputRef       = useRef<TextInput>(null);
  const tokenRef       = useRef<string | null>(null);
  const pollRef        = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingMsgRef  = useRef<ChatMessage | null>(null);
  const isFocusedRef   = useRef(true);

  const showNotification = useNotificationStore((s) => s.showNotification);

  const isWeb = Platform.OS === 'web';

  useFocusEffect(
    useCallback(() => {
      isFocusedRef.current = true;
      return () => { isFocusedRef.current = false; };
    }, []),
  );

  const baseData: DisplayItem[] = showTyping
    ? [{ id: '__typing__', sender_type: 'typing' }, ...messages]
    : [...messages];
  const displayData = isWeb ? [...baseData].reverse() : baseData;

  useEffect(() => {
    if (!isWeb) return;
    const t = setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 50);
    return () => clearTimeout(t);
  }, [messages, showTyping]);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      let token = await AsyncStorage.getItem('childToken');
      const childId = await AsyncStorage.getItem('childId');

      if (!token && childId) {
        try {
          const res = await childAuth.login(childId);
          token = res.data.token;
          await AsyncStorage.setItem('childToken', token);
        } catch (e) {
          console.error('[dm] child-login failed:', e);
        }
      }

      if (!cancelled && token) {
        tokenRef.current = token;
        setChildToken(token);
      }

      try {
        const [friendRes, msgRes, statusRes] = await Promise.all([
          childFriends.get(token ?? '', friendId),
          childMessages.get(token ?? '', friendId),
          childFriends.getStatus(friendId).catch(() => null),
        ]);

        const friend = friendRes.data.friend as Record<string, unknown>;
        const name   = String(friend.name ?? 'Friend');
        const emojis = String(friend.cover_emojis ?? '🌟');
        const emoji  = firstEmoji(emojis);

        if (!cancelled) {
          setFriendName(name);
          setFriendEmoji(emoji);
          setFriendBg(FRIEND_BG[name] ?? '#EEEDFE');
          setMessages((msgRes.data.messages as ChatMessage[]).reverse());
          if (statusRes?.data) setIsOnline(statusRes.data.is_online);
        }
      } catch (e) {
        console.error('[dm] init load failed:', e);
      }
    }

    void init();
    return () => {
      cancelled = true;
      if (pollRef.current)      clearInterval(pollRef.current);
      if (timeoutRef.current)   clearTimeout(timeoutRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [friendId]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  }

  function startCountdown(seconds: number) {
    if (seconds <= 5) return;
    setCountdown(seconds);
    if (countdownRef.current) clearInterval(countdownRef.current);
    countdownRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev === null || prev <= 1) {
          if (countdownRef.current) clearInterval(countdownRef.current);
          return null;
        }
        return prev - 1;
      });
    }, 1000);
  }

  const stopPolling = useCallback(() => {
    if (pollRef.current)      { clearInterval(pollRef.current);  pollRef.current    = null; }
    if (timeoutRef.current)   { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
    pendingMsgRef.current = null;
    setCountdown(null);
  }, []);

  async function sendMessage() {
    const text  = inputText.trim();
    const token = tokenRef.current;
    if (!text || !token || sending) return;

    setInputText('');
    setReplyTimedOut(false);

    // Refocus input after clearing
    if (isWeb) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      inputRef.current?.focus();
    }

    const optimistic: ChatMessage = {
      id:          `opt_${Date.now()}`,
      sender_id:   'child',
      sender_type: 'child',
      content:     text,
      created_at:  new Date().toISOString(),
    };
    setMessages((prev) => [optimistic, ...prev]);
    setSending(true);
    setShowTyping(true);

    try {
      const res = await childMessages.send(token, friendId, text);
      const data = res.data as {
        childMessage: ChatMessage;
        friendReply: ChatMessage | null;
        status?: string;
        estimatedReplySeconds?: number;
        mood: string;
      };

      setMessages((prev) => {
        const withoutOpt = prev.filter((m) => m.id !== optimistic.id);
        return [data.childMessage, ...withoutOpt];
      });

      if (data.status === 'pending') {
        pendingMsgRef.current = data.childMessage;

        if (data.estimatedReplySeconds) {
          startCountdown(data.estimatedReplySeconds);
        }

        pollRef.current = setInterval(async () => {
          try {
            const pollRes = await childMessages.getLatest(token, friendId);
            const latest = pollRes.data.message as ChatMessage | null;
            if (
              latest &&
              latest.sender_type === 'ai' &&
              pendingMsgRef.current &&
              new Date(latest.created_at) > new Date(pendingMsgRef.current.created_at)
            ) {
              stopPolling();
              setShowTyping(false);
              setMessages((prev) => [latest, ...prev]);

              // Notify if not focused
              if (!isFocusedRef.current) {
                showNotification({
                  friendId,
                  friendName,
                  friendEmoji,
                  message: latest.content,
                });
              }

              // Web notification if tab hidden
              sendWebNotification(
                `${friendName} replied!`,
                latest.content.slice(0, 60),
                () => { window.focus(); },
              );
            }
          } catch {
            // silent — keep polling
          }
        }, 3000);

        // 2-minute timeout
        timeoutRef.current = setTimeout(() => {
          stopPolling();
          setShowTyping(false);
          setReplyTimedOut(true);
        }, 120_000);

      } else if (data.friendReply) {
        setMessages((prev) => [data.friendReply!, ...prev]);
        setShowTyping(false);
      }
    } catch (e) {
      console.error('[dm] send error:', e);
      setInputText(text);
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      setShowTyping(false);
      showToast('Message failed — tap send to try again');
    } finally {
      setSending(false);
    }
  }

  const renderItem = ({ item }: { item: DisplayItem }) => {
    if (item.sender_type === 'typing') return <TypingBubble countdown={countdown} />;
    const msg = item as ChatMessage;
    return (
      <MessageBubble
        message={msg}
        friendName={friendName}
      />
    );
  };

  return (
    <SafeAreaView style={s.screen}>
      {/* ── Top bar ── */}
      <View style={s.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Text style={s.backArrow}>←</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => router.push(`/friend/${friendId}` as never)}
          style={{ flexDirection: 'row', flex: 1, alignItems: 'center' }}
        >
          <View style={[s.friendAvatar, { backgroundColor: friendBg }]}>
            <Text style={{ fontSize: 22 }}>{friendEmoji}</Text>
          </View>
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={s.friendNameText}>{friendName}</Text>
            {isOnline === true
              ? <Text style={s.onlineText}>● Online now</Text>
              : <Text style={s.offlineText}>🕐 Usually replies in a few minutes</Text>
            }
          </View>
        </TouchableOpacity>

        <AudioPlayer
          text={`Hi, I'm ${friendName}!`}
          characterId={friendName}
          size="md"
        />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <FlatList
          ref={listRef}
          data={displayData}
          keyExtractor={(item) => item.id}
          inverted={!isWeb}
          renderItem={renderItem}
          contentContainerStyle={[
            s.messagesList,
            isWeb && { flexGrow: 1, justifyContent: 'flex-end' },
          ]}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={<GreetingCard name={friendName} emoji={friendEmoji} bg={friendBg} />}
        />

        {toast !== '' && (
          <View style={s.toast}>
            <Text style={s.toastText}>{toast}</Text>
          </View>
        )}

        {replyTimedOut && (
          <View style={s.pendingBanner}>
            <Text style={s.pendingBannerText}>Reply on its way... check back soon!</Text>
          </View>
        )}

        <View style={s.inputBar}>
          <TouchableOpacity style={s.voiceBtn} disabled>
            <Text style={{ fontSize: 18 }}>🎤</Text>
          </TouchableOpacity>

          <TextInput
            ref={inputRef}
            style={s.textInput}
            placeholder={t('dm.inputPlaceholder', { name: friendName })}
            placeholderTextColor="#B4B2A9"
            value={inputText}
            onChangeText={setInputText}
            multiline={false}
            returnKeyType="send"
            onSubmitEditing={() => void sendMessage()}
            editable={!sending}
          />

          <TouchableOpacity
            style={[s.sendBtn, (!inputText.trim() || sending) && { backgroundColor: '#D0CEEE' }]}
            onPress={() => void sendMessage()}
            disabled={!inputText.trim() || sending}
          >
            <Text style={s.sendArrow}>➤</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function MessageBubble({ message, friendName }: { message: ChatMessage; friendName: string }) {
  const isChild = message.sender_type === 'child';
  return (
    <View style={[s.bubbleRow, isChild ? s.bubbleRowRight : s.bubbleRowLeft]}>
      <View style={[isChild ? s.bubbleChild : s.bubbleAI, isChild ? undefined : s.bubbleAIRow]}>
        <Text style={isChild ? s.bubbleTextChild : s.bubbleTextAI}>
          {message.content}
        </Text>
        {!isChild && (
          <View style={s.bubbleAudioBtn}>
            <AudioPlayer
              text={message.content}
              characterId={friendName}
              messageId={message.id}
              size="sm"
            />
          </View>
        )}
      </View>
      <Text style={[s.timestamp, isChild ? s.tsRight : s.tsLeft]}>
        {formatTime(message.created_at)}
      </Text>
    </View>
  );
}

function TypingDot({ delay }: { delay: number }) {
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(opacity, { toValue: 1,   duration: 400, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 400, useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, []);

  return <Animated.View style={[s.typingDot, { opacity }]} />;
}

function TypingBubble({ countdown }: { countdown: number | null }) {
  return (
    <View style={s.bubbleRowLeft}>
      <View style={[s.bubbleAI, s.typingBubble]}>
        <TypingDot delay={0} />
        <TypingDot delay={200} />
        <TypingDot delay={400} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <Text style={s.typingText}>typing...</Text>
        {countdown !== null && countdown > 5 && (
          <Text style={s.countdownText}>~{countdown}s</Text>
        )}
      </View>
    </View>
  );
}

function GreetingCard({ name, emoji, bg }: { name: string; emoji: string; bg: string }) {
  return (
    <View style={s.greeting}>
      <View style={[s.greetingAvatar, { backgroundColor: bg }]}>
        <Text style={{ fontSize: 40 }}>{emoji}</Text>
      </View>
      <Text style={s.greetingText}>
        Say hello to {name}!{'\n'}They'd love to hear from you.
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  screen:    { flex: 1, backgroundColor: Colors.bg },

  topBar:    { flexDirection: 'row', alignItems: 'center',
               paddingHorizontal: 16, paddingVertical: 12,
               backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F0EFF8' },
  backBtn:   { marginRight: 8, padding: 4 },
  backArrow: { fontSize: 20, color: '#888780' },
  friendAvatar: { width: 40, height: 40, borderRadius: 20,
                  alignItems: 'center', justifyContent: 'center' },
  friendNameText: { fontSize: 16, fontWeight: '700', color: '#2C2C2A' },
  onlineText:    { fontSize: 12, color: '#5DCAA5', fontWeight: '600', marginTop: 1 },
  offlineText:   { fontSize: 12, color: '#B4B2A9', marginTop: 1 },

  messagesList: { paddingHorizontal: 16, paddingVertical: 12 },

  bubbleRow:      { marginBottom: 14, maxWidth: '80%' },
  bubbleRowRight: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  bubbleRowLeft:  { alignSelf: 'flex-start', alignItems: 'flex-start' },

  bubbleChild: {
    backgroundColor: Colors.purple,
    paddingHorizontal: 16, paddingVertical: 12,
    borderRadius: 18, borderBottomRightRadius: 4,
  },
  bubbleAI: {
    backgroundColor: '#fff',
    paddingHorizontal: 16, paddingVertical: 12,
    borderRadius: 18, borderBottomLeftRadius: 4,
    borderWidth: 1, borderColor: '#E8E6FF',
  },
  bubbleAIRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  bubbleAudioBtn: {
    marginBottom: 2,
  },
  bubbleTextChild: { fontSize: 14, color: '#fff', lineHeight: 20, flex: 1 },
  bubbleTextAI:    { fontSize: 14, color: '#2C2C2A', lineHeight: 20, flex: 1 },

  timestamp: { fontSize: 10, color: '#B4B2A9', marginTop: 3 },
  tsRight:   { alignSelf: 'flex-end' },
  tsLeft:    { alignSelf: 'flex-start' },

  typingBubble: { flexDirection: 'row', alignItems: 'center',
                  paddingHorizontal: 14, paddingVertical: 14 },
  typingDot:    { width: 8, height: 8, borderRadius: 4,
                  backgroundColor: '#B4B2A9', marginHorizontal: 3 },

  toast:     { position: 'absolute', bottom: 90, left: 24, right: 24,
               backgroundColor: Colors.red, borderRadius: 12,
               padding: 12, alignItems: 'center' },
  toastText: { color: '#fff', fontSize: 13, fontWeight: '600' },

  inputBar:   { flexDirection: 'row', alignItems: 'center',
                paddingHorizontal: 14, paddingTop: 10, paddingBottom: 22,
                backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#F0EFF8',
                gap: 10 },
  voiceBtn:   { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.orange + '33',
                alignItems: 'center', justifyContent: 'center' },
  textInput:  { flex: 1, backgroundColor: Colors.bg, borderWidth: 1, borderColor: '#E8E6FF',
                borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10,
                fontSize: 14, color: '#2C2C2A' },
  sendBtn:    { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.purple,
                alignItems: 'center', justifyContent: 'center' },
  sendArrow:  { color: '#fff', fontSize: 16, marginLeft: 2 },

  greeting:      { alignItems: 'center', justifyContent: 'center',
                   paddingVertical: 60, paddingHorizontal: 32 },
  greetingAvatar:{ width: 80, height: 80, borderRadius: 40,
                   alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  greetingText:  { fontSize: 15, color: '#888780', textAlign: 'center', lineHeight: 22 },

  typingText:    { fontSize: 11, color: '#B4B2A9', fontStyle: 'italic', marginTop: 4, marginLeft: 4 },
  countdownText: { fontSize: 10, color: '#C8C6E8', marginTop: 4 },

  pendingBanner: { position: 'absolute', bottom: 90, left: 24, right: 24,
                   backgroundColor: '#F0EFF8', borderRadius: 12,
                   padding: 12, alignItems: 'center' },
  pendingBannerText: { color: '#888780', fontSize: 13 },
});
