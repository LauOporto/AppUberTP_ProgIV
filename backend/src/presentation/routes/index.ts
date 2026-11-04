import { Router } from 'express';
import authRoutes from './auth.routes.js';
import rideRoutes from './ride.routes.js';
import driverRoutes from './driver.routes.js';
import chatRoutes from './chat.routes.js';
import healthRoutes from './health.routes.js';

const router = Router();

router.use('/auth', authRoutes);
router.use('/rides', rideRoutes);
router.use('/driver', driverRoutes);
router.use('/chat', chatRoutes);
router.use('/', healthRoutes);

export default router;
