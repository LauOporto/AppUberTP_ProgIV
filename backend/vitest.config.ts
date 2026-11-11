import { defineConfig } from 'vitest/config';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { resolveTestDatabaseUrl } from './tests/helpers/testDatabaseUrl.js';

// Credenciales de la base local (o de docker compose) desde el .env de la raíz.
dotenv.config({ path: fileURLToPath(new URL('../.env', import.meta.url)), quiet: true } as dotenv.DotenvConfigOptions);

const testDatabaseUrl = resolveTestDatabaseUrl();

/**
 * Variables de entorno de PRUEBA. Los secretos son falsos y solo existen acá.
 * DATABASE_URL apunta SIEMPRE a la base "<nombre>_test", nunca a la de desarrollo.
 */
export default defineConfig({
  test: {
    globalSetup: ['./tests/setup/globalSetup.ts'],
    // Los tests de integración comparten la base de tests: se ejecutan de a un archivo por vez.
    fileParallelism: false,
    env: {
      NODE_ENV: 'test',
      CORS_ORIGIN: 'http://localhost:5173',
      JWT_SECRET: 'test_only_jwt_secret_not_used_anywhere_else_000',
      JWT_REFRESH_SECRET: 'test_only_refresh_secret_not_used_anywhere_else',
      DATABASE_URL: testDatabaseUrl,
      TEST_DATABASE_URL: testDatabaseUrl,
      REDIS_URL: 'redis://localhost:6379',
      BCRYPT_COST: '4'
    }
  }
});
