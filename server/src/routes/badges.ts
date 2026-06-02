import { Router } from 'express';
import { getBadges, checkBadges } from '../controllers/badges.controller';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.use(requireAuth);

router.get('/', getBadges);
router.post('/check', checkBadges);

export default router;
