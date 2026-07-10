const FRIEND_NAME_FR: Record<string, string> = {
  'Ms. Luna': 'Mme Luna',
};

export function localizedFriendName(name: string, language: 'en' | 'fr'): string {
  return language === 'fr' ? (FRIEND_NAME_FR[name] ?? name) : name;
}
