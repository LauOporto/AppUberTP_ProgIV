export type RideStatus =
  | 'REQUESTED'       // Pasajero solicitó el viaje, buscando conductor
  | 'ACCEPTED'        // Conductor aceptó el viaje, va en camino al origen
  | 'DRIVER_ARRIVED'  // Conductor llegó al punto de recogida
  | 'IN_PROGRESS'     // Viaje en curso con pasajero a bordo
  | 'COMPLETED'       // Viaje finalizado con éxito
  | 'CANCELLED';      // Viaje cancelado por pasajero o conductor

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface Ride {
  id: string;
  passengerId: string;
  driverId?: string | null;
  status: RideStatus;
  
  // Origen y Destino
  originAddress: string;
  originLocation: Coordinates;
  destinationAddress: string;
  destinationLocation: Coordinates;

  // Detalles económicos y de estimación
  estimatedDistanceKm: number;
  estimatedDurationMin: number;
  fareAmount: number;

  // Trazabilidad temporal
  requestedAt: Date;
  acceptedAt?: Date | null;
  startedAt?: Date | null;
  completedAt?: Date | null;
  cancelledAt?: Date | null;
  cancellationReason?: string | null;

  createdAt: Date;
  updatedAt: Date;
}
