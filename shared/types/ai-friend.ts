export type AvatarStyle = 'cartoon' | 'pixel' | 'watercolor' | 'plush';
export type PersonalityTrait =
  | 'curious'
  | 'funny'
  | 'brave'
  | 'caring'
  | 'creative'
  | 'wise'
  | 'adventurous'
  | 'gentle'
  | 'silly';

export interface AIFriend {
  id: string;
  name: string;
  personality: PersonalityTrait[];
  interests: string[];
  avatarStyle: AvatarStyle;
  avatarUrl: string;
  isStarFriend: boolean; // featured/premium friend
  isTeacher: boolean;    // specialises in educational content
  bio: string;
  greeting: string;      // first message sent to a new child
  packId: string | null; // null = available in all packs
}
