import {
  View, Text, SafeAreaView, FlatList, TextInput,
  TouchableOpacity, KeyboardAvoidingView, Platform,
  Animated, StyleSheet, Image,
} from 'react-native';
import Markdown from 'react-native-markdown-display';
import { useState, useEffect, useRef } from 'react';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { mascotApi, mascotAvatars, audioApi } from '@/services/api';
import { Audio } from 'expo-av';
import { useLanguageStore } from '@/store/languageStore';
import { Colors } from '@/constants/theme';
import AudioPlayer from '@/components/AudioPlayer';

interface MascotMessage {
  id: string;
  sender_type: 'child' | 'mascot';
  content: string;
  created_at: string;
}

type DisplayItem = MascotMessage | { id: string; sender_type: 'typing' };

const MASCOT_NAMES: Record<string, string> = {
  miga: 'Miga', pixel: 'Pixel', finn: 'Finn', sage: 'Sage',
};
const MASCOT_EMOJI: Record<string, string> = {
  miga: '🐉', pixel: '🤖', finn: '🦊', sage: '🦉',
};

function formatTime(iso: string, language: string): string {
  const locale = language === 'fr' ? 'fr-FR' : 'en-US';
  return new Date(iso).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: false });
}

export default function MascotDMScreen() {
  const language   = useLanguageStore((s) => s.language);
  const [messages, setMessages]             = useState<MascotMessage[]>([]);
  const [inputText, setInputText]           = useState('');
  const [sending, setSending]               = useState(false);
  const [showTyping, setShowTyping]         = useState(false);
  const [childToken, setChildToken]         = useState<string | null>(null);
  const [mascotId, setMascotId]             = useState('miga');
  const [mascotAvatarUrl, setMascotAvatarUrl] = useState<string | null>(null);
  const [feedbackBanner, setFeedbackBanner] = useState(false);
  const [isRecording, setIsRecording]       = useState(false);

  const listRef      = useRef<FlatList<DisplayItem>>(null);
  const inputRef     = useRef<TextInput>(null);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const mountedRef   = useRef(true);

  const isWeb      = Platform.OS === 'web';
  const isIPad     = Platform.OS === 'ios' && Platform.isPad;
  const useInverted = !isWeb && !isIPad;

  useEffect(() => {
    mountedRef.current = true;

    async function init() {
      const tok        = await AsyncStorage.getItem('childToken');
      const profileRaw = await AsyncStorage.getItem('childProfile');
      if (tok && mountedRef.current) setChildToken(tok);

      let id = 'miga';
      if (profileRaw) {
        try { id = (JSON.parse(profileRaw).mascotId || 'miga').toLowerCase(); } catch {}
      }
      if (mountedRef.current) setMascotId(id);

      try {
        const res = await mascotAvatars.get();
        const url = res.data.mascots[id];
        if (url && mountedRef.current) setMascotAvatarUrl(url);
      } catch {}

      // Load persisted messages; only add greeting if history is empty
      const storageKey = `mascotDM_${id}`;
      let stored: MascotMessage[] = [];
      try {
        const raw = await AsyncStorage.getItem(storageKey);
        if (raw) stored = JSON.parse(raw) as MascotMessage[];
      } catch {}

      if (stored.length === 0) {
        const name = MASCOT_NAMES[id] ?? 'Miga';
        const greeting: MascotMessage = {
          id:          'greeting',
          sender_type: 'mascot',
          content:     language === 'fr'
            ? `Salut ! Je suis ${name}, ton guide sur Migo ! Tu peux me poser des questions sur l'app, me signaler un problème, ou juste dire bonjour ! 🌟`
            : `Hi! I'm ${name}, your Migo guide! Ask me anything about the app, report a problem, or just say hello! 🌟`,
          created_at:  new Date().toISOString(),
        };
        stored = [greeting];
        AsyncStorage.setItem(storageKey, JSON.stringify(stored)).catch(() => {});
      }

      if (mountedRef.current) setMessages(stored);
    }

    void init();
    return () => { mountedRef.current = false; };
  }, [language]);

  async function handleVoiceMemo() {
    if (!childToken) return;
    if (isRecording) {
      setIsRecording(false);
      const rec = recordingRef.current;
      if (!rec) return;
      try {
        await rec.stopAndUnloadAsync();
        const uri = rec.getURI();
        recordingRef.current = null;
        await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
        if (!uri) return;
        const base64 = await new Promise<string>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.responseType = 'arraybuffer';
          xhr.onload = () => {
            const bytes = new Uint8Array(xhr.response as ArrayBuffer);
            let binary = '';
            for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
            resolve(btoa(binary));
          };
          xhr.onerror = reject;
          xhr.open('GET', uri);
          xhr.send();
        });
        const result = await audioApi.transcribe(childToken, { audioBase64: base64, mimeType: 'audio/m4a', language });
        const transcript = result.data.transcript?.trim();
        if (transcript && mountedRef.current) setInputText(transcript);
      } catch (err) {
        console.error('[mascot-dm] transcription failed:', err);
      }
    } else {
      try {
        const { granted } = await Audio.requestPermissionsAsync();
        if (!granted) return;
        await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
        const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
        recordingRef.current = recording;
        setIsRecording(true);
      } catch (err) {
        console.error('[mascot-dm] recording start failed:', err);
      }
    }
  }

  async function sendMessage(overrideText?: string) {
    const text = (overrideText ?? inputText).trim();
    if (!text || !childToken || sending) return;
    if (!overrideText) setInputText('');

    const optimistic: MascotMessage = {
      id:          `opt_${Date.now()}`,
      sender_type: 'child',
      content:     text,
      created_at:  new Date().toISOString(),
    };

    setMessages((prev) => [optimistic, ...prev]);
    setSending(true);
    setShowTyping(true);
    setFeedbackBanner(false);

    try {
      const res  = await mascotApi.sendMessage(childToken, text);
      const { reply, mode } = res.data;

      const mascotMsg: MascotMessage = {
        id:          `mascot_${Date.now()}`,
        sender_type: 'mascot',
        content:     reply,
        created_at:  new Date().toISOString(),
      };

      if (mountedRef.current) {
        setMessages((prev) => {
          const childMsg: MascotMessage = { ...optimistic, id: `child_${Date.now()}` };
          const withoutOpt = prev.filter(m => m.id !== optimistic.id);
          const next = [mascotMsg, childMsg, ...withoutOpt];
          AsyncStorage.setItem(`mascotDM_${mascotId}`, JSON.stringify(next)).catch(() => {});
          return next;
        });
        setShowTyping(false);
        if (mode === 'feedback') setFeedbackBanner(true);
      }
    } catch (err) {
      console.error('[mascot-dm] send error:', err);
      if (mountedRef.current) {
        setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
        setShowTyping(false);
      }
    } finally {
      if (mountedRef.current) setSending(false);
    }
  }

  const mascotName  = MASCOT_NAMES[mascotId] ?? 'Miga';
  const mascotEmoji = MASCOT_EMOJI[mascotId] ?? '🐉';

  const baseData: DisplayItem[] = showTyping
    ? [{ id: '__typing__', sender_type: 'typing' }, ...messages]
    : [...messages];
  const displayData = useInverted ? baseData : [...baseData].reverse();

  return (
    <SafeAreaView style={s.screen}>
      {/* Header */}
      <View style={s.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Text style={s.backArrow}>←</Text>
        </TouchableOpacity>
        <View style={s.mascotAvatarWrap}>
          {mascotAvatarUrl
            ? <Image source={{ uri: mascotAvatarUrl }} style={{ width: 44, height: 44, borderRadius: 22 }} />
            : <Text style={{ fontSize: 24 }}>{mascotEmoji}</Text>
          }
        </View>
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={s.mascotName}>{mascotName}</Text>
          <Text style={s.mascotSubtitle}>{language === 'fr' ? 'Ton guide' : 'Your guide'}</Text>
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <FlatList
          ref={listRef}
          data={displayData}
          keyExtractor={(item) => item.id}
          inverted={useInverted}
          renderItem={({ item }) => {
            if (item.sender_type === 'typing') return <TypingBubble />;
            return <MessageBubble message={item as MascotMessage} mascotName={mascotName} language={language} />;
          }}
          contentContainerStyle={[s.messagesList, { flexGrow: 1 }]}
          showsVerticalScrollIndicator={false}
        />

        {feedbackBanner && (
          <View style={s.feedbackBanner}>
            <Text style={s.feedbackBannerText}>
              {'✉️ '}{language === 'fr' ? 'Ton message a été envoyé !' : 'Your feedback has been sent!'}
            </Text>
          </View>
        )}

        {/* Input bar */}
        <View style={s.inputBar}>
          <TouchableOpacity
            style={[s.voiceBtn, isRecording && { backgroundColor: '#FF4B4B' }]}
            onPress={() => void handleVoiceMemo()}
          >
            <Text style={{ fontSize: 18 }}>{isRecording ? '⏹️' : '🎤'}</Text>
          </TouchableOpacity>
          <TextInput
            ref={inputRef}
            style={s.textInput}
            placeholder={language === 'fr' ? `Écris à ${mascotName}...` : `Message ${mascotName}...`}
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

// ── Message bubble ─────────────────────────────────────────────────────────────

function MessageBubble({ message, mascotName, language }: { message: MascotMessage; mascotName: string; language: string }) {
  const isChild = message.sender_type === 'child';

  const mdStyles = {
    body:      { color: isChild ? '#fff' : '#2C2C2A', fontSize: 14, lineHeight: 20 },
    strong:    { fontWeight: '800' as const, color: isChild ? '#fff' : '#2C2C2A' },
    em:        { fontStyle: 'italic' as const },
    paragraph: { marginTop: 0, marginBottom: 0 },
  };

  return (
    <View style={isChild ? s.bubbleRowRight : s.bubbleRowLeft}>
      <View style={isChild ? s.bubbleChildOuter : s.bubbleAIOuter}>
        <View style={[isChild ? s.bubbleChild : s.bubbleAI, !isChild ? s.bubbleAIRow : undefined]}>
          <View style={{ flexShrink: 1, minWidth: 0 }}>
            <Markdown style={mdStyles}>{message.content}</Markdown>
          </View>
          {!isChild && (
            <View style={s.bubbleAudioBtn}>
              <AudioPlayer text={message.content} characterId={mascotName} messageId={message.id} size="sm" />
            </View>
          )}
        </View>
        <Text style={[s.timestamp, isChild ? s.tsRight : s.tsLeft]}>
          {formatTime(message.created_at, language)}
        </Text>
      </View>
    </View>
  );
}

// ── Typing indicator ───────────────────────────────────────────────────────────

function TypingDot({ delay }: { delay: number }) {
  const opacity = useRef(new Animated.Value(0.3)).current;
  useEffect(() => {
    const anim = Animated.loop(Animated.sequence([
      Animated.delay(delay),
      Animated.timing(opacity, { toValue: 1,   duration: 400, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0.3, duration: 400, useNativeDriver: true }),
    ]));
    anim.start();
    return () => anim.stop();
  }, []);
  return <Animated.View style={[s.typingDot, { opacity }]} />;
}

function TypingBubble() {
  return (
    <View style={s.bubbleRowLeft}>
      <View style={s.bubbleAIOuter}>
        <View style={[s.bubbleAI, s.typingBubble]}>
          <TypingDot delay={0} />
          <TypingDot delay={200} />
          <TypingDot delay={400} />
        </View>
      </View>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.bg },

  topBar:          { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12,
                     backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F0EFF8' },
  backBtn:         { marginRight: 8, padding: 4 },
  backArrow:       { fontSize: 20, color: '#888780' },
  mascotAvatarWrap:{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#F0EEFF',
                     alignItems: 'center', justifyContent: 'center' },
  mascotName:      { fontSize: 16, fontWeight: '700', color: '#2C2C2A' },
  mascotSubtitle:  { fontSize: 12, color: Colors.purple, fontWeight: '600', marginTop: 1 },

  messagesList: { paddingVertical: 8 },

  bubbleRowRight: { flexDirection: 'row', justifyContent: 'flex-end',  paddingHorizontal: 14, paddingVertical: 4, width: '100%', marginBottom: 10 },
  bubbleRowLeft:  { flexDirection: 'row', justifyContent: 'flex-start', paddingHorizontal: 14, paddingVertical: 4, width: '100%', marginBottom: 10 },

  bubbleChildOuter: { alignSelf: 'flex-end',  flexShrink: 1, maxWidth: '80%', minWidth: 0, alignItems: 'flex-end' },
  bubbleAIOuter:    { alignSelf: 'flex-start', flexShrink: 1, maxWidth: '80%', minWidth: 0, alignItems: 'flex-start' },

  bubbleChild: { backgroundColor: Colors.purple, paddingHorizontal: 16, paddingVertical: 12,
                 borderRadius: 18, borderBottomRightRadius: 4 },
  bubbleAI:    { backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 12,
                 borderRadius: 18, borderBottomLeftRadius: 4, borderWidth: 1, borderColor: '#E8E6FF' },
  bubbleAIRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  bubbleAudioBtn: { marginBottom: 2 },

  timestamp: { fontSize: 10, color: '#B4B2A9', marginTop: 3 },
  tsRight:   { alignSelf: 'flex-end' },
  tsLeft:    { alignSelf: 'flex-start' },

  typingBubble: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 14 },
  typingDot:    { width: 8, height: 8, borderRadius: 4, backgroundColor: '#B4B2A9', marginHorizontal: 3 },

  feedbackBanner:     { marginHorizontal: 14, marginBottom: 8, backgroundColor: '#EEF4FF',
                        borderRadius: 12, padding: 12, alignItems: 'center',
                        borderWidth: 1, borderColor: '#C8D8FF' },
  feedbackBannerText: { fontSize: 13, color: Colors.purple, fontWeight: '600' },

  inputBar:  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingTop: 10,
               paddingBottom: 22, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#F0EFF8', gap: 8 },
  voiceBtn:  { width: 38, height: 38, borderRadius: 19, backgroundColor: Colors.orange + '33',
               alignItems: 'center', justifyContent: 'center' },
  textInput: { flex: 1, backgroundColor: Colors.bg, borderWidth: 1, borderColor: '#E8E6FF',
               borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: '#2C2C2A' },
  sendBtn:   { width: 38, height: 38, borderRadius: 19, backgroundColor: Colors.purple,
               alignItems: 'center', justifyContent: 'center' },
  sendArrow: { color: '#fff', fontSize: 16, marginLeft: 2 },
});
