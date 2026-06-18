import { Router } from 'express';
import { generateChildAvatar, getMascotAvatars, generateMascotAvatars } from '../controllers/avatar.controller';
const router = Router();
router.post('/generate', generateChildAvatar);
router.get('/mascots', getMascotAvatars);
router.post('/mascots/generate', generateMascotAvatars);
export default router;