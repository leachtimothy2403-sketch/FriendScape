import { Router } from 'express';
import {
  getChildren,
  createChild,
  getChild,
  updateChild,
  deleteChild,
  createChildFromOnboarding,
  startSession,
  endSession,
  getMyFriends,
  getMyXP,
  getMyGraduation,
} from '../controllers/children.controller';
import { requireAuth } from '../middleware/auth';

const router = Router();

// Unauthed: onboarding creates the child via approved enrollment record
router.post('/onboarding', createChildFromOnboarding);

// All routes below require a JWT (parent or child)
router.use(requireAuth);

// Child-session endpoints — require child JWT (handlers check req.childId)
router.post('/session/start',  startSession);
router.post('/session/end',    endSession);
// me/* routes must come before /:childId to avoid param conflicts
router.get('/me/friends',    getMyFriends);
router.get('/me/xp',         getMyXP);
router.get('/me/graduation', getMyGraduation);

// Parent-authenticated CRUD
router.get('/', getChildren);
router.post('/', createChild);
router.get('/:childId', getChild);
router.put('/:childId', updateChild);
router.delete('/:childId', deleteChild);

export default router;
