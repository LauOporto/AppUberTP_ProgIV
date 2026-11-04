import jwt from 'jsonwebtoken';
import { ITokenService, TokenPayload, GeneratedTokens } from '../../domain/interfaces/ITokenService.js';
import { UnauthorizedError } from '../../domain/errors/ProblemDetails.js';
import { config } from '../../config/environment.js';

export class JwtTokenService implements ITokenService {
  public generateTokens(payload: TokenPayload): GeneratedTokens {
    const accessToken = jwt.sign(
      {
        sub: payload.userId,
        email: payload.email,
        role: payload.role
      },
      config.jwt.secret,
      { expiresIn: config.jwt.accessExpiresIn as jwt.SignOptions['expiresIn'] }
    );

    const refreshToken = jwt.sign(
      {
        sub: payload.userId,
        email: payload.email,
        role: payload.role
      },
      config.jwt.refreshSecret,
      { expiresIn: config.jwt.refreshExpiresIn as jwt.SignOptions['expiresIn'] }
    );

    return {
      accessToken,
      refreshToken,
      expiresIn: config.jwt.accessExpiresIn
    };
  }

  public verifyAccessToken(token: string): TokenPayload {
    try {
      const decoded = jwt.verify(token, config.jwt.secret) as jwt.JwtPayload;
      return {
        userId: decoded.sub as string,
        email: decoded.email,
        role: decoded.role
      };
    } catch {
      throw new UnauthorizedError('Token de acceso inválido o expirado');
    }
  }

  public verifyRefreshToken(token: string): TokenPayload {
    try {
      const decoded = jwt.verify(token, config.jwt.refreshSecret) as jwt.JwtPayload;
      return {
        userId: decoded.sub as string,
        email: decoded.email,
        role: decoded.role
      };
    } catch {
      throw new UnauthorizedError('Token de refresco inválido o expirado');
    }
  }
}
