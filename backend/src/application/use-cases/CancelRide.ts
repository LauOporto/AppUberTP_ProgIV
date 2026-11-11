import { UnitOfWork } from '../../domain/ports/unitOfWork.js';
import { Clock } from '../../domain/ports/clock.js';
import { Ride } from '../../domain/rides/ride.js';
import { assertTransition, cancellationStatusFor } from '../../domain/rides/rideStateMachine.js';
import { DomainError } from '../../domain/errors/DomainError.js';

export interface CancelRideCommand {
  rideId: string;
  actorId: string;
  actorRole: 'PASSENGER' | 'DRIVER' | 'OPERATOR';
  reason?: string;
}

/**
 * Cancelación de un viaje por el pasajero dueño, el chofer asignado o un operador.
 *
 * Carrera con AcceptRide (PC-05): los dos casos de uso bloquean PRIMERO el viaje, así que se ejecutan
 * uno después del otro. Solo hay dos resultados posibles, ambos consistentes:
 *   (a) gana la cancelación → viaje CANCELLED_BY_PASSENGER sin chofer; la aceptación recibe RIDE_NOT_AVAILABLE
 *       y el chofer sigue AVAILABLE.
 *   (b) gana la aceptación → el viaje queda ASSIGNED; después la cancelación lo pasa a CANCELLED_BY_PASSENGER
 *       y libera al chofer (vuelve a AVAILABLE).
 * Nunca: un viaje asignado sin pasajero, ni un chofer BUSY sin viaje activo.
 */
export class CancelRide {
  constructor(
    private readonly unitOfWork: UnitOfWork,
    private readonly clock: Clock
  ) {}

  async execute({ rideId, actorId, actorRole, reason }: CancelRideCommand): Promise<Ride> {
    return this.unitOfWork.run(async ({ rides, drivers, rideHistory }) => {
      // Orden de bloqueo: viaje → chofer (el mismo que AcceptRide; si no, podrían trabarse entre sí).
      const ride = await rides.findByIdForUpdate(rideId);

      // Autorización por recurso: un viaje ajeno responde igual que uno inexistente (no se revela que existe).
      const canCancel =
        actorRole === 'OPERATOR' ||
        (actorRole === 'PASSENGER' && ride?.passengerId === actorId) ||
        (actorRole === 'DRIVER' && ride?.driverId === actorId);
      if (!ride || !canCancel) {
        throw new DomainError('RIDE_NOT_FOUND', 'El viaje no existe', { rideId });
      }

      const to = cancellationStatusFor(actorRole);
      assertTransition(ride.status, to, actorRole);

      const now = this.clock.now();
      const cancelled = await rides.updateStatus(rideId, { status: to, at: now, cancellationReason: reason });

      if (ride.driverId) {
        await drivers.findByUserIdForUpdate(ride.driverId);
        await drivers.setAvailability(ride.driverId, 'AVAILABLE');
      }

      await rideHistory.record({ rideId, from: ride.status, to, actorId, actorRole, reason, at: now });
      return cancelled;
    });
  }
}
