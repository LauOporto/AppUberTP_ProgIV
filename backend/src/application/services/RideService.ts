import { IRideRepository, PaginationOptions, PaginatedResult } from '../../domain/interfaces/IRideRepository.js';
import { IUserRepository } from '../../domain/interfaces/IUserRepository.js';
import { ISecondaryPresenceStore } from '../../domain/interfaces/ISecondaryPresenceStore.js';
import { Ride, RideStatus, Coordinates } from '../../domain/entities/Ride.js';
import { CreateRideDto, EstimateFareDto, UpdateRideStatusDto } from '../dtos/ride.dto.js';
import { ConflictError, NotFoundError, ForbiddenError, BadRequestError } from '../../domain/errors/ProblemDetails.js';
import { DriverLocationIndex } from '../../domain/ports/driverLocationIndex.js';

/** Parámetros de la búsqueda de candidatos para la cotización. */
const PICKUP_SEARCH = { radiusMeters: 5_000, limit: 10, maxAgeMs: 30_000, averageSpeedKmh: 30 };

export class RideService {
  private readonly BASE_FARE = 1200; // Tarifa base en ARS
  private readonly RATE_PER_KM = 350;  // Tarifa por km en ARS
  private readonly RATE_PER_MIN = 80;  // Tarifa por minuto estimado

  constructor(
    private readonly rideRepository: IRideRepository,
    private readonly userRepository: IUserRepository,
    private readonly presenceStore: ISecondaryPresenceStore,
    private readonly locationIndex: DriverLocationIndex
  ) {}

  /**
   * Cotización + choferes cercanos (tiempo estimado hasta que llegue el chofer más cercano).
   * La búsqueda de candidatos es la parte "pesada" que se mide en la tarea pesada (§6.6).
   */
  public async estimateWithPickup(dto: EstimateFareDto) {
    const estimate = this.estimateFare(dto);
    const nearby = await this.locationIndex.findNearby({
      origin: dto.originLocation,
      radiusMeters: PICKUP_SEARCH.radiusMeters,
      limit: PICKUP_SEARCH.limit,
      maxAgeMs: PICKUP_SEARCH.maxAgeMs,
      now: new Date()
    });
    const nearest = nearby[0];
    return {
      ...estimate,
      pickup: {
        nearbyDrivers: nearby.length,
        nearestDriverMeters: nearest?.distanceMeters ?? null,
        nearestDriverEtaMinutes: nearest
          ? Math.max(1, Math.round(nearest.distanceMeters / ((PICKUP_SEARCH.averageSpeedKmh * 1000) / 60)))
          : null
      }
    };
  }

  public calculateDistanceKm(c1: Coordinates, c2: Coordinates): number {
    const R = 6371; // Radio de la Tierra en km
    const dLat = ((c2.latitude - c1.latitude) * Math.PI) / 180;
    const dLon = ((c2.longitude - c1.longitude) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((c1.latitude * Math.PI) / 180) *
        Math.cos((c2.latitude * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.max(0.5, Math.round(R * c * 10) / 10);
  }

  public estimateFare(dto: EstimateFareDto): {
    distanceKm: number;
    estimatedMinutes: number;
    fareAmount: number;
  } {
    const distanceKm = this.calculateDistanceKm(dto.originLocation, dto.destinationLocation);
    // Estimación aproximada: 2.5 minutos por km + 3 minutos de espera/tránsito
    const estimatedMinutes = Math.max(5, Math.round(distanceKm * 2.5 + 3));
    const fareAmount = Math.round(
      this.BASE_FARE + distanceKm * this.RATE_PER_KM + estimatedMinutes * this.RATE_PER_MIN
    );

    return {
      distanceKm,
      estimatedMinutes,
      fareAmount
    };
  }

  public async requestRide(passengerId: string, dto: CreateRideDto): Promise<Ride> {
    const active = await this.rideRepository.findActiveRideByUserId(passengerId);
    if (active) {
      throw new ConflictError('Ya posees un viaje activo en curso');
    }

    const { distanceKm, estimatedMinutes, fareAmount } = this.estimateFare({
      originLocation: dto.originLocation,
      destinationLocation: dto.destinationLocation
    });

    return this.rideRepository.create({
      passengerId,
      status: 'REQUESTED',
      originAddress: dto.originAddress,
      originLocation: dto.originLocation,
      destinationAddress: dto.destinationAddress,
      destinationLocation: dto.destinationLocation,
      estimatedDistanceKm: distanceKm,
      estimatedDurationMin: estimatedMinutes,
      fareAmount,
      requestedAt: new Date()
    });
  }

  public async acceptRide(driverId: string, rideId: string): Promise<Ride> {
    const driverProfile = await this.userRepository.findDriverProfileByUserId(driverId);
    if (!driverProfile) {
      throw new ForbiddenError('Solo conductores habilitados pueden aceptar viajes');
    }

    const activeRide = await this.rideRepository.findActiveRideByUserId(driverId);
    if (activeRide) {
      throw new ConflictError('Ya te encuentras asignado a otro viaje en curso');
    }

    const ride = await this.rideRepository.findById(rideId);
    if (!ride) {
      throw new NotFoundError('El viaje solicitado no existe');
    }

    if (ride.status !== 'REQUESTED') {
      throw new ConflictError('El viaje ya no está disponible para ser tomado');
    }

    const updated = await this.rideRepository.update(rideId, {
      driverId,
      status: 'ACCEPTED',
      acceptedAt: new Date()
    });

    if (!updated) {
      throw new NotFoundError('Error al actualizar el estado del viaje');
    }

    // Actualizar disponibilidad del conductor en ambos proveedores
    await this.userRepository.updateDriverProfile(driverId, { isAvailable: false });

    return updated;
  }

  public async updateRideStatus(
    userId: string,
    rideId: string,
    dto: UpdateRideStatusDto
  ): Promise<Ride> {
    const ride = await this.rideRepository.findById(rideId);
    if (!ride) {
      throw new NotFoundError('Viaje no encontrado');
    }

    // Comprobar que el usuario pertenece al viaje (pasajero o conductor)
    const isPassenger = ride.passengerId === userId;
    const isDriver = ride.driverId === userId;

    if (!isPassenger && !isDriver) {
      throw new ForbiddenError('No tienes permisos para modificar este viaje');
    }

    const updates: Partial<Ride> = {
      status: dto.status
    };

    if (dto.status === 'IN_PROGRESS') {
      updates.startedAt = new Date();
    } else if (dto.status === 'COMPLETED') {
      updates.completedAt = new Date();
      if (ride.driverId) {
        await this.userRepository.updateDriverProfile(ride.driverId, { isAvailable: true });
      }
    } else if (dto.status === 'CANCELLED') {
      updates.cancelledAt = new Date();
      updates.cancellationReason = dto.cancellationReason || 'Cancelado por usuario';
      if (ride.driverId) {
        await this.userRepository.updateDriverProfile(ride.driverId, { isAvailable: true });
      }
    }

    const updated = await this.rideRepository.update(rideId, updates);
    if (!updated) {
      throw new NotFoundError('No se pudo actualizar el viaje');
    }

    return updated;
  }

  public async getActiveRide(userId: string): Promise<Ride | null> {
    return this.rideRepository.findActiveRideByUserId(userId);
  }

  public async getPendingRidesForDrivers(): Promise<Ride[]> {
    return this.rideRepository.findPendingRides();
  }

  public async getUserRides(userId: string, options: PaginationOptions): Promise<PaginatedResult<Ride>> {
    return this.rideRepository.findByUserId(userId, options);
  }

  public async getRideById(rideId: string, userId: string): Promise<Ride> {
    const ride = await this.rideRepository.findById(rideId);
    if (!ride) {
      throw new NotFoundError('Viaje no encontrado');
    }
    if (ride.passengerId !== userId && ride.driverId !== userId) {
      throw new ForbiddenError('No tienes autorización para consultar los detalles de este viaje');
    }
    return ride;
  }
}
