import { create } from 'zustand';

interface NotificationData {
  friendId: string;
  friendName: string;
  friendEmoji: string;
  message: string;
}

interface NotificationStore {
  notification: NotificationData | null;
  showNotification: (data: NotificationData) => void;
  clearNotification: () => void;
}

export const useNotificationStore = create<NotificationStore>((set) => ({
  notification: null,
  showNotification: (data) => set({ notification: data }),
  clearNotification: () => set({ notification: null }),
}));
