import AsyncStorage from '@react-native-async-storage/async-storage';

export type LocalChildProfile = {
  childId: string;
  name: string;
  mascotId?: string;
  avatarUrl?: string;
};

const KEY = 'childProfiles';

export async function getChildProfiles(): Promise<LocalChildProfile[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function addChildProfile(profile: LocalChildProfile): Promise<void> {
  const existing = await getChildProfiles();
  const deduped = existing.filter(p => p.childId !== profile.childId);
  await AsyncStorage.setItem(KEY, JSON.stringify([...deduped, profile]));
}

export async function setActiveChildProfile(profile: LocalChildProfile, token: string): Promise<void> {
  await AsyncStorage.setItem('childToken', token);
  await AsyncStorage.setItem('childId', profile.childId);
  await AsyncStorage.setItem('childProfile', JSON.stringify({
    childId:  profile.childId,
    name:     profile.name,
    mascotId: profile.mascotId,
  }));
  if (profile.avatarUrl) {
    await AsyncStorage.setItem('childAvatarUrl', profile.avatarUrl);
  }
}
