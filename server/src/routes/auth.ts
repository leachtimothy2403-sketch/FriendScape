import { Router } from 'express';
import {
  register,
  login,
  logout,
  refreshToken,
  forgotPassword,
  resetPassword,
  verifyEmail,
  childLogin,
  enroll,
  approve,
  decline,
  enrollmentStatus,
  simulateApprove,
} from '../controllers/auth.controller';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.post('/logout', requireAuth, logout);
router.post('/refresh', refreshToken);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.post('/verify-email', verifyEmail);

router.post('/child-login', childLogin);

router.post('/enroll', enroll);
router.get('/approve', approve);
router.get('/decline', decline);
router.get('/enrollment-status', enrollmentStatus);
router.post('/simulate-approve', simulateApprove);

export default router;
