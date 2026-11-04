import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { logger } from '../../infrastructure/logger/Logger.js';

export const requestLogger = (req: Request, res: Response, next: NextFunction): void => {
  // Asegurar Correlation ID para trazabilidad distribuida (RT-10)
  const correlationId = (req.headers['x-correlation-id'] as string) || crypto.randomUUID();
  req.headers['x-correlation-id'] = correlationId;
  res.setHeader('X-Correlation-ID', correlationId);

  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info(
      `${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms`,
      'HTTP',
      {
        method: req.method,
        url: req.originalUrl,
        statusCode: res.statusCode,
        durationMs: duration,
        ip: req.ip
      },
      correlationId
    );
  });

  next();
};
