import {
  ISecondaryPresenceStore,
  DriverLiveState
} from '../../../domain/interfaces/ISecondaryPresenceStore.js';
import { Coordinates } from '../../../domain/entities/Ride.js';
import { logger } from '../../logger/Logger.js';

/**
 * Proveedor de Datos 2 (RT-02: Almacén de Tiempo Real / Presencia / Eventos Efímeros)
 * Implementación de alto rendimiento para tracking continuo de geolocalización
 * y sockets activos sin sobrecargar la base de datos relacional transaccional.
 */
export class RedisOrMemoryPresenceStore implements ISecondaryPresenceStore {
  // Mapa de sockets conectados (UserId -> SocketId)
  private userSockets: Map<string, string> = new Map();

  // Mapa de ubicaciones en vivo de conductores (DriverId -> DriverLiveState)
  private driverLiveStates: Map<string, DriverLiveState> = new Map();

  public async setUserOnline(userId: string, socketId: string): Promise<void> {
    this.userSockets.set(userId, socketId);
    logger.debug(`[RT-02 SecondaryStore] Usuario online: ${userId} en socket ${socketId}`);
  }

  public async setUserOffline(userId: string): Promise<void> {
    this.userSockets.delete(userId);
    logger.debug(`[RT-02 SecondaryStore] Usuario offline: ${userId}`);
  }

  public async isUserOnline(userId: string): Promise<boolean> {
    return this.userSockets.has(userId);
  }

  public async getSocketId(userId: string): Promise<string | null> {
    return this.userSockets.get(userId) || null;
  }

  public async updateDriverLocation(driverId: string, location: Coordinates): Promise<void> {
    this.driverLiveStates.set(driverId, {
      driverId,
      isOnline: true,
      isAvailable: true,
      location,
      updatedAt: new Date().toISOString()
    });
  }

  public async getDriverLocation(driverId: string): Promise<Coordinates | null> {
    const state = this.driverLiveStates.get(driverId);
    return state ? state.location : null;
  }

  public async getAllLiveDrivers(): Promise<DriverLiveState[]> {
    return Array.from(this.driverLiveStates.values());
  }

  public async removeDriverLiveState(driverId: string): Promise<void> {
    this.driverLiveStates.delete(driverId);
  }

  public async ping(): Promise<boolean> {
    return true;
  }
}
