import dotenv from 'dotenv';
import path from 'path';

// Cargar variables de entorno según NODE_ENV o defecto
const nodeEnv = process.env.NODE_ENV || 'development';
dotenv.config({ path: path.resolve(process.cwd(), `.env.${nodeEnv}`) });
dotenv.config(); // Fallback a .env estándar

export interface EnvironmentConfig {
  nodeEnv: string;
  port: number;
  corsOrigin: string;
  jwt: {
    secret: string;
    refreshSecret: string;
    accessExpiresIn: string;
    refreshExpiresIn: string;
  };
  database: {
    url: string;
  };
  redis: {
    url: string;
  };
  rateLimit: {
    windowMs: number;
    max: number;
  };
}

export const config: EnvironmentConfig = {
  nodeEnv,
  port: parseInt(process.env.PORT || '3000', 10),
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  jwt: {
    secret: process.env.JWT_SECRET || 'dev_jwt_secret_change_in_production_prog4',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'dev_refresh_secret_change_in_production_prog4',
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d'
  },
  database: {
    url: process.env.DATABASE_URL || 'file:./dev.db'
  },
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379'
  },
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10), // 15 minutos
    max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10)
  }
};
