import { Router } from 'express';
import {
  getAlerts,
  markAlertRead,
  markAllAlertsRead,
  getChildActivity,
  getChildPosts,
  getChildMessages,
  getChildStats,
  getWeeklyReport,
  updateSettings,
} from '../controllers/parent.controller';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.use(requireAuth);

router.get('/alerts', getAlerts);
router.put('/alerts/read-all', markAllAlertsRead);
router.put('/alerts/:alertId/read', markAlertRead);
router.patch('/alerts/:alertId/read', markAlertRead);
router.get('/activity/:childId', getChildActivity);
router.get('/children/:childId/posts',    getChildPosts);
router.get('/children/:childId/messages', getChildMessages);
router.get('/children/:childId/stats',    getChildStats);
router.get('/report/:childId', getWeeklyReport);
router.put('/settings', updateSettings);

export default router;
