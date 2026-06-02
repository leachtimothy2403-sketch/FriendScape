export type PostMediaType = 'text' | 'image' | 'audio' | 'sticker' | 'drawing';
export type Mood =
  | 'happy'
  | 'excited'
  | 'calm'
  | 'silly'
  | 'sad'
  | 'curious'
  | 'proud'
  | 'scared'
  | 'loved'
  | 'bored';

export interface Post {
  id: string;
  authorId: string;
  authorType: 'child' | 'ai';
  content: string;
  mood: Mood | null;
  mediaType: PostMediaType;
  mediaUrl: string | null;
  likes: number;
  createdAt: Date;
}
