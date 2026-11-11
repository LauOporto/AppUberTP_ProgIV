import { timingSafeEqual } from 'crypto';

/**
 * ¿Quién puede leer /metrics? Las métricas internas (memoria, carga) le sirven a un atacante para medir el
 * efecto de sus pedidos, así que no son públicas:
 *   - si METRICS_TOKEN está definido → hace falta `Authorization: Bearer <METRICS_TOKEN>`;
 *   - si no está definido → solo pedidos desde la propia máquina (loopback).
 */
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

export function isMetricsRequestAllowed(params: {
  ip: string | undefined;
  authorizationHeader: string | undefined;
  configuredToken: string | undefined;
}): boolean {
  const { ip, authorizationHeader, configuredToken } = params;

  if (configuredToken) {
    const expected = Buffer.from(`Bearer ${configuredToken}`);
    const received = Buffer.from(authorizationHeader ?? '');
    // Comparación en tiempo constante: no filtra cuántos caracteres coinciden.
    return expected.length === received.length && timingSafeEqual(expected, received);
  }

  return ip !== undefined && LOOPBACK.has(ip);
}
