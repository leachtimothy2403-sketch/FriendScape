import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001';

const api = axios.create({
  baseURL: API_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('authToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
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
    api.post('/auth/login', data),
  logout: () => api.post('/auth/logout'),
  enroll: (data: { parentEmail: string }) =>
    api.post<{ status: string; message?: string }>('/auth/enroll', data),
  enrollmentStatus: (parentEmail: string) =>
    api.get<{ status: 'pending' | 'approved' | 'expired' }>(
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
      assignedFriends: { id: string; name: string; coverEmojis: string; matchReason: string }[];
    }>('/children/onboarding', data),
};

export const friends = {
  list: () => api.get('/friends'),
  get: (id: string) => api.get(`/friends/${id}`),
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
  react: (token: string, postId: string, emoji: string) =>
    api.post<{ reactions: Record<string, number>; toggled: boolean }>(
      `/posts/${postId}/react`, { emoji }, withToken(token),
    ),
};

export const childMessages = {
  get: (token: string, friendId: string) =>
    api.get<{ messages: unknown[]; conversationId: string }>(
      `/messages/${friendId}`, withToken(token),
    ),
  send: (token: string, friendId: string, content: string) =>
    api.post<{ childMessage: unknown; friendReply: unknown | null; status?: string; estimatedReplySeconds?: number; mood: string }>(
      `/messages/${friendId}`, { content }, withToken(token),
    ),
  getLatest: (token: string, friendId: string) =>
    api.get<{ message: unknown | null }>(
      `/messages/${friendId}/latest`, withToken(token),
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
};

// ─── Friend network discovery ─────────────────────────────────────────────────

export const friendNetwork = {
  getWithStatus: (token: string, friendId: string) =>
    api.get<{ friend: FriendWithStatus }>(`/friends/${friendId}`, withToken(token)),
  getPublic: (friendId: string) =>
    api.get<{ friend: AiFriendRecord }>(`/friends/${friendId}`),
  getNetwork: (friendId: string, token?: string) =>
    token
      ? api.get<{ friends: FriendWithRelationship[] }>(`/friends/${friendId}/network`, withToken(token))
      : api.get<{ friends: FriendWithRelationship[] }>(`/friends/${friendId}/network`),
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
};

// ─── Types for friend network ─────────────────────────────────────────────────

export interface AiFriendRecord {
  id: string;
  name: string;
  bio: string;
  cover_emojis: string;
  personality: string[];
  interests: string[];
  is_star_friend: boolean;
  is_teacher: boolean;
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
  is_added:   boolean;
  friendship?: FriendshipRecord;
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
  getFriendsList: (token: string) =>
    api.get<{ friends: FriendWithStats[] }>('/children/me/friends-list', withToken(token)),
  validateInterest: (token: string, text: string) =>
    api.post<ModerationResult>('/children/me/interests/validate', { text }, withToken(token)),
};

export const childSession = {
  start: (token: string) =>
    api.post<{ sessionId: string }>('/children/session/start', {}, withToken(token)),
  end: (token: string) =>
    api.post<{ ended: number }>('/children/session/end', {}, withToken(token)),
};

export const childBadges = {
  list: (token: string) =>
    api.get<{ badges: BadgeDefinition[] }>('/badges', withToken(token)),
  check: (token: string, trigger: string, value: number) =>
    api.post<{ newBadges: BadgeDefinition[] }>('/badges/check', { trigger, value }, withToken(token)),
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
