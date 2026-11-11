import { RideStatus } from './rideStateMachine.js';

/**
 * Viaje según el modelo nuevo (montos en centavos, distancias en metros).
 * Reemplaza a `domain/entities/Ride.ts` (legado, en memoria) a medida que se migran los casos de uso.
 */
export interface Ride {
  id: string;
  passengerId: string;
  driverId: string | null;
  status: RideStatus;
  estimatedDistanceMeters: number;
  estimatedDurationSeconds: number;
  estimatedFareCents: number;
  version: number;
  requestedAt: Date;
  assignedAt: Date | null;
}
