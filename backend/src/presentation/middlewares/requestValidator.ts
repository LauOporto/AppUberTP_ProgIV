import { Request, Response, NextFunction } from 'express';
import { AnyZodObject, ZodError } from 'zod';
import { ValidationError } from '../../domain/errors/ProblemDetails.js';

export const validateBody = (schema: AnyZodObject) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      req.body = await schema.parseAsync(req.body);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const invalidParams = error.errors.map(err => ({
          name: err.path.join('.'),
          reason: err.message
        }));
        next(new ValidationError('Datos de la petición inválidos', invalidParams));
      } else {
        next(error);
      }
    }
  };
};

export const validateQuery = (schema: AnyZodObject) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      req.query = await schema.parseAsync(req.query);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const invalidParams = error.errors.map(err => ({
          name: err.path.join('.'),
          reason: err.message
        }));
        next(new ValidationError('Parámetros de consulta inválidos', invalidParams));
      } else {
        next(error);
      }
    }
  };
};
