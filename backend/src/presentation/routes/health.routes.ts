import { Router } from 'express';
import { healthController } from '../controllers/HealthController.js';

const router = Router();

router.get('/health', (req, res) => healthController.getHealth(req, res));
router.get('/info', (req, res) => healthController.getInfo(req, res));

export default router;
