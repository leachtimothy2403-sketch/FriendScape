import { Router } from 'express';
import { getConversations, getMessages, sendMessage, getLatestMessage } from '../controllers/messages.controller';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.use(requireAuth);

// More-specific routes must come before the generic /:friendId catch-all
router.get('/conversations/:childId', getConversations);

// Child-session endpoints — childId is read from the JWT, not the URL
router.get('/:friendId/latest', getLatestMessage);
router.get('/:friendId', getMessages);
router.post('/:friendId', sendMessage);

export default router;
