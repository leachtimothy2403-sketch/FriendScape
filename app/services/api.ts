import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://192.168.1.15:3001';
console.log('API_URL:', API_URL);

export function resolveAvatarUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return `${API_URL}${url}`;
}

const api = axios.create({
  baseURL: API_URL,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

console.log('[api] API_URL:', API_URL);

api.interceptors.request.use(async (config) => {
  if (!config.headers.Authorization) {
    const token = await AsyncStorage.getItem('authToken');
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    if (error.response?.status === 401) {
      await AsyncStorage.multiRemove(['authToken', 'childProfile']);
    }
    return Promise.reject(error);
  },
);

export const auth = {
  register: (data: { email: string; displayName: string; password: string }) =>
    api.post('/auth/register', data),
  login: (data: { email: string; password: string }) =>
    api.post<{ token: string; language: string; user: { id: string; email: string; displayName: string } }>('/auth/login', data),
  logout: () => api.post('/auth/logout'),
  enroll: (data: { parentEmail: string; language?: string }) =>
    api.post<{ status: string; message?: string }>('/auth/enroll', data),
  enrollmentStatus: (parentEmail: string) =>
    api.get<{ status: 'pending' | 'approved' | 'expired'; parentLanguage: string | null }>(
      `/auth/enrollment-status?parentEmail=${encodeURIComponent(parentEmail)}`,
    ),
  simulateApprove: (data: { parentEmail: string }) =>
    api.post<{ status: string }>('/auth/simulate-approve', data),
};

export const children = {
  list: () => api.get('/children'),
  create: (data: Record<string, unknown>) => api.post('/children', data),
  get: (id: string) => api.get(`/children/${id}`),
  update: (id: string, data: Record<string, unknown>) => api.put(`/children/${id}`, data),
  createFromOnboarding: (data: Record<string, unknown>) =>
    api.post<{
      childId: string;
      name: string;
      mascotId: string;
      assignedFriends: { id: string; name: string; coverEmojis: string; introMessage: string }[];
      avatarUrl?: string | null;
    }>('/children/onboarding', data, { timeout: 120000 }),
};

export const friends = {
  list: (language?: string) => api.get('/friends', { params: { language } }),
  get: (id: string, language?: string) => api.get(`/friends/${id}`, { params: { language } }),
  getForChild: (childId: string) => api.get(`/friends/child/${childId}`),
  activate: (childId: string, friendId: string) =>
    api.post(`/friends/child/${childId}/activate`, { friendId }),
};

export const posts = {
  feed: (childId: string) => api.get(`/posts/feed/${childId}`),
  create: (childId: string, data: Record<string, unknown>) =>
    api.post(`/posts/child/${childId}`, data),
  like: (postId: string) => api.post(`/posts/${postId}/like`),
  delete: (postId: string) => api.delete(`/posts/${postId}`),
};

export const messages = {
  conversations: (childId: string) => api.get(`/messages/conversations/${childId}`),
  get: (childId: string, friendId: string) => api.get(`/messages/dm/${childId}/${friendId}`),
  send: (childId: string, friendId: string, content: string) =>
    api.post(`/messages/dm/${childId}/${friendId}`, { content }),
};

export const aiChat = {
  send: (childId: string, friendId: string, message: string) =>
    api.post(`/ai/chat/${childId}/${friendId}`, { message }),
};

export const parent = {
  alerts: () => api.get('/parent/alerts'),
  markRead: (alertId: string) => api.put(`/parent/alerts/${alertId}/read`),
  activity: (childId: string) => api.get(`/parent/activity/${childId}`),
  timeline: (childId: string) => api.get(`/parent/timeline/${childId}`),
  mood: (childId: string) => api.get(`/parent/mood/${childId}`),
  friends: (childId: string) => api.get(`/parent/friends/${childId}`),
  badges: (childId: string) => api.get(`/parent/badges/${childId}`),
  childAlerts: (childId: string) => api.get(`/parent/alerts/${childId}`),
  childStats: (childId: string) => api.get(`/parent/children/${childId}/stats`),
  updateChildScreenTime: (childId: string, data: { weekdayLimitMinutes?: number | null; weekendLimitMinutes?: number | null; extensionMinutes?: number }) =>
    api.patch(`/parent/children/${childId}/screen-time`, data),
};

// ─── Child-session helpers ────────────────────────────────────────────────────
// These endpoints use the child's own JWT (stored as 'childToken' in AsyncStorage)
// rather than the parent's JWT ('authToken').

function withToken(token: string): { headers: Record<string, string> } {
  return { headers: { Authorization: `Bearer ${token}` } };
}

export const childAuth = {
  login: (childId: string) =>
    api.post<{ token: string; child: Record<string, unknown> }>('/auth/child-login', { childId }),
};

export const childPosts = {
  generateDaily: (token: string, force = false) =>
    api.post<{ generated: boolean; posts: unknown[]; message?: string }>(
      `/posts/generate-daily${force ? '?force=true' : ''}`, {}, withToken(token),
    ),
  feed: (token: string) =>
    api.get<{ posts: unknown[] }>('/posts/feed', withToken(token)),
  create: (token: string, data: { content: string; mood?: string }) =>
    api.post<{ post: unknown }>('/posts', data, withToken(token)),
  createPhoto: (token: string, data: { photoBase64: string; photoMediaType?: string; content?: string }) =>
    api.post('/posts/photo', data, { headers: { Authorization: `Bearer ${token}` } }),
  react: (token: string, postId: string, emoji: string) =>
    api.post<{ reactions: Record<string, number>; toggled: boolean }>(
      `/posts/${postId}/react`, { emoji }, withToken(token),
    ),
  comment: (token: string, postId: string, text: string) =>
    api.post<{ comment: unknown }>(`/posts/${postId}/comments`, { text }, withToken(token)),
  getComments: (token: string, postId: string) =>
    api.get<{ comments: Array<{ authorName: string; authorEmoji: string; content: string; createdAt: string }> }>(`/posts/${postId}/comments`, withToken(token)),
};

export const childMessages = {
  get: (token: string, friendId: string) =>
    api.get<{ messages: unknown[]; conversationId: string }>(
      `/messages/${friendId}`, withToken(token),
    ),
  send: (
    token: string,
    friendId: string,
    content: string,
    imageBase64?: string,
    imageMediaType?: string,
  ) =>
    api.post<{ childMessage: unknown; friendReply: unknown | null; status?: string; estimatedReplySeconds?: number; mood: string }>(
      `/messages/${friendId}`,
      { content, ...(imageBase64 ? { imageBase64, imageMediaType: imageMediaType ?? 'image/jpeg' } : {}) },
      withToken(token),
    ),
  getLatest: (token: string, friendId: string) =>
    api.get<{ message: unknown | null }>(
      `/messages/${friendId}/latest`, withToken(token),
    ),
  getUnread: (token: string, since?: string) =>
    api.get<{ messages: Array<{ id: string; friendId: string; friendName: string; friendEmoji: string; message: string }> }>(
      `/messages/unread${since ? `?since=${encodeURIComponent(since)}` : ''}`, withToken(token),
    ),
};

export const childFriends = {
  get: (token: string, friendId: string) =>
    api.get<{ friend: Record<string, unknown> }>(`/friends/${friendId}`, withToken(token)),
  getStatus: (friendId: string) =>
    api.get<{ is_online: boolean; friend_name: string; response_delay_min: number; response_delay_max: number }>(
      `/friends/${friendId}/status`,
    ),
};

export const audioApi = {
  generate: (
    token: string,
    data: { text: string; characterId: string; language: 'en' | 'fr'; messageId?: string },
  ) => api.post<{ audioUrl: string }>('/audio/generate', data, withToken(token)),
  transcribe: (
    token: string | null,
    data: { audioBase64: string; mimeType: string; language?: string },
  ) => api.post<{ transcript: string }>('/audio/transcribe', data, token ? withToken(token) : undefined),
};

// ─── Friend network discovery ─────────────────────────────────────────────────

export const friendNetwork = {
  getWithStatus: (token: string, friendId: string, language?: string) =>
    api.get<{ friend: FriendWithStatus }>(`/friends/${friendId}`, { ...withToken(token), timeout: 8000, params: { language } }),
  getPublic: (friendId: string, language?: string) =>
    api.get<{ friend: AiFriendRecord }>(`/friends/${friendId}`, { timeout: 8000, params: { language } }),
  getNetwork: (friendId: string, token?: string) =>
    token
      ? api.get<{ friends: FriendWithRelationship[] }>(`/friends/${friendId}/network`, { ...withToken(token), timeout: 8000 })
      : api.get<{ friends: FriendWithRelationship[] }>(`/friends/${friendId}/network`, { timeout: 8000 }),
  getPosts: (token: string, friendId: string) =>
    api.get<{ posts: FriendPost[] }>(`/friends/${friendId}/posts`, withToken(token)),
  addFriend: (token: string, friendId: string, referringFriendId?: string) =>
    api.post<{ success: boolean; friend: AiFriendRecord }>(
      `/friends/${friendId}/add`,
      { referringFriendId },
      withToken(token),
    ),
};

export const myFriendsApi = {
  list: (token: string) =>
    api.get<{ friends: MyChildFriend[] }>('/children/me/friends', withToken(token)),
  remove: (token: string, friendId: string) =>
    api.delete<{ success: boolean }>(`/children/me/friends/${friendId}`, withToken(token)),
};

// ─── Types for friend network ─────────────────────────────────────────────────

export interface AiFriendRecord {
  id: string;
  name: string;
  bio: string;
  cover_emojis: string;
  avatar_url?: string | null;
  personality: string[];
  interests: string[];
  is_star_friend: boolean;
  is_teacher: boolean;
  is_jules?: boolean;
  is_seasonal?: boolean;
  age: number | null;
  gender: string;
  age_range_min: number;
  age_range_max: number;
  relationship_type: string | null;
}

export interface FriendWithRelationship extends AiFriendRecord {
  network_relationship_type: string;
  relationship_description:  string;
  already_added:             boolean;
}

export interface FriendshipRecord {
  level:         number;
  xp:            number;
  activatedAt:   string;
  messagesCount: number;
}

export interface FriendWithStatus extends AiFriendRecord {
  is_added:              boolean;
  friendship?:           FriendshipRecord;
  referringFriendName?:   string | null;
  referringFriendId?:     string | null;
  referringFriendGender?: string | null;
}

export interface FriendPost {
  id:          string;
  content:     string;
  scene_emojis: string | null;
  mood:        string | null;
  created_at:  string;
}

export interface MyChildFriend extends AiFriendRecord {
  friendship_level: number;
  friendship_xp:    number;
  activated_at:     string;
}

// ─── Profile types ────────────────────────────────────────────────────────────

export interface ChildProfile {
  id: string;
  name: string;
  age: number;
  gender: string;
  language: string;
  avatarTheme: string;
  mascotId: string;
  interests: string[];
  bio: string | null;
  avatarConfig?: Record<string, unknown>;
  avatarBackground?: string;
  avatarUrl?: string | null;
  stats: {
    totalPosts: number;
    totalFriends: number;
    totalBadges: number;
    memberSince: string;
    level: number;
    levelName: string;
  };
}

export interface MemoryItem {
  id: string;
  type: 'milestone' | 'emotional' | 'badge' | 'friendship' | 'learning';
  text: string;
  date: string;
  icon: string;
}

export interface FriendWithStats extends AiFriendRecord {
  friendship_level: number;
  friendship_xp: number;
  xp_to_next_level: number;
  level_name: string;
  activated_at: string;
  last_message_at: string | null;
}

export interface ProfilePost {
  id: string;
  content: string;
  mood: string | null;
  scene_emojis: string | null;
  image_url: string | null;
  created_at: string;
  reaction_count: number;
}

export interface ModerationResult {
  safe: boolean;
  reason?: string;
}

export const childProfileApi = {
  getProfile: (token: string) =>
    api.get<ChildProfile>('/children/me/profile', withToken(token)),
  updateProfile: (token: string, data: { bio?: string; interests?: string[] }) =>
    api.patch<Omit<ChildProfile, 'stats'>>('/children/me/profile', data, withToken(token)),
  getMemories: (token: string) =>
    api.get<{ memories: MemoryItem[] }>('/children/me/memories', withToken(token)),
  getPosts: (token: string) =>
    api.get<{ posts: ProfilePost[] }>('/children/me/posts', withToken(token)),
  getFriendsList: (token: string, language?: string) =>
    api.get<{ friends: FriendWithStats[] }>('/children/me/friends-list', { ...withToken(token), params: { language } }),
  validateInterest: (token: string, text: string) =>
    api.post<ModerationResult>('/children/me/interests/validate', { text }, withToken(token)),
  regenerateFriends: (token: string) =>
    api.post<{
      assignedFriends: { id: string; name: string; coverEmojis: string; introMessage: string }[];
      regenerationCount: number;
    }>('/children/me/regenerate-friends', {}, withToken(token)),
};

export const childSession = {
  start: (token: string) =>
    api.post<{ sessionId: string }>('/children/session/start', {}, withToken(token)),
  end: (token: string) =>
    api.post<{ ended: number }>('/children/session/end', {}, withToken(token)),
  status: (token: string) =>
    api.get<{ limitEnabled: boolean; usedMinutes: number; limitMinutes: number | null; limitExceeded: boolean }>(
      '/children/me/screen-time-status', withToken(token),
    ),
};

export const avatarApi = {
  get: (token: string) =>
    api.get<{ avatarConfig: Record<string, unknown> | null; avatarBackground: string | null }>(
      '/children/me/avatar', withToken(token),
    ),
  save: (token: string, avatarConfig: Record<string, unknown>, avatarBackground: string) =>
    api.put<{ success: boolean; avatarConfig: Record<string, unknown>; avatarBackground: string }>(
      '/children/me/avatar', { avatarConfig, avatarBackground }, withToken(token),
    ),
};

export interface NotificationItem {
  id: string;
  type: 'dm' | 'comment' | 'badge';
  friendId: string | null;
  friendName: string;
  friendEmoji: string;
  friendAvatarUrl: string | null;
  preview: string;
  createdAt: string;
  read: boolean;
}

export const childNotifications = {
  get: (token: string) =>
    api.get<{ notifications: NotificationItem[] }>('/notifications', withToken(token)),
  markRead: (token: string, notificationId: string) =>
    api.put<{ success: boolean }>(`/notifications/${notificationId}`, {}, withToken(token)),
};

export const devApi = {
  reset: () => api.post<{
    success: boolean;
    message: string;
    deleted?: { children: number; enrollments: number; generatedFriends: number; posts: number; messages: number };
  }>('/auth/dev-reset', {}, { timeout: 5000 }),
};

export const mascotAvatars = {
  get: () => api.get<{ mascots: Record<string, string> }>('/avatar/mascots'),
  generate: () => api.post<{ mascots: Record<string, string> }>('/avatar/mascots/generate', {}),
};

export const mascotApi = {
  sendMessage: (token: string, content: string, history?: { role: 'child' | 'mascot'; content: string }[]) =>
    api.post<{ reply: string; mode: 'help' | 'feedback' | 'friend' }>('/messages/mascot', { content, history }, withToken(token)),
};

export const gameApi = {
  start: (token: string, friendId: string, gameType: 'rps' | 'tictactoe' | 'story') =>
    api.post<{ message: unknown; gameState: Record<string, unknown> }>(
      `/messages/${friendId}/game/start`,
      { gameType },
      withToken(token),
    ),
  move: (
    token: string,
    friendId: string,
    gameType: 'rps' | 'tictactoe' | 'story',
    move: string | number,
    gameState: Record<string, unknown>,
    childMessage?: string,
  ) =>
    api.post<{ message: unknown; gameState: Record<string, unknown>; gameOver: boolean; winner: string | null }>(
      `/messages/${friendId}/game/move`,
      { gameType, move, gameState, childMessage },
      withToken(token),
    ),
};

export const childBadges = {
  list: (token: string) =>
    api.get<{ badges: BadgeDefinition[] }>('/badges', withToken(token)),
  check: (token: string, trigger: string, value: number) =>
    api.post<{ newBadges: BadgeDefinition[] }>('/badges/check', { trigger, value }, withToken(token)),
  recalculate: (token: string) =>
    api.post<{ newlyAwarded: BadgeDefinition[] }>('/badges/recalculate', {}, withToken(token)),
};

export const childXP = {
  get: (token: string) =>
    api.get<XPData>('/children/me/xp', withToken(token)),
};

export const childGraduation = {
  get: (token: string) =>
    api.get<GraduationProgress>('/children/me/graduation', withToken(token)),
};

// ─── Types used by badges/XP/graduation ──────────────────────────────────────
export interface BadgeDefinition {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: 'kindness' | 'learning' | 'social' | 'milestone' | 'special';
  trigger_type: string;
  xp_required: number | null;
  lumi_message: string | null;
  earned: boolean;
  earned_at: string | null;
  progress: number;
  progress_required: number | null;
}

export interface XPData {
  total_xp: number;
  level: number;
  level_name: string;
  xp_to_next_level: number;
  next_level_threshold: number | null;
}

export interface GraduationMilestone {
  key: string;
  label: string;
  completed: boolean;
  completedAt: string | null;
}

export interface GraduationProgress {
  completed: number;
  total: number;
  milestones: GraduationMilestone[];
  allComplete: boolean;
}

export default api;
