import { create } from 'zustand';

interface NotificationData {
  friendId: string;
  friendName: string;
  friendEmoji: string;
  message: string;
}

interface NotificationStore {
  notification: NotificationData | null;
  unreadCount: number;
  showNotification: (data: NotificationData) => void;
  clearNotification: () => void;
  setUnreadCount: (count: number) => void;
  decrementUnreadCount: () => void;
}

export const useNotificationStore = create<NotificationStore>((set) => ({
  notification: null,
  unreadCount: 0,
  showNotification: (data) => set((state) => ({ notification: data, unreadCount: state.unreadCount + 1 })),
  clearNotification: () => set({ notification: null }),
  setUnreadCount: (count) => set({ unreadCount: Math.max(0, count) }),
  decrementUnreadCount: () => set((state) => ({ unreadCount: Math.max(0, state.unreadCount - 1) })),
}));
