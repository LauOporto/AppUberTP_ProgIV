import { Coordinates } from '../rides/fare.js';

/**
 * Puerto de la tarea pesada (§6.4, §6.6): recibe las ubicaciones de los choferes y responde
 * "¿qué choferes están cerca de este punto?". Cada adaptador elige su estructura de datos:
 * la versión ingenua (HT-02) y la optimizada (HT-03) implementan este mismo contrato,
 * así se pueden comparar cambiando solo la composición.
 */
export interface DriverPosition {
  driverId: string;
  location: Coordinates;
  reportedAt: Date;
}

export interface NearbyDriver extends DriverPosition {
  distanceMeters: number;
}

export interface NearbyQuery {
  origin: Coordinates;
  radiusMeters: number;
  limit: number;
  /** Posiciones más viejas que esto no cuentan: el chofer pudo haber cerrado la app. */
  maxAgeMs: number;
  now: Date;
}

export interface DriverLocationIndex {
  record(driverId: string, location: Coordinates, reportedAt: Date): Promise<void>;
  /** Ordenados del más cercano al más lejano. */
  findNearby(query: NearbyQuery): Promise<NearbyDriver[]>;
  /** Cantidad de entradas guardadas (para observar cuánto crece). */
  size(): number;
}
