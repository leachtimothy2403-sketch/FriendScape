import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('parentToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    // Only auto-redirect for 401s on protected routes, never on the login page itself
    // (a failed login also returns 401 — redirecting there causes a silent page reload).
    if (err.response?.status === 401 && window.location.pathname !== '/login') {
      localStorage.removeItem('parentToken');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  },
);

export const auth = {
  login: (email: string, password: string) => api.post('/auth/login', { email, password }),
  logout: () => api.post('/auth/logout'),
};

export const children = {
  list: () => api.get('/children'),
  get: (id: string) => api.get(`/children/${id}`),
  update: (id: string, data: Record<string, unknown>) => api.put(`/children/${id}`, data),
};

export const parent = {
  alerts: () => api.get('/parent/alerts'),
  markRead: (id: string) => api.patch(`/parent/alerts/${id}/read`),
  markAllRead: () => api.put('/parent/alerts/read-all'),
  activity: (childId: string) => api.get(`/parent/activity/${childId}`),
  timeline: (childId: string) => api.get(`/parent/timeline/${childId}`),
  mood: (childId: string) => api.get(`/parent/mood/${childId}`),
  friends: (childId: string) => api.get(`/parent/friends/${childId}`),
  badges: (childId: string) => api.get(`/parent/badges/${childId}`),
  childAlerts: (childId: string) => api.get(`/parent/alerts/${childId}`),
  childPosts: (childId: string) => api.get(`/parent/children/${childId}/posts`),
  childMessages: (childId: string) => api.get(`/parent/children/${childId}/messages`),
  childStats: (childId: string) => api.get(`/parent/children/${childId}/stats`),
  updateSettings: (data: Record<string, unknown>) => api.put('/parent/settings', data),
};

export const friends = {
  list: () => api.get('/friends'),
  getForChild: (childId: string) => api.get(`/friends/child/${childId}`),
  activate: (childId: string, friendId: string) =>
    api.post(`/friends/child/${childId}/activate`, { friendId }),
  deactivate: (childId: string, friendId: string) =>
    api.delete(`/friends/child/${childId}/${friendId}`),
};

export default api;
