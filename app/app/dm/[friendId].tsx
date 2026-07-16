import {
  View, Text, SafeAreaView, FlatList, TextInput,
  TouchableOpacity, KeyboardAvoidingView, Platform,
  Animated, StyleSheet, Modal, Image, ScrollView,
} from 'react-native';
import Markdown from 'react-native-markdown-display';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useLocalSearchParams, router, useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { useTranslation } from 'react-i18next';
import { childMessages, childFriends, childAuth, gameApi, sophieApi, audioApi } from '@/services/api';
import { Audio } from 'expo-av';
import { useLanguageStore } from '@/store/languageStore';
import { Colors } from '@/constants/theme';
import AudioPlayer from '@/components/AudioPlayer';
import { useNotificationStore } from '@/store/notificationStore';
import { sendWebNotification } from '@/utils/webNotifications';
import { dedupeDictatedText } from '@/utils/dedupeDictatedText';
import { getDisplayName } from '@/utils/displayName';
import { resolveAvatarUrl } from '@/services/api';

interface ChatMessage {
  id: string;
  sender_id: string;
  sender_type: 'child' | 'ai';
  content: string;
  created_at: string;
  conversation_id?: string;
  localImageUri?: string;
  message_type?: string;
  game_state?: Record<string, unknown>;
  image_url?: string | null;
}

interface ActiveGame {
  type: 'rps' | 'tictactoe' | 'story';
  board?: string[];
  storyHistory?: string[];
  round?: number;
}

type DisplayItem = ChatMessage | { id: string; sender_type: 'typing' };

const GRADES = ['CP', 'CE1', 'CE2', 'CM1', 'CM2', '6ème', '5ème', '4ème', '3ème'];

function firstEmoji(str: string | null | undefined): string {
  if (!str) return '🌟';
  return [...str][0] ?? '🌟';
}

function formatTime(iso: string, language: string): string {
  const locale = language === 'fr' ? 'fr-FR' : 'en-US';
  return new Date(iso).toLocaleTimeString(locale, {
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

function detectsGradeQuestion(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    text.includes('CP, CE1') ||
    lower.includes('quelle classe') ||
    lower.includes('what grade') ||
    lower.includes('which grade') ||
    lower.includes('en quelle')
  );
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
  const [retryContent, setRetryContent]       = useState<{ text: string; imageB64?: string; imageType?: string } | null>(null);
  const [isTeacher, setIsTeacher]             = useState(false);
  const [isJules, setIsJules]                 = useState(false);
  const [isSophie, setIsSophie]               = useState(false);
  const [quizLoading, setQuizLoading]         = useState(false);
  const [selectedImage, setSelectedImage]     = useState<{ base64: string; uri: string } | null>(null);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [showGradeChips, setShowGradeChips]   = useState(false);
  const [showGameModal, setShowGameModal]     = useState(false);
  const [activeGame, setActiveGame]           = useState<ActiveGame | null>(null);
  const [gameLoading, setGameLoading]         = useState(false);
  const [lastMessageHadPhoto, setLastMessageHadPhoto] = useState(false);
  const [isRecording, setIsRecording]                 = useState(false);
  const [friendAvatarUrl, setFriendAvatarUrl]         = useState<string | null>(null);

  const listRef        = useRef<FlatList<DisplayItem>>(null);
  const inputRef       = useRef<TextInput>(null);
  const tokenRef       = useRef<string | null>(null);
  const pollRef        = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingMsgRef  = useRef<ChatMessage | null>(null);
  const isFocusedRef   = useRef(true);
  const mountedRef     = useRef(true);
  const gradeChipsAnim = useRef(new Animated.Value(60)).current;
  const recordingRef   = useRef<Audio.Recording | null>(null);

  const showNotification = useNotificationStore((s) => s.showNotification);
  const language = useLanguageStore((s) => s.language);
  const isWeb   = Platform.OS === 'web';
  const isIPad  = Platform.OS === 'ios' && Platform.isPad;
  const useInverted = !isWeb && !isIPad;

  useFocusEffect(
    useCallback(() => {
      isFocusedRef.current = true;
      return () => { isFocusedRef.current = false; };
    }, []),
  );

  const baseData: DisplayItem[] = showTyping
    ? [{ id: '__typing__', sender_type: 'typing' }, ...messages]
    : [...messages];
  const displayData = useInverted ? baseData : [...baseData].reverse();

  useEffect(() => {
    if (useInverted) return;
    const t = setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 50);
    return () => clearTimeout(t);
  }, [messages, showTyping]);

  function showGradeChipsAnimated() {
    setShowGradeChips(true);
    gradeChipsAnim.setValue(60);
    Animated.spring(gradeChipsAnim, { toValue: 0, useNativeDriver: true, bounciness: 8 }).start();
  }

  function hideGradeChipsAnimated(onDone?: () => void) {
    Animated.timing(gradeChipsAnim, { toValue: 60, duration: 200, useNativeDriver: true }).start(() => {
      setShowGradeChips(false);
      onDone?.();
    });
  }

  useEffect(() => {
    let cancelled = false;
    mountedRef.current = true;

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

        const friend    = friendRes.data.friend as Record<string, unknown>;
        const name      = String(friend.name ?? 'Friend');
        const emoji     = [...(String(friend.cover_emojis || '🌟'))][0] ?? '🌟';
        const teacher   = Boolean(friend.is_teacher);
        const avatarUrl = resolveAvatarUrl(friend.avatar_url as string | null | undefined) ?? null;

        if (!cancelled) {
          setFriendName(getDisplayName(name, language === 'fr'));
          setFriendEmoji(emoji);
          setFriendBg(FRIEND_BG[name] ?? '#EEEDFE');
          setIsTeacher(teacher);
          setIsJules(Boolean((friend as Record<string, unknown>).is_jules));
          setIsSophie(Boolean((friend as Record<string, unknown>).is_sophie));
          setFriendAvatarUrl(avatarUrl);

          const loadedMsgs = (msgRes.data.messages as ChatMessage[]).reverse();
          setMessages(loadedMsgs);

          if (statusRes?.data) setIsOnline(statusRes.data.is_online);

          if (teacher) {
            const noChildReplies = !loadedMsgs.some((m) => m.sender_type === 'child');
            const firstAI = loadedMsgs.find((m) => m.sender_type === 'ai');
            if (noChildReplies && firstAI && detectsGradeQuestion(firstAI.content)) {
              showGradeChipsAnimated();
            }
          }
        }
      } catch (e) {
        console.error('[dm] init load failed:', e);
      }
    }

    void init();
    return () => {
      cancelled = true;
      mountedRef.current = false;
      // pollRef and timeoutRef are intentionally NOT cleared here: the background poll
      // must survive navigation-back (unmount) so it can still call showNotification.
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [friendId]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  }

  const stopPolling = useCallback(() => {
    if (pollRef.current)      { clearInterval(pollRef.current);  pollRef.current    = null; }
    if (timeoutRef.current)   { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
    pendingMsgRef.current = null;
  }, []);

  // ── Voice recording / transcription ─────────────────────────────────────────

  async function handleVoiceMemo() {
    if (isRecording) {
      setIsRecording(false);
      const rec = recordingRef.current;
      if (!rec) return;
      try {
        await rec.stopAndUnloadAsync();
        const uri = rec.getURI();
        recordingRef.current = null;
        await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
        if (!uri || !childToken) return;
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
        const result = await audioApi.transcribe(childToken, {
          audioBase64: base64,
          mimeType: 'audio/m4a',
          language,
        });
        const transcript = result.data.transcript?.trim();
        if (transcript) {
          setInputText(transcript);
          void sendMessage(transcript);
        }
      } catch (err) {
        console.error('[voice] transcription failed:', err);
        showToast(t('dm.voiceError'));
      }
    } else {
      try {
        const { granted } = await Audio.requestPermissionsAsync();
        if (!granted) { showToast(t('dm.micPermissionDenied')); return; }
        await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
        const { recording } = await Audio.Recording.createAsync(
          Audio.RecordingOptionsPresets.HIGH_QUALITY,
        );
        recordingRef.current = recording;
        setIsRecording(true);
      } catch (err) {
        console.error('[voice] recording start failed:', err);
      }
    }
  }

  // ── Camera / image picker ─────────────────────────────────────────────────────

  async function compressImage(uri: string): Promise<{ base64: string; uri: string }> {
    const manipResult = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 800 } }],
      { compress: 0.4, format: ImageManipulator.SaveFormat.JPEG, base64: true },
    );
    return { base64: manipResult.base64!, uri: manipResult.uri };
  }

  async function handleCamera() {
    if (Platform.OS !== 'web') {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        await handleLibrary();
        return;
      }
    }
    const launchFn = Platform.OS === 'web' ? ImagePicker.launchImageLibraryAsync : ImagePicker.launchCameraAsync;
    const result = await launchFn({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [4, 3], quality: 0.3, base64: false });
    if (!result.canceled && result.assets[0]) {
      const compressed = await compressImage(result.assets[0].uri);
      setSelectedImage(compressed);
      const shownKey = isTeacher ? 'luna_photo_privacy_shown' : 'jules_photo_privacy_shown';
      const shown = await AsyncStorage.getItem(shownKey);
      if (!shown) setShowPrivacyModal(true);
    }
  }

  async function handleLibrary() {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, quality: 0.3, base64: false });
    if (!result.canceled && result.assets[0]) {
      const compressed = await compressImage(result.assets[0].uri);
      setSelectedImage(compressed);
      const shownKey = isTeacher ? 'luna_photo_privacy_shown' : 'jules_photo_privacy_shown';
      const shown = await AsyncStorage.getItem(shownKey);
      if (!shown) setShowPrivacyModal(true);
    }
  }

  async function dismissPrivacyModal() {
    const privacyKey = isTeacher ? 'luna_photo_privacy_shown' : 'jules_photo_privacy_shown';
    await AsyncStorage.setItem(privacyKey, '1');
    setShowPrivacyModal(false);
  }

  // ── Grade chips ───────────────────────────────────────────────────────────────

  function handleGradeSelect(grade: string) {
    hideGradeChipsAnimated();
    void sendMessage(grade);
  }

  // ── Game functions ────────────────────────────────────────────────────────────

  async function launchGame(type: 'rps' | 'tictactoe' | 'story') {
    const token = tokenRef.current;
    if (!token || gameLoading) return;
    setShowGameModal(false);
    setGameLoading(true);
    try {
      const res  = await gameApi.start(token, friendId, type);
      const data = res.data;
      const gs   = data.gameState as Record<string, unknown>;
      setActiveGame({
        type,
        board:        type === 'tictactoe' ? (gs.board as string[]) : undefined,
        storyHistory: type === 'story'     ? (gs.storyHistory as string[]) : undefined,
        round:        type === 'story'     ? (gs.round as number) : undefined,
      });
      setMessages((prev) => [data.message as ChatMessage, ...prev]);
    } catch {
      showToast('Could not start game — try again');
    } finally {
      setGameLoading(false);
    }
  }

  async function startSophieQuiz() {
    const token = tokenRef.current;
    if (!token || quizLoading) return;
    setQuizLoading(true);
    try {
      const res = await sophieApi.startQuiz(token, friendId);
      setMessages((prev) => [res.data.message as ChatMessage, ...prev]);
    } catch (err) {
      const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      showToast(message ?? 'Could not start quiz — try again');
    } finally {
      setQuizLoading(false);
    }
  }

  async function handleRPSMove(choice: string) {
    const token = tokenRef.current;
    if (!token || !activeGame || gameLoading) return;
    setGameLoading(true);
    try {
      const res  = await gameApi.move(token, friendId, 'rps', choice, activeGame as unknown as Record<string, unknown>);
      const data = res.data;
      setMessages((prev) => [data.message as ChatMessage, ...prev]);
      if (data.gameOver) setActiveGame(null);
    } catch {
      showToast('Game error — try again');
    } finally {
      setGameLoading(false);
    }
  }

  async function handleTTTMove(square: number) {
    const token = tokenRef.current;
    if (!token || !activeGame || gameLoading) return;
    if (activeGame.board?.[square] !== '') return;
    setGameLoading(true);
    // Optimistically mark child's X
    const newBoard = [...(activeGame.board ?? Array(9).fill(''))];
    newBoard[square] = 'X';
    setActiveGame((prev) => prev ? { ...prev, board: newBoard } : prev);
    try {
      const res  = await gameApi.move(token, friendId, 'tictactoe', square, { type: 'tictactoe', board: newBoard } as Record<string, unknown>);
      const data = res.data;
      const newGs = data.gameState as { board: string[] };
      setActiveGame((prev) => prev && !data.gameOver ? { ...prev, board: newGs.board } : null);
      setMessages((prev) => [data.message as ChatMessage, ...prev]);
    } catch {
      setActiveGame((prev) => prev ? { ...prev, board: activeGame.board } : prev);
      showToast('Game error — try again');
    } finally {
      setGameLoading(false);
    }
  }

  async function handleStoryContribution(text: string) {
    const token = tokenRef.current;
    if (!token || !activeGame || gameLoading) return;
    setGameLoading(true);
    const history = [...(activeGame.storyHistory ?? []), text];
    try {
      const res  = await gameApi.move(token, friendId, 'story', text, { type: 'story', storyHistory: history, round: activeGame.round ?? 1 } as Record<string, unknown>, text);
      const data = res.data;
      const newGs = data.gameState as { storyHistory: string[]; round: number };
      setMessages((prev) => [data.message as ChatMessage, ...prev]);
      if (data.gameOver) setActiveGame(null);
      else setActiveGame((prev) => prev ? { ...prev, storyHistory: newGs.storyHistory, round: newGs.round } : prev);
    } catch {
      showToast('Game error — try again');
    } finally {
      setGameLoading(false);
    }
  }

  // ── Send message ──────────────────────────────────────────────────────────────

  async function sendMessage(overrideText?: string) {
    const text  = (overrideText ?? inputText).trim();
    const token = tokenRef.current;
    if (!text || !token || sending) return;

    // Story game intercept
    if (activeGame?.type === 'story' && !overrideText) {
      if (!overrideText) setInputText('');
      void handleStoryContribution(text);
      return;
    }

    if (!overrideText) setInputText('');
    setReplyTimedOut(false);

    if (isWeb) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      inputRef.current?.focus();
    }

    const imageUri  = selectedImage?.uri;
    const imageB64  = selectedImage?.base64;
    const imageType = selectedImage ? 'image/jpeg' : undefined;
    if (!overrideText) {
      setLastMessageHadPhoto(!!selectedImage);
      setSelectedImage(null);
    }

    const optimistic: ChatMessage = {
      id:          `opt_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      sender_id:   'child',
      sender_type: 'child',
      content:     text,
      created_at:  new Date().toISOString(),
      localImageUri: imageUri,
    };
    setMessages((prev) => [optimistic, ...prev]);
    setSending(true);
    setShowTyping(true);

    setRetryContent(null);

    try {
      const res = await childMessages.send(token, friendId, text, imageB64, imageType);
      const data = res.data as {
        childMessage: ChatMessage;
        friendReply: ChatMessage | null;
        status?: string;
        estimatedReplySeconds?: number;
        mood: string;
      };

      setMessages((prev) => {
        const withoutOpt = prev.filter((m) => m.id !== optimistic.id);
        return [{ ...data.childMessage, localImageUri: imageUri }, ...withoutOpt];
      });

      if (data.status === 'pending') {
        pendingMsgRef.current = data.childMessage;

        pollRef.current = setInterval(async () => {
          try {
            const pollRes = await childMessages.getLatest(token, friendId);
            const latest  = pollRes.data.message as ChatMessage | null;
            if (
              latest &&
              latest.sender_type === 'ai' &&
              pendingMsgRef.current &&
              new Date(latest.created_at) > new Date(pendingMsgRef.current.created_at)
            ) {
              stopPolling();
              if (mountedRef.current) {
                setShowTyping(false);
                setLastMessageHadPhoto(false);
                setMessages((prev) => [latest, ...prev]);

                if (isTeacher && detectsGradeQuestion(latest.content)) {
                  setMessages((prev) => {
                    const hasChildReply = prev.some((m) => m.sender_type === 'child' && m.id !== optimistic.id);
                    if (!hasChildReply) showGradeChipsAnimated();
                    return prev;
                  });
                }
              }

              if (!isFocusedRef.current) {
                showNotification({ friendId, friendName, friendEmoji, message: latest.content });
              }
              sendWebNotification(`${friendName} replied!`, latest.content.slice(0, 60), () => { window.focus(); });
            }
          } catch { /* silent */ }
        }, 3000);

        timeoutRef.current = setTimeout(() => {
          stopPolling();
          if (mountedRef.current) {
            setShowTyping(false);
            setReplyTimedOut(true);
          }
        }, 120_000);

      } else if (data.friendReply) {
        setMessages((prev) => [data.friendReply!, ...prev]);
        setShowTyping(false);
        setLastMessageHadPhoto(false);
      }
    } catch (e) {
      console.error('[dm] send error:', e);
      if (!overrideText) setInputText(text);
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      setShowTyping(false);
      setRetryContent({ text, imageB64: imageB64 ?? undefined, imageType: imageType ?? undefined });
    } finally {
      setSending(false);
    }
  }

  const renderItem = ({ item }: { item: DisplayItem }) => {
    if (item.sender_type === 'typing') return <TypingBubble lookingAtPhoto={lastMessageHadPhoto && (isTeacher || isJules)} />;
    return <MessageBubble message={item as ChatMessage} friendName={friendName} />;
  };

  return (
    <SafeAreaView style={s.screen}>
      {/* Privacy modal (Luna photo) */}
      <Modal visible={showPrivacyModal} transparent animationType="fade">
        <View style={s.modalOverlay}>
          <View style={s.privacyModal}>
            <Text style={s.privacyTitle}>{isTeacher ? t('luna.photoPrivacyTitle') : t('jules.photoPrivacyTitle')}</Text>
            <Text style={s.privacyText}>{isTeacher ? t('luna.photoPrivacyText') : t('jules.photoPrivacyText')}</Text>
            <TouchableOpacity style={s.privacyBtn} onPress={() => void dismissPrivacyModal()}>
              <Text style={s.privacyBtnText}>{isTeacher ? t('luna.photoPrivacyButton') : t('jules.photoPrivacyButton')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Game picker modal */}
      <Modal visible={showGameModal} transparent animationType="slide">
        <TouchableOpacity style={s.gameModalOverlay} activeOpacity={1} onPress={() => setShowGameModal(false)}>
          <View style={s.gameModalSheet}>
            <Text style={s.gameModalTitle}>{t('games.playGame')}</Text>
            {(['rps', 'tictactoe', 'story'] as const).map((type) => (
              <TouchableOpacity key={type} style={s.gameOption} onPress={() => void launchGame(type)}>
                <Text style={s.gameOptionText}>
                  {type === 'rps' ? t('games.rps') : type === 'tictactoe' ? t('games.ttt') : t('games.story')}
                </Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={s.gameCancelBtn} onPress={() => setShowGameModal(false)}>
              <Text style={s.gameCancelText}>{t('games.cancel')}</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Top bar */}
      <View style={s.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Text style={s.backArrow}>←</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => router.push(`/friend/${friendId}` as never)}
          style={{ flexDirection: 'row', flex: 1, alignItems: 'center' }}
        >
          <View style={[s.friendAvatar, { backgroundColor: friendBg }]}>
            {friendAvatarUrl
              ? <Image source={{ uri: friendAvatarUrl }} style={{ width: 44, height: 44, borderRadius: 22 }} />
              : <Text style={{ fontSize: 22 }}>{friendEmoji}</Text>
            }
          </View>
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={s.friendNameText}>{friendName}</Text>
            {isOnline === true
              ? <Text style={s.onlineText}>● {t('dm.onlineNow')}</Text>
              : <Text style={s.offlineText}>{t('dm.usuallyReplies')}</Text>
            }
          </View>
        </TouchableOpacity>
        <AudioPlayer text={language === 'fr' ? `Salut, je suis ${friendName} !` : `Hi, I'm ${friendName}!`} characterId={friendName} size="md" />
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
          renderItem={renderItem}
          contentContainerStyle={[s.messagesList, { flexGrow: 1 }]}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <GreetingCard
              name={friendName}
              emoji={friendEmoji}
              bg={friendBg}
              inverted={useInverted}
              avatarUrl={friendAvatarUrl}
            />
          }
        />

        {toast !== '' && (
          <View style={s.toast}><Text style={s.toastText}>{toast}</Text></View>
        )}

        {replyTimedOut && (
          <View style={s.pendingBanner}><Text style={s.pendingBannerText}>Reply on its way... check back soon!</Text></View>
        )}

        {retryContent && (
          <View style={s.retryBanner}>
            <Text style={s.retryBannerText}>{t('luna.retryMessage')}</Text>
            <TouchableOpacity
              style={s.retryBtn}
              onPress={() => {
                const { text: rText, imageB64: rB64, imageType: rType } = retryContent;
                setRetryContent(null);
                if (rB64) setSelectedImage({ base64: rB64, uri: '' });
                void sendMessage(rText);
              }}
            >
              <Text style={s.retryBtnText}>{t('luna.retryButton')}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Image preview (Luna only) */}
        {(isTeacher || isJules) && selectedImage && (
          <View style={s.imagePreviewBar}>
            <Image source={{ uri: selectedImage.uri }} style={s.imagePreview} />
            <Text style={s.imagePreviewLabel}>{t('luna.photoAdded')}</Text>
            <TouchableOpacity onPress={() => setSelectedImage(null)} style={s.imageRemoveBtn}>
              <Text style={s.imageRemoveText}>×</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Grade chips (Luna only) */}
        {isTeacher && showGradeChips && (
          <Animated.View style={[s.gradeChipsBar, { transform: [{ translateY: gradeChipsAnim }] }]}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.gradeChipsScroll}>
              {GRADES.map((grade) => (
                <TouchableOpacity key={grade} style={s.gradeChip} onPress={() => handleGradeSelect(grade)}>
                  <Text style={s.gradeChipText}>{grade}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Animated.View>
        )}

        {/* Active game UI */}
        {activeGame?.type === 'rps' && (
          <View style={s.gameBar}>
            <Text style={s.gameBarTitle}>{t('games.rpsChoose')}</Text>
            <View style={s.rpsRow}>
              {[
                { key: 'rock',     label: t('games.rock') },
                { key: 'paper',    label: t('games.paper') },
                { key: 'scissors', label: t('games.scissors') },
              ].map(({ key, label }) => (
                <TouchableOpacity key={key} style={s.rpsBtn} onPress={() => void handleRPSMove(key)} disabled={gameLoading}>
                  <Text style={s.rpsBtnText}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {activeGame?.type === 'tictactoe' && activeGame.board && (
          <View style={s.gameBar}>
            <Text style={s.gameBarTitle}>{t('games.tttTitle')}</Text>
            <View style={s.tttGrid}>
              {activeGame.board.map((cell, i) => (
                <TouchableOpacity
                  key={i}
                  style={s.tttCell}
                  onPress={() => void handleTTTMove(i)}
                  disabled={cell !== '' || gameLoading}
                >
                  <Text style={s.tttCellText}>
                    {cell === 'X' ? '❌' : cell === 'O' ? '⭕' : '⬜'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {activeGame?.type === 'story' && (
          <View style={s.storyBar}>
            <Text style={s.storyBarText}>📖 {t('games.storyYourTurn')}</Text>
            <TouchableOpacity onPress={() => setActiveGame(null)} style={s.storyEndBtn}>
              <Text style={s.storyEndText}>End story</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Input bar */}
        <View style={s.inputBar}>
          {(isTeacher || isJules) ? (
            <>
              <TouchableOpacity style={s.cameraBtn} onPress={() => void handleCamera()}>
                <Text style={{ fontSize: 18 }}>📸</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.voiceBtn, isRecording && { backgroundColor: '#FF4B4B' }]}
                onPress={() => void handleVoiceMemo()}
              >
                <Text style={{ fontSize: 18 }}>{isRecording ? '⏹️' : '🎤'}</Text>
              </TouchableOpacity>
            </>
          ) : isSophie ? (
            <>
              <TouchableOpacity
                style={[s.voiceBtn, isRecording && { backgroundColor: '#FF4B4B' }]}
                onPress={() => void handleVoiceMemo()}
              >
                <Text style={{ fontSize: 18 }}>{isRecording ? '⏹️' : '🎤'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.gameBtn} onPress={() => void startSophieQuiz()} disabled={quizLoading}>
                <Text style={{ fontSize: 16 }}>{quizLoading ? '⏳' : '🧠'}</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <TouchableOpacity
                style={[s.voiceBtn, isRecording && { backgroundColor: '#FF4B4B' }]}
                onPress={() => void handleVoiceMemo()}
              >
                <Text style={{ fontSize: 18 }}>{isRecording ? '⏹️' : '🎤'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.gameBtn} onPress={() => setShowGameModal(true)} disabled={!!activeGame}>
                <Text style={{ fontSize: 16 }}>🎮</Text>
              </TouchableOpacity>
            </>
          )}

          <TextInput
            ref={inputRef}
            style={s.textInput}
            placeholder={
              activeGame?.type === 'story'
                ? t('games.storyYourTurn')
                : t('dm.inputPlaceholder', { name: friendName })
            }
            placeholderTextColor="#B4B2A9"
            value={inputText}
            onChangeText={(text) => setInputText(dedupeDictatedText(text))}
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

// ── Message bubble ────────────────────────────────────────────────────────────

function MessageBubble({ message, friendName }: { message: ChatMessage; friendName: string }) {
  const { language } = useLanguageStore();
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
          {isChild && message.localImageUri && (
            <Image source={{ uri: message.localImageUri }} style={s.bubbleImage} resizeMode="cover" />
          )}
          <View style={{ flexShrink: 1, minWidth: 0 }}>
            {!isChild && message.image_url && (
              <Image source={{ uri: message.image_url }} style={s.bubbleImage} resizeMode="cover" />
            )}
            <Markdown style={mdStyles}>{message.content}</Markdown>
          </View>
          {!isChild && (
            <View style={s.bubbleAudioBtn}>
              <AudioPlayer text={message.content} characterId={friendName} messageId={message.id} size="sm" />
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

// ── Typing indicator ──────────────────────────────────────────────────────────

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

function TypingBubble({ lookingAtPhoto }: { lookingAtPhoto?: boolean }) {
  const { t } = useTranslation();
  return (
    <View style={s.bubbleRowLeft}>
      <View style={s.bubbleAIOuter}>
        <View style={[s.bubbleAI, s.typingBubble]}>
          <TypingDot delay={0} />
          <TypingDot delay={200} />
          <TypingDot delay={400} />
        </View>
        <Text style={s.typingText}>{lookingAtPhoto ? t('dm.lookingAtPhoto') : t('dm.typing')}</Text>
      </View>
    </View>
  );
}

function GreetingCard({ name, emoji, bg, inverted, avatarUrl }: { name: string; emoji: string; bg: string; inverted: boolean; avatarUrl?: string | null }) {
  const { t } = useTranslation();
  return (
    <View style={[s.greeting, inverted && { transform: [{ scaleY: -1 }] }]}>
      <View style={[s.greetingAvatar, { backgroundColor: bg }]}>
        {avatarUrl
          ? <Image source={{ uri: avatarUrl }} style={{ width: 80, height: 80, borderRadius: 40 }} />
          : <Text style={{ fontSize: 40 }}>{emoji}</Text>
        }
      </View>
      <Text style={s.greetingText}>{t('dm.sayHello', { name })}</Text>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  screen:    { flex: 1, backgroundColor: Colors.bg },

  topBar:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12,
               backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F0EFF8' },
  backBtn:   { marginRight: 8, padding: 4 },
  backArrow: { fontSize: 20, color: '#888780' },
  friendAvatar:   { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  friendNameText: { fontSize: 16, fontWeight: '700', color: '#2C2C2A' },
  onlineText:     { fontSize: 12, color: '#5DCAA5', fontWeight: '600', marginTop: 1 },
  offlineText:    { fontSize: 12, color: '#B4B2A9', marginTop: 1 },

  messagesList: { paddingVertical: 8 },

  bubbleRowRight: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 14, paddingVertical: 4, width: '100%', marginBottom: 10 },
  bubbleRowLeft:  { flexDirection: 'row', justifyContent: 'flex-start', paddingHorizontal: 14, paddingVertical: 4, width: '100%', marginBottom: 10 },

  bubbleChildOuter: { alignSelf: 'flex-end', flexShrink: 1, maxWidth: '80%', minWidth: 0, alignItems: 'flex-end' },
  bubbleAIOuter:    { alignSelf: 'flex-start', flexShrink: 1, maxWidth: '80%', minWidth: 0, alignItems: 'flex-start' },

  bubbleChild: { backgroundColor: Colors.purple, paddingHorizontal: 16, paddingVertical: 12,
                 borderRadius: 18, borderBottomRightRadius: 4 },
  bubbleAI:    { backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 12,
                 borderRadius: 18, borderBottomLeftRadius: 4, borderWidth: 1, borderColor: '#E8E6FF' },
  bubbleAIRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  bubbleAudioBtn: { marginBottom: 2 },
  bubbleImage:    { width: 160, height: 120, borderRadius: 10, marginBottom: 8 },

  timestamp: { fontSize: 10, color: '#B4B2A9', marginTop: 3 },
  tsRight:   { alignSelf: 'flex-end' },
  tsLeft:    { alignSelf: 'flex-start' },

  typingBubble: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 14 },
  typingDot:    { width: 8, height: 8, borderRadius: 4, backgroundColor: '#B4B2A9', marginHorizontal: 3 },
  typingText:   { fontSize: 11, color: '#B4B2A9', fontStyle: 'italic', marginTop: 4, marginLeft: 4 },
  countdownText:{ fontSize: 10, color: '#C8C6E8', marginTop: 4 },

  toast:     { position: 'absolute', bottom: 90, left: 24, right: 24, backgroundColor: Colors.red,
               borderRadius: 12, padding: 12, alignItems: 'center' },
  toastText: { color: '#fff', fontSize: 13, fontWeight: '600' },

  pendingBanner:     { position: 'absolute', bottom: 90, left: 24, right: 24, backgroundColor: '#F0EFF8',
                       borderRadius: 12, padding: 12, alignItems: 'center' },
  pendingBannerText: { color: '#888780', fontSize: 13 },

  retryBanner:   { position: 'absolute', bottom: 90, left: 24, right: 24, backgroundColor: '#FFF4E6',
                   borderRadius: 12, padding: 12, flexDirection: 'row', alignItems: 'center',
                   justifyContent: 'space-between', borderWidth: 1, borderColor: '#FFD9A0' },
  retryBannerText: { color: '#888780', fontSize: 13, flex: 1 },
  retryBtn:      { backgroundColor: Colors.orange, paddingHorizontal: 14, paddingVertical: 7,
                   borderRadius: 10, marginLeft: 10 },
  retryBtnText:  { color: '#fff', fontSize: 13, fontWeight: '700' },

  inputBar:  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingTop: 10,
               paddingBottom: 22, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#F0EFF8', gap: 8 },
  voiceBtn:  { width: 38, height: 38, borderRadius: 19, backgroundColor: Colors.orange + '33',
               alignItems: 'center', justifyContent: 'center' },
  cameraBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: Colors.orange,
               alignItems: 'center', justifyContent: 'center' },
  gameBtn:   { width: 38, height: 38, borderRadius: 19, backgroundColor: Colors.purple + '22',
               alignItems: 'center', justifyContent: 'center' },
  textInput: { flex: 1, backgroundColor: Colors.bg, borderWidth: 1, borderColor: '#E8E6FF',
               borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: '#2C2C2A' },
  sendBtn:   { width: 38, height: 38, borderRadius: 19, backgroundColor: Colors.purple,
               alignItems: 'center', justifyContent: 'center' },
  sendArrow: { color: '#fff', fontSize: 16, marginLeft: 2 },

  greeting:       { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, paddingHorizontal: 32 },
  greetingAvatar: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  greetingText:   { fontSize: 15, color: '#888780', textAlign: 'center', lineHeight: 22 },

  // Image preview
  imagePreviewBar:  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8,
                      backgroundColor: '#FFF8F0', borderTopWidth: 1, borderTopColor: '#F0EFF8', gap: 10 },
  imagePreview:     { width: 52, height: 52, borderRadius: 8 },
  imagePreviewLabel:{ flex: 1, fontSize: 12, color: Colors.orange, fontWeight: '600' },
  imageRemoveBtn:   { width: 24, height: 24, borderRadius: 12, backgroundColor: '#E8E6FF',
                      alignItems: 'center', justifyContent: 'center' },
  imageRemoveText:  { fontSize: 16, color: '#888780', lineHeight: 20 },

  // Grade chips
  gradeChipsBar:    { backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#F0EFF8', paddingVertical: 10 },
  gradeChipsScroll: { paddingHorizontal: 14, gap: 8 },
  gradeChip:        { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
                      backgroundColor: '#fff', borderWidth: 2, borderColor: Colors.purple },
  gradeChipText:    { fontSize: 13, fontWeight: '700', color: Colors.purple },

  // Game bar
  gameBar:     { backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#F0EFF8',
                 paddingVertical: 12, paddingHorizontal: 14, alignItems: 'center', gap: 10 },
  gameBarTitle:{ fontSize: 13, fontWeight: '700', color: '#2C2C2A' },

  rpsRow:    { flexDirection: 'row', gap: 10 },
  rpsBtn:    { flex: 1, backgroundColor: Colors.purple, borderRadius: 14,
               paddingVertical: 10, alignItems: 'center' },
  rpsBtnText:{ fontSize: 13, fontWeight: '800', color: '#fff' },

  tttGrid:    { flexDirection: 'row', flexWrap: 'wrap', width: 168 },
  tttCell:    { width: 56, height: 56, alignItems: 'center', justifyContent: 'center' },
  tttCellText:{ fontSize: 34 },

  storyBar:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                backgroundColor: Colors.purple + '11', borderTopWidth: 1, borderTopColor: '#E8E6FF',
                paddingHorizontal: 14, paddingVertical: 10 },
  storyBarText:{ fontSize: 12, color: Colors.purple, fontWeight: '600' },
  storyEndBtn: { backgroundColor: Colors.purple + '22', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5 },
  storyEndText:{ fontSize: 11, color: Colors.purple, fontWeight: '700' },

  // Game modal
  gameModalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  gameModalSheet:   { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24,
                      padding: 20, paddingBottom: 36, gap: 10 },
  gameModalTitle:   { fontSize: 18, fontWeight: '800', color: '#2C2C2A', textAlign: 'center', marginBottom: 4 },
  gameOption:       { backgroundColor: Colors.bg, borderRadius: 14, padding: 16, alignItems: 'center' },
  gameOptionText:   { fontSize: 15, fontWeight: '700', color: '#2C2C2A' },
  gameCancelBtn:    { alignItems: 'center', paddingVertical: 10 },
  gameCancelText:   { fontSize: 15, color: '#888780' },

  // Privacy modal
  modalOverlay:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center',
                   alignItems: 'center', paddingHorizontal: 32 },
  privacyModal:  { backgroundColor: '#fff', borderRadius: 20, padding: 24, alignItems: 'center', gap: 12,
                   shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 20, elevation: 8 },
  privacyTitle:  { fontSize: 18, fontWeight: '800', color: '#2C2C2A', textAlign: 'center' },
  privacyText:   { fontSize: 14, color: '#888780', textAlign: 'center', lineHeight: 22 },
  privacyBtn:    { backgroundColor: Colors.purple, paddingHorizontal: 28, paddingVertical: 12, borderRadius: 16, marginTop: 4 },
  privacyBtnText:{ color: '#fff', fontSize: 15, fontWeight: '700' },
});
