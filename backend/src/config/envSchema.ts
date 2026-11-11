import { z } from 'zod';

/**
 * Esquema de las variables de entorno (Bloque 3, puntos 1 y 2).
 *
 * - Ningún secreto ni URL de conexión tiene valor por defecto: si falta, el proceso no arranca.
 * - Solo los parámetros operativos "obvios" (puerto, ventanas de rate limit, costos) tienen default.
 * - Este módulo es puro: no lee process.env ni corta el proceso; eso lo hace environment.ts.
 */

const required = () =>
  z
    .string({ required_error: 'variable obligatoria no definida' })
    .trim()
    .min(1, 'variable obligatoria vacía');

const secret = () => required().min(32, 'debe tener al menos 32 caracteres');

const positiveInt = (defaultValue: number) => z.coerce.number().int().positive().default(defaultValue);

const duration = (defaultValue: string) =>
  z
    .string()
    .regex(/^\d+[smhd]$/, 'formato esperado: número + unidad (s, m, h, d), p. ej. 15m')
    .default(defaultValue);

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),

    // Lista separada por comas de orígenes permitidos. Nunca "*".
    CORS_ORIGIN: required()
      .transform(value => value.split(',').map(origin => origin.trim()).filter(Boolean))
      .pipe(z.array(z.string().url('cada origen debe ser una URL completa, p. ej. http://localhost:5173')).min(1)),

    JWT_SECRET: secret(),
    JWT_REFRESH_SECRET: secret(),
    JWT_ACCESS_EXPIRES_IN: duration('15m'),
    JWT_REFRESH_EXPIRES_IN: duration('7d'),

    DATABASE_URL: required().regex(/^postgres(ql)?:\/\/.+/, 'debe ser una URL de PostgreSQL (postgresql://...)'),
    REDIS_URL: required().regex(/^rediss?:\/\/.+/, 'debe ser una URL de Redis (redis://...)'),

    BCRYPT_COST: z.coerce.number().int().min(4).max(15).default(12),
    RATE_LIMIT_WINDOW_MS: positiveInt(900_000),
    RATE_LIMIT_MAX: positiveInt(100),
    // Intentos de login/registro/refresh por IP y ventana (antes estaba fijo en el código).
    AUTH_RATE_LIMIT_MAX: positiveInt(20),
    // Opcional: si se define, /metrics exige `Authorization: Bearer <token>`; si no, solo acepta loopback.
    METRICS_TOKEN: z.string().trim().min(16, 'debe tener al menos 16 caracteres').optional(),
    SHUTDOWN_TIMEOUT_MS: positiveInt(10_000)
  })
  .superRefine((env, ctx) => {
    if (env.JWT_SECRET === env.JWT_REFRESH_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['JWT_REFRESH_SECRET'],
        message: 'debe ser distinto de JWT_SECRET'
      });
    }
  });

export interface EnvironmentConfig {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  corsOrigins: string[];
  jwt: {
    secret: string;
    refreshSecret: string;
    accessExpiresIn: string;
    refreshExpiresIn: string;
  };
  database: { url: string };
  redis: { url: string };
  security: { bcryptCost: number };
  rateLimit: { windowMs: number; max: number; authMax: number };
  metrics: { token: string | undefined };
  shutdownTimeoutMs: number;
}

export interface ConfigIssue {
  variable: string;
  message: string;
}

export class ConfigValidationError extends Error {
  constructor(public readonly issues: ConfigIssue[]) {
    super(
      `Configuración de entorno inválida:\n${issues.map(issue => `  - ${issue.variable}: ${issue.message}`).join('\n')}`
    );
    this.name = 'ConfigValidationError';
  }
}

export function parseEnvironment(env: Record<string, string | undefined>): EnvironmentConfig {
  const result = EnvSchema.safeParse(env);

  if (!result.success) {
    // Un solo motivo por variable (el primero), para que el mensaje sea directo.
    const firstIssueByVariable = new Map<string, string>();
    for (const issue of result.error.issues) {
      const variable = String(issue.path[0] ?? '(desconocida)');
      if (!firstIssueByVariable.has(variable)) firstIssueByVariable.set(variable, issue.message);
    }
    throw new ConfigValidationError(
      [...firstIssueByVariable].map(([variable, message]) => ({ variable, message }))
    );
  }

  const e = result.data;
  return {
    nodeEnv: e.NODE_ENV,
    port: e.PORT,
    corsOrigins: e.CORS_ORIGIN,
    jwt: {
      secret: e.JWT_SECRET,
      refreshSecret: e.JWT_REFRESH_SECRET,
      accessExpiresIn: e.JWT_ACCESS_EXPIRES_IN,
      refreshExpiresIn: e.JWT_REFRESH_EXPIRES_IN
    },
    database: { url: e.DATABASE_URL },
    redis: { url: e.REDIS_URL },
    security: { bcryptCost: e.BCRYPT_COST },
    rateLimit: { windowMs: e.RATE_LIMIT_WINDOW_MS, max: e.RATE_LIMIT_MAX, authMax: e.AUTH_RATE_LIMIT_MAX },
    metrics: { token: e.METRICS_TOKEN },
    shutdownTimeoutMs: e.SHUTDOWN_TIMEOUT_MS
  };
}
