import { Coordinates } from '../entities/Ride.js';

export interface DriverLiveState {
  driverId: string;
  isOnline: boolean;
  isAvailable: boolean;
  location: Coordinates;
  updatedAt: string;
}

/**
 * RT-02: Segundo proveedor de datos (Memoria / Redis / NoSQL)
 * Responsabilidad: Almacenar estado efímero de alta concurrencia:
 * - Presencia de usuarios en tiempo real (Sockets conectados)
 * - Coordenadas GPS en vivo de conductores
 * - Despacho de eventos de matchmaking
 */
export interface ISecondaryPresenceStore {
  // Presencia de usuarios
  setUserOnline(userId: string, socketId: string): Promise<void>;
  setUserOffline(userId: string): Promise<void>;
  isUserOnline(userId: string): Promise<boolean>;
  getSocketId(userId: string): Promise<string | null>;

  // Ubicación de conductores en tiempo real
  updateDriverLocation(driverId: string, location: Coordinates): Promise<void>;
  getDriverLocation(driverId: string): Promise<Coordinates | null>;
  getAllLiveDrivers(): Promise<DriverLiveState[]>;
  removeDriverLiveState(driverId: string): Promise<void>;

  // Diagnóstico del proveedor (RT-10)
  ping(): Promise<boolean>;
}
