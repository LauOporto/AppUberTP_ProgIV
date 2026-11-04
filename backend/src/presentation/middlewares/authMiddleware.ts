import { Request, Response, NextFunction } from 'express';
import { UnauthorizedError } from '../../domain/errors/ProblemDetails.js';
import { container } from '../../infrastructure/di/container.js';
import { TokenPayload } from '../../domain/interfaces/ITokenService.js';

// Extender Express Request para incluir el usuario autenticado
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: TokenPayload;
    }
  }
}

export const authenticateJwt = (req: Request, res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new UnauthorizedError('Cabecera Authorization ausente o formato Bearer inválido');
  }

  const token = authHeader.split(' ')[1];
  try {
    const payload = container.tokenService.verifyAccessToken(token);
    req.user = payload;
    next();
  } catch {
    throw new UnauthorizedError('Token JWT inválido o expirado');
  }
};
