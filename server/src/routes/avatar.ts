import { Router } from 'express';
import { generateChildAvatar } from '../controllers/avatar.controller';
const router = Router();
router.post('/generate', generateChildAvatar);
export default router;