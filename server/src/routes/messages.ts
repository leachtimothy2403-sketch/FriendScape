import { Router } from 'express';
import { getConversations, getMessages, sendMessage, getLatestMessage, startGame, makeGameMove, getUnreadMessages, mascotMessage } from '../controllers/messages.controller';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.use(requireAuth);

// More-specific routes must come before the generic /:friendId catch-all
router.get('/conversations/:childId', getConversations);

// Mascot chat (must be before /:friendId catch-all)
router.post('/mascot', mascotMessage);

// Game routes (must be before /:friendId catch-all)
router.post('/:friendId/game/start', startGame);
router.post('/:friendId/game/move',  makeGameMove);

// Child-session endpoints — childId is read from the JWT, not the URL
router.get('/unread', getUnreadMessages);
router.get('/:friendId/latest', getLatestMessage);
router.get('/:friendId', getMessages);
router.post('/:friendId', sendMessage);

export default router;
