import { Router } from 'express';
import { getNotifications, markNotificationRead } from '../controllers/notifications.controller';
import { requireAuth } from '../middleware/auth';

const router = Router();
router.use(requireAuth);
router.get('/', getNotifications);
router.put('/:id', markNotificationRead);

export default router;
