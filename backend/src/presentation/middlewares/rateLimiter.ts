import rateLimit from 'express-rate-limit';
import { config } from '../../config/environment.js';

/**
 * RT-04: Rate Limiting para protección contra abuso y DoS
 */
export const apiRateLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    type: 'https://api.uber-tpi.utn.edu.ar/errors/rate-limit-exceeded',
    title: 'Too Many Requests',
    status: 429,
    detail: 'Has excedido el límite permitido de solicitudes. Intenta más tarde.',
    code: 'RATE_LIMIT_EXCEEDED',
    timestamp: new Date().toISOString()
  }
});

export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 20, // 20 intentos de login/registro
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    type: 'https://api.uber-tpi.utn.edu.ar/errors/too-many-auth-attempts',
    title: 'Too Many Auth Requests',
    status: 429,
    detail: 'Demasiados intentos de autenticación. Por favor aguarde 15 minutos.',
    code: 'AUTH_RATE_LIMIT_EXCEEDED',
    timestamp: new Date().toISOString()
  }
});
