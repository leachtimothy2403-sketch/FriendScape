import { Router } from 'express';
import { aiChat, generateFriendPost } from '../controllers/ai.controller';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.use(requireAuth);

// Send a message to an AI friend and receive a response
router.post('/chat/:childId/:friendId', aiChat);

// Trigger the AI to generate a new post for a friend (background task)
router.post('/generate-post/:friendId', generateFriendPost);

export default router;
