import { UserRole } from '../entities/User.js';

export interface TokenPayload {
  userId: string;
  email: string;
  role: UserRole;
}

export interface GeneratedTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
}

export interface ITokenService {
  generateTokens(payload: TokenPayload): GeneratedTokens;
  verifyAccessToken(token: string): TokenPayload;
  verifyRefreshToken(token: string): TokenPayload;
}
