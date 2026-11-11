import { ISecondaryPresenceStore } from '../../domain/interfaces/ISecondaryPresenceStore.js';
import { IUserRepository } from '../../domain/interfaces/IUserRepository.js';
import { Coordinates } from '../../domain/entities/Ride.js';
import { NotFoundError } from '../../domain/errors/ProblemDetails.js';
import { DriverLocationIndex } from '../../domain/ports/driverLocationIndex.js';

export class DriverLocationService {
  constructor(
    private readonly presenceStore: ISecondaryPresenceStore,
    private readonly userRepository: IUserRepository,
    private readonly locationIndex: DriverLocationIndex
  ) {}

  public async updateLocation(driverId: string, location: Coordinates): Promise<void> {
    // 1. Guardar en tiempo real en proveedor secundario (Redis/Memoria de alta velocidad) - RT-02
    await this.presenceStore.updateDriverLocation(driverId, location);

    // Índice de la tarea pesada: de acá sale la búsqueda de choferes cercanos.
    await this.locationIndex.record(driverId, location, new Date());

    // 2. Opcional: Actualizar snapshot en base de datos primaria
    await this.userRepository.updateDriverProfile(driverId, {
      currentLocation: location,
      lastLocationUpdate: new Date()
    });
  }

  public async toggleOnline(driverId: string, isOnline: boolean): Promise<void> {
    const profile = await this.userRepository.findDriverProfileByUserId(driverId);
    if (!profile) {
      throw new NotFoundError('Perfil de conductor no encontrado');
    }

    await this.userRepository.updateDriverProfile(driverId, {
      isOnline,
      isAvailable: isOnline
    });

    if (!isOnline) {
      await this.presenceStore.removeDriverLiveState(driverId);
    }
  }

  public async getAvailableLiveDrivers() {
    return this.presenceStore.getAllLiveDrivers();
  }
}
