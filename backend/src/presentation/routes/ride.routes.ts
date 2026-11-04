import { Router } from 'express';
import { rideController } from '../controllers/RideController.js';
import { authenticateJwt } from '../middlewares/authMiddleware.js';
import { requireRoles } from '../middlewares/roleMiddleware.js';
import { validateBody, validateQuery } from '../middlewares/requestValidator.js';
import {
  CreateRideSchema,
  EstimateFareSchema,
  UpdateRideStatusSchema,
  RidePaginationQuerySchema
} from '../../application/dtos/ride.dto.js';

const router = Router();

// Todos los endpoints de viajes requieren JWT
router.use(authenticateJwt);

// Cotizar / estimar viaje (Pasajero o Conductor)
router.post(
  '/estimate',
  validateBody(EstimateFareSchema),
  rideController.estimateFare
);

// Pasajero solicita un viaje
router.post(
  '/',
  requireRoles('PASSENGER'),
  validateBody(CreateRideSchema),
  rideController.requestRide
);

// Conductor consulta viajes pendientes de asignación
router.get(
  '/pending',
  requireRoles('DRIVER'),
  rideController.getPendingRides
);

// Consultar viaje activo del usuario autenticado
router.get(
  '/active',
  rideController.getActiveRide
);

// Historial de viajes paginado del usuario autenticado
router.get(
  '/history',
  validateQuery(RidePaginationQuerySchema),
  rideController.getUserRides
);

// Detalle de un viaje específico
router.get(
  '/:rideId',
  rideController.getRideById
);

// Conductor acepta un viaje
router.post(
  '/:rideId/accept',
  requireRoles('DRIVER'),
  rideController.acceptRide
);

// Actualizar estado del viaje (llegó conductor, iniciar viaje, finalizar, cancelar)
router.patch(
  '/:rideId/status',
  validateBody(UpdateRideStatusSchema),
  rideController.updateStatus
);

export default router;
