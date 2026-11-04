import { Request, Response, NextFunction } from 'express';
import { UserRole } from '../../domain/entities/User.js';
import { ForbiddenError, UnauthorizedError } from '../../domain/errors/ProblemDetails.js';

export const requireRoles = (...allowedRoles: UserRole[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw new UnauthorizedError('Debes estar autenticado para acceder');
    }

    if (!allowedRoles.includes(req.user.role)) {
      throw new ForbiddenError(
        `Permiso denegado. Se requiere uno de los siguientes roles: ${allowedRoles.join(', ')}`
      );
    }

    next();
  };
};
