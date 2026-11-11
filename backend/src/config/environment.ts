import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { ConfigValidationError, EnvironmentConfig, parseEnvironment } from './envSchema.js';

export type { EnvironmentConfig } from './envSchema.js';

/**
 * Carga y valida la configuración UNA vez, al importar este módulo.
 *
 * Orden de lectura (dotenv nunca pisa variables que ya existen en el entorno):
 *   1. variables reales del proceso (docker compose, CI, terminal),
 *   2. `.env` del directorio de trabajo,
 *   3. `.env` de la raíz del repositorio (el que se crea con `cp .env.example .env`).
 *
 * Si algo falta o es inválido, se informa QUÉ variable y el proceso termina con código 1:
 * nunca arranca a medias.
 */
dotenv.config({ quiet: true } as dotenv.DotenvConfigOptions);
dotenv.config({
  path: fileURLToPath(new URL('../../../.env', import.meta.url)),
  quiet: true
} as dotenv.DotenvConfigOptions);

function loadConfigOrExit(): EnvironmentConfig {
  try {
    return parseEnvironment(process.env);
  } catch (error) {
    if (error instanceof ConfigValidationError) {
      console.error(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          level: 'fatal',
          context: 'Config',
          message: 'Configuración de entorno inválida: el servidor no se inicia',
          issues: error.issues
        })
      );
      console.error(`\n${error.message}\nRevisá el archivo .env (podés partir de .env.example).\n`);
      process.exit(1);
    }
    throw error;
  }
}

export const config: EnvironmentConfig = loadConfigOrExit();
