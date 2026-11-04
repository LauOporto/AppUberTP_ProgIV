import { Request, Response, NextFunction } from 'express';
import { AppError, ProblemDetails } from '../../domain/errors/ProblemDetails.js';
import { logger } from '../../infrastructure/logger/Logger.js';

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction
): void => {
  const correlationId = (req.headers['x-correlation-id'] as string) || undefined;

  let statusCode = 500;
  let code = 'INTERNAL_SERVER_ERROR';
  let type = 'https://api.uber-tpi.utn.edu.ar/errors/internal-error';
  let detail = 'Ocurrió un error inesperado en el servidor.';
  let title = 'Internal Server Error';
  let invalidParams: Array<{ name: string; reason: string }> | undefined;

  if (err instanceof AppError) {
    statusCode = err.statusCode;
    code = err.code;
    type = err.type;
    detail = err.message;
    title = err.name.replace(/Error$/, '');
    invalidParams = err.invalidParams;
  }

  // Logging estructurado (RT-10)
  logger.error(
    `[${req.method} ${req.originalUrl}] Error: ${err.message}`,
    err,
    'ErrorHandler',
    { statusCode, code, path: req.originalUrl },
    correlationId
  );

  const problemDetails: ProblemDetails = {
    type,
    title,
    status: statusCode,
    detail,
    instance: req.originalUrl,
    code,
    timestamp: new Date().toISOString(),
    ...(invalidParams && { invalidParams })
  };

  res.status(statusCode).json(problemDetails);
};

export const notFoundHandler = (req: Request, res: Response): void => {
  const problemDetails: ProblemDetails = {
    type: 'https://api.uber-tpi.utn.edu.ar/errors/not-found',
    title: 'Not Found',
    status: 404,
    detail: `La ruta '${req.originalUrl}' con método '${req.method}' no existe en esta API.`,
    instance: req.originalUrl,
    code: 'ROUTE_NOT_FOUND',
    timestamp: new Date().toISOString()
  };

  res.status(404).json(problemDetails);
};
