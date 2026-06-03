import { Router } from 'express';
import {
  listFriends,
  getFriend,
  getFriendNetwork,
  getFriendPosts,
  addFriendForChild,
  activateFriendForChild,
  deactivateFriendForChild,
  getChildFriends,
  getFriendStatus,
} from '../controllers/friends.controller';
import { requireAuth, optionalAuth } from '../middleware/auth';

const router = Router();

router.get('/', listFriends);

// Specific sub-routes must come BEFORE the /:friendId catch-all
router.get('/child/:childId',              requireAuth,  getChildFriends);
router.post('/child/:childId/activate',    requireAuth,  activateFriendForChild);
router.delete('/child/:childId/:friendId', requireAuth,  deactivateFriendForChild);

router.get('/:friendId/network', optionalAuth, getFriendNetwork);
router.get('/:friendId/posts',   requireAuth,  getFriendPosts);
router.get('/:friendId/status',              getFriendStatus);
router.post('/:friendId/add',    requireAuth,  addFriendForChild);

// Catch-all — must be last
router.get('/:friendId', optionalAuth, getFriend);

export default router;
