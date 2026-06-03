import { Platform } from 'react-native';

export async function requestPermission(): Promise<boolean> {
  if (Platform.OS !== 'web') return false;
  if (typeof Notification === 'undefined') return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const result = await Notification.requestPermission();
  return result === 'granted';
}

export function sendWebNotification(
  title: string,
  body: string,
  onClick: () => void,
): void {
  if (Platform.OS !== 'web') return;
  if (typeof Notification === 'undefined') return;
  if (Notification.permission !== 'granted') return;
  if (typeof document === 'undefined' || !document.hidden) return;

  const n = new Notification(title, { body, icon: '/favicon.png' });
  n.onclick = () => {
    window.focus();
    onClick();
    n.close();
  };
}
