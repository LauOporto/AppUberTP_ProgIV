import { DriverLocationIndex, DriverPosition, NearbyDriver, NearbyQuery } from '../../domain/ports/driverLocationIndex.js';
import { Coordinates, haversineDistanceMeters } from '../../domain/rides/fare.js';

/**
 * VERSIÓN INGENUA de la tarea pesada (HT-02, Bloque 7). Escrita así A PROPÓSITO, para tener con qué comparar.
 *
 * - `record`: agrega cada reporte a un arreglo que solo crece (nunca se purga).
 * - `findNearby`: recorre TODO el arreglo para reconstruir la última posición de cada chofer, calcula la
 *   distancia a todos en JavaScript y ordena la lista completa.
 *
 * Problemas que se esperan (ver docs/mediciones.md §1.2):
 * - Costo de cada búsqueda O(reportes recibidos), no O(choferes): con 500 choferes cada 2 s son ~250 entradas/s,
 *   ~15 000 por minuto. Todo ese recorrido es código SINCRÓNICO: mientras dura, el event loop no atiende a nadie.
 * - Memoria que crece sin límite.
 *
 * NO usar fuera de la medición.
 */
export class NaiveLocationLog implements DriverLocationIndex {
  private readonly log: DriverPosition[] = [];

  async record(driverId: string, location: Coordinates, reportedAt: Date): Promise<void> {
    this.log.push({ driverId, location: { latitude: location.latitude, longitude: location.longitude }, reportedAt });
  }

  async findNearby({ origin, radiusMeters, limit, maxAgeMs, now }: NearbyQuery): Promise<NearbyDriver[]> {
    // 1) Última posición de cada chofer: recorrido completo del log.
    const latest = new Map<string, DriverPosition>();
    for (const entry of this.log) {
      const previous = latest.get(entry.driverId);
      if (!previous || entry.reportedAt >= previous.reportedAt) {
        latest.set(entry.driverId, entry);
      }
    }

    // 2) Distancia a TODOS los choferes en JavaScript.
    const oldestAllowed = now.getTime() - maxAgeMs;
    const candidates: NearbyDriver[] = [];
    for (const position of latest.values()) {
      if (position.reportedAt.getTime() < oldestAllowed) continue;
      const distanceMeters = haversineDistanceMeters(origin, position.location);
      if (distanceMeters <= radiusMeters) {
        candidates.push({ ...position, distanceMeters });
      }
    }

    // 3) Orden completo, aunque solo se usen los primeros `limit`.
    candidates.sort((a, b) => a.distanceMeters - b.distanceMeters);
    return candidates.slice(0, limit);
  }

  size(): number {
    return this.log.length;
  }
}
