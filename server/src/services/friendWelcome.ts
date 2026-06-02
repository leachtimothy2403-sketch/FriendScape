import db from '../db';
import { generateReferralExcitement, generateNewFriendIntro } from './ai.service';
import { toChildType, toFriendType } from '../utils/db-mappers';

async function findOrCreateConversation(childId: string, friendId: string): Promise<string> {
  let conv = await db('conversations').where({ child_id: childId, friend_id: friendId }).first();
  if (!conv) {
    [conv] = await db('conversations')
      .insert({ child_id: childId, friend_id: friendId })
      .returning('*');
  }
  return String(conv.id);
}

async function saveMessage(
  conversationId: string,
  senderId: string,
  senderType: 'ai',
  content: string,
): Promise<void> {
  await db('messages').insert({ conversation_id: conversationId, sender_id: senderId, sender_type: senderType, content });
  await db('conversations').where({ id: conversationId }).update({ updated_at: new Date() });
}

export async function triggerWelcomeFlow(
  childId:          string,
  newFriendId:      string,
  referringFriendId: string,
): Promise<void> {
  const [childRow, newFriendRow, referringFriendRow] = await Promise.all([
    db('children').where({ id: childId }).first(),
    db('ai_friends').where({ id: newFriendId }).first(),
    db('ai_friends').where({ id: referringFriendId }).first(),
  ]);

  if (!childRow || !newFriendRow || !referringFriendRow) return;

  const child           = toChildType(childRow);
  const newFriend       = toFriendType(newFriendRow);
  const referringFriend = toFriendType(referringFriendRow);
  const lang            = child.language === 'fr' ? 'fr' : 'en';

  const [excitedMsg, introMsg] = await Promise.all([
    generateReferralExcitement(referringFriend, child, newFriend.name, lang),
    generateNewFriendIntro(newFriend, child, referringFriend.name, lang),
  ]);

  const [referringConvId, newConvId] = await Promise.all([
    findOrCreateConversation(childId, referringFriendId),
    findOrCreateConversation(childId, newFriendId),
  ]);

  await Promise.all([
    saveMessage(referringConvId, referringFriendId, 'ai', excitedMsg.text),
    saveMessage(newConvId, newFriendId, 'ai', introMsg.text),
  ]);

  console.log(`[welcome] 🎉 ${referringFriend.name} reacted + ${newFriend.name} introduced to ${child.name}`);
}
