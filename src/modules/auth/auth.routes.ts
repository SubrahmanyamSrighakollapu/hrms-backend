import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { env } from '../../config/env';
import { authenticate, optionalAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import * as authController from './auth.controller';
import { loginSchema, logoutSchema, refreshSchema, registerSchema } from './auth.validation';

const router = Router();

/** Stricter limiter for credential endpoints to slow down brute force attempts. */
const authLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many attempts, please try again later' },
});

router.post('/register', authLimiter, validate(registerSchema), authController.register);
router.post('/login', authLimiter, validate(loginSchema), authController.login);
router.post('/refresh', authLimiter, validate(refreshSchema), authController.refresh);
// Logout tolerates an expired access token: the refresh token can revoke too.
router.post('/logout', optionalAuth, validate(logoutSchema), authController.logout);
router.get('/me', authenticate, authController.me);

export default router;
