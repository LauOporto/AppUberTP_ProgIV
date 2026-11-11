import { describe, it, expect } from 'vitest';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { ConfigValidationError, parseEnvironment } from '../../src/config/envSchema.js';

const VALID_ENV = {
  CORS_ORIGIN: 'http://localhost:5173',
  JWT_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379'
};

function issuesFor(env: Record<string, string | undefined>) {
  try {
    parseEnvironment(env);
  } catch (error) {
    if (error instanceof ConfigValidationError) return error.issues;
    throw error;
  }
  throw new Error('Se esperaba ConfigValidationError');
}

describe('Validación de variables de entorno (B3-01, B3-02)', () => {
  it('con las variables obligatorias arranca y aplica los defaults operativos', () => {
    const config = parseEnvironment(VALID_ENV);

    expect(config.port).toBe(3000);
    expect(config.security.bcryptCost).toBe(12);
    expect(config.corsOrigins).toEqual(['http://localhost:5173']);
    expect(config.jwt.accessExpiresIn).toBe('15m');
  });

  it.each(['JWT_SECRET', 'JWT_REFRESH_SECRET', 'DATABASE_URL', 'REDIS_URL', 'CORS_ORIGIN'])(
    'si falta %s, el error nombra exactamente esa variable',
    variable => {
      const env: Record<string, string | undefined> = { ...VALID_ENV, [variable]: undefined };
      expect(issuesFor(env).map(issue => issue.variable)).toEqual([variable]);
    }
  );

  it('una variable definida pero vacía cuenta como faltante', () => {
    expect(issuesFor({ ...VALID_ENV, JWT_SECRET: '' })[0]).toMatchObject({ variable: 'JWT_SECRET' });
  });

  it('rechaza secretos cortos y secretos iguales', () => {
    expect(issuesFor({ ...VALID_ENV, JWT_SECRET: 'corto' })[0].variable).toBe('JWT_SECRET');
    expect(issuesFor({ ...VALID_ENV, JWT_REFRESH_SECRET: VALID_ENV.JWT_SECRET })[0]).toMatchObject({
      variable: 'JWT_REFRESH_SECRET',
      message: 'debe ser distinto de JWT_SECRET'
    });
  });

  it('rechaza una base que no es PostgreSQL (p. ej. el SQLite del scaffold)', () => {
    expect(issuesFor({ ...VALID_ENV, DATABASE_URL: 'file:./dev.db' })[0].variable).toBe('DATABASE_URL');
  });

  it('rechaza valores con tipo inválido', () => {
    const issues = issuesFor({ ...VALID_ENV, PORT: 'abc', BCRYPT_COST: '99' });
    expect(issues.map(issue => issue.variable).sort()).toEqual(['BCRYPT_COST', 'PORT']);
  });

  it('acepta varios orígenes CORS separados por coma y rechaza "*"', () => {
    expect(parseEnvironment({ ...VALID_ENV, CORS_ORIGIN: 'http://a.com, http://b.com' }).corsOrigins).toEqual([
      'http://a.com',
      'http://b.com'
    ]);
    expect(issuesFor({ ...VALID_ENV, CORS_ORIGIN: '*' })[0].variable).toBe('CORS_ORIGIN');
  });

  it('informa todas las variables con problemas a la vez, no solo la primera', () => {
    expect(issuesFor({}).map(issue => issue.variable).sort()).toEqual(
      ['CORS_ORIGIN', 'DATABASE_URL', 'JWT_REFRESH_SECRET', 'JWT_SECRET', 'REDIS_URL']
    );
  });
});

describe('Arranque del proceso con configuración inválida (demostración B3-07)', () => {
  it('termina con código distinto de cero y un mensaje que nombra la variable', () => {
    const backendDir = fileURLToPath(new URL('../..', import.meta.url));

    // JWT_SECRET vacío: dotenv no pisa variables ya definidas, así que el .env local no interfiere.
    const result = spawnSync(process.execPath, ['--import', 'tsx', 'src/config/environment.ts'], {
      cwd: backendDir,
      env: { ...process.env, ...VALID_ENV, JWT_SECRET: '' },
      encoding: 'utf8',
      timeout: 20_000
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('JWT_SECRET');
  });
});
