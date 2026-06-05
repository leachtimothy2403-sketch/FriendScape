import { Router } from 'express';
import { getBadges, checkBadges, recalculateBadges } from '../controllers/badges.controller';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.use(requireAuth);

router.get('/', getBadges);
router.post('/check', checkBadges);
router.post('/recalculate', recalculateBadges);

export default router;
