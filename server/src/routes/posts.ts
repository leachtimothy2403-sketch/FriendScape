import { Router } from 'express';
import {
  generateDailyPosts,
  getFeed,
  createPost,
  reactToPost,
  getPostComments,
  addComment,
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
router.get('/:postId/comments', getPostComments);
router.post('/:postId/comments', addComment);

// Legacy parent-dashboard endpoints
router.get('/feed/:childId', getChildFeed);
router.delete('/:postId', deletePost);
router.post('/:postId/like', likePost);

export default router;
