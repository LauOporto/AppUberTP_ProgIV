import { UnitOfWork } from '../../domain/ports/unitOfWork.js';
import { Clock } from '../../domain/ports/clock.js';
import { Ride } from '../../domain/rides/ride.js';
import { assertTransition } from '../../domain/rides/rideStateMachine.js';
import { DomainError } from '../../domain/errors/DomainError.js';

export interface AcceptRideCommand {
  driverId: string;
  rideId: string;
}

/**
 * Un chofer acepta un viaje (problema central, enunciado §6.3).
 *
 * Invariantes que protege:
 *   1. Un viaje queda asignado a UN solo chofer.
 *   2. Un chofer tiene UN solo viaje activo.
 *
 * Cómo: todo ocurre en una unidad de trabajo que reserva los dos recursos SIEMPRE en el mismo orden:
 *   primero el viaje, después el chofer.
 * - Si 50 choferes aceptan el mismo viaje, los 50 hacen fila en el lock del viaje. El primero lo pasa a
 *   ASSIGNED y confirma; los demás, al obtener el lock, leen el estado YA confirmado y reciben RIDE_NOT_AVAILABLE.
 * - Si un chofer acepta dos viajes a la vez, los dos pedidos hacen fila en el lock de ESE chofer: el segundo
 *   lo ve BUSY y recibe DRIVER_NOT_AVAILABLE.
 * - Todos los casos de uso que toquen viaje y chofer (aceptar, cancelar, finalizar) deben respetar el orden
 *   viaje → chofer: si uno tomara chofer → viaje, dos operaciones podrían esperarse mutuamente (interbloqueo).
 *
 * TODO(TAR-03): cuando existan las ofertas, exigir además una oferta PENDING y vigente para este chofer.
 */
export class AcceptRide {
  constructor(
    private readonly unitOfWork: UnitOfWork,
    private readonly clock: Clock
  ) {}

  async execute({ driverId, rideId }: AcceptRideCommand): Promise<Ride> {
    return this.unitOfWork.run(async ({ rides, drivers, rideHistory }) => {
      // 1) Lock del VIAJE (siempre primero).
      const ride = await rides.findByIdForUpdate(rideId);
      if (!ride) {
        throw new DomainError('RIDE_NOT_FOUND', 'El viaje no existe', { rideId });
      }

      // 2) Lock del CHOFER (siempre segundo).
      const driver = await drivers.findByUserIdForUpdate(driverId);
      if (!driver) {
        throw new DomainError('DRIVER_NOT_FOUND', 'El usuario no tiene perfil de chofer', { driverId });
      }
      if (driver.approvalStatus !== 'APPROVED') {
        throw new DomainError('DRIVER_NOT_APPROVED', 'El chofer todavía no está habilitado por la administración', {
          driverId,
          approvalStatus: driver.approvalStatus
        });
      }

      // 3) Verificaciones sobre el estado YA bloqueado: nadie puede cambiarlo hasta que terminemos.
      if (ride.status !== 'REQUESTED') {
        throw new DomainError('RIDE_NOT_AVAILABLE', 'El viaje ya no está disponible', {
          rideId,
          status: ride.status
        });
      }
      if (driver.availability !== 'AVAILABLE') {
        throw new DomainError('DRIVER_NOT_AVAILABLE', 'El chofer no está disponible para tomar un viaje', {
          driverId,
          availability: driver.availability
        });
      }
      assertTransition(ride.status, 'ASSIGNED', 'DRIVER');

      // 4) Escrituras: se confirman juntas o ninguna.
      const now = this.clock.now();
      const assigned = await rides.assignDriver(rideId, driverId, now);
      await drivers.setAvailability(driverId, 'BUSY');
      await rideHistory.record({
        rideId,
        from: ride.status,
        to: 'ASSIGNED',
        actorId: driverId,
        actorRole: 'DRIVER',
        at: now
      });

      return assigned;
    });
  }
}
