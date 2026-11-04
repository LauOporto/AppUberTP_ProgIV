import { Router } from 'express';
import { authController } from '../controllers/AuthController.js';
import { authenticateJwt } from '../middlewares/authMiddleware.js';
import { validateBody } from '../middlewares/requestValidator.js';
import { authRateLimiter } from '../middlewares/rateLimiter.js';
import {
  RegisterPassengerSchema,
  RegisterDriverSchema,
  LoginSchema,
  RefreshTokenSchema
} from '../../application/dtos/auth.dto.js';

const router = Router();

// Endpoints públicos de autenticación con rate limiting
router.post(
  '/register/passenger',
  authRateLimiter,
  validateBody(RegisterPassengerSchema),
  authController.registerPassenger
);

router.post(
  '/register/driver',
  authRateLimiter,
  validateBody(RegisterDriverSchema),
  authController.registerDriver
);

router.post(
  '/login',
  authRateLimiter,
  validateBody(LoginSchema),
  authController.login
);

router.post(
  '/refresh',
  validateBody(RefreshTokenSchema),
  authController.refreshToken
);

// Endpoints protegidos
router.get(
  '/me',
  authenticateJwt,
  authController.getProfile
);

export default router;
