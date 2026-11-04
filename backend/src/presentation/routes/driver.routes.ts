import { Router } from 'express';
import { driverController } from '../controllers/DriverController.js';
import { authenticateJwt } from '../middlewares/authMiddleware.js';
import { requireRoles } from '../middlewares/roleMiddleware.js';

const router = Router();

// Consultar conductores activos cercanos (público o autenticado)
router.get('/available', driverController.getAvailableDrivers);

// Actualizaciones exclusivas del conductor
router.use(authenticateJwt, requireRoles('DRIVER'));

router.post('/location', driverController.updateLocation);
router.post('/online', driverController.toggleOnline);

export default router;
