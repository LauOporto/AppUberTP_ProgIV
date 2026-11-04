import { Coordinates } from './Ride.js';

export interface DriverProfile {
  id: string;
  userId: string;
  vehicleModel: string;
  vehiclePlate: string;
  vehicleColor: string;
  licenseNumber: string;
  isOnline: boolean;
  isAvailable: boolean; // Si no está en viaje activo
  currentLocation?: Coordinates | null;
  lastLocationUpdate?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
