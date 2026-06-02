export type MessageMediaType = 'text' | 'image' | 'audio' | 'sticker' | 'drawing';
export type SenderType = 'child' | 'ai';

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  senderType: SenderType;
  content: string;
  mediaType: MessageMediaType;
  mediaUrl: string | null;
  read: boolean;
  createdAt: Date;
}

export interface Conversation {
  id: string;
  childId: string;
  friendId: string;
  createdAt: Date;
  updatedAt: Date;
}
