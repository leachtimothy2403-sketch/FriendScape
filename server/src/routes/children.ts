import { Router } from 'express';
import {
  getChildren,
  createChild,
  getChild,
  updateChild,
  deleteChild,
  createChildFromOnboarding,
  generateAvatar,
  startSession,
  endSession,
  getMyFriends,
  getMyXP,
  getMyGraduation,
  getMyProfile,
  updateMyProfile,
  getMyMemories,
  getMyPosts,
  getMyFriendsList,
  validateInterest,
  regenerateFriends,
  getMyAvatar,
  saveMyAvatar,
} from '../controllers/children.controller';
import { requireAuth } from '../middleware/auth';

const router = Router();

// Unauthed: onboarding creates the child via approved enrollment record
router.post('/onboarding', createChildFromOnboarding);
// Unauthed: called during onboarding before child account exists
router.post('/generate-avatar', generateAvatar);

// All routes below require a JWT (parent or child)
router.use(requireAuth);

// Child-session endpoints — require child JWT (handlers check req.childId)
router.post('/session/start',  startSession);
router.post('/session/end',    endSession);
// me/* routes must come before /:childId to avoid param conflicts
router.get('/me/friends',      getMyFriends);
router.get('/me/xp',           getMyXP);
router.get('/me/graduation',   getMyGraduation);
router.get('/me/profile',      getMyProfile);
router.patch('/me/profile',    updateMyProfile);
router.get('/me/memories',     getMyMemories);
router.get('/me/posts',        getMyPosts);
router.get('/me/friends-list',           getMyFriendsList);
router.post('/me/interests/validate',    validateInterest);
router.post('/me/regenerate-friends',    regenerateFriends);
router.get('/me/avatar',                 getMyAvatar);
router.put('/me/avatar',                 saveMyAvatar);

// Parent-authenticated CRUD
router.get('/', getChildren);
router.post('/', createChild);
router.get('/:childId', getChild);
router.put('/:childId', updateChild);
router.delete('/:childId', deleteChild);

export default router;
