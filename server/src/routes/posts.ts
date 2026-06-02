import { Router } from 'express';
import {
  generateDailyPosts,
  getFeed,
  createPost,
  reactToPost,
  getChildFeed,
  deletePost,
  likePost,
} from '../controllers/posts.controller';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.use(requireAuth);

// Child-session endpoints (childId from JWT)
router.post('/generate-daily', generateDailyPosts);
router.get('/feed', getFeed);
router.post('/', createPost);
router.post('/:postId/react', reactToPost);

// Legacy parent-dashboard endpoints
router.get('/feed/:childId', getChildFeed);
router.delete('/:postId', deletePost);
router.post('/:postId/like', likePost);

export default router;
