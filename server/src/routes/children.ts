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
  getScreenTimeStatus,
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
  removeMyFriend,
} from '../controllers/children.controller';
import { requireAuth, optionalAuth } from '../middleware/auth';

const router = Router();

// Unauthed or parent-authed: creates a child via enrollment (unauthenticated) or directly (parent JWT)
router.post('/onboarding', optionalAuth, createChildFromOnboarding);

// All routes below require a JWT (parent or child)
router.use(requireAuth);

// Child-session endpoints — require child JWT (handlers check req.childId)
router.post('/session/start',  startSession);
router.post('/session/end',    endSession);
router.get('/me/screen-time-status', getScreenTimeStatus);
// me/* routes must come before /:childId to avoid param conflicts
router.get('/me/friends',      getMyFriends);
router.get('/me/xp',           getMyXP);
router.get('/me/graduation',   getMyGraduation);
router.get('/me/profile',      getMyProfile);
router.patch('/me/profile',    updateMyProfile);
router.get('/me/memories',     getMyMemories);
router.get('/me/posts',        getMyPosts);
router.get('/me/friends-list',           getMyFriendsList);
router.delete('/me/friends/:friendId',   removeMyFriend);
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
