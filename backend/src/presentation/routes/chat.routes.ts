import { Router } from 'express';
import { chatController } from '../controllers/ChatController.js';
import { authenticateJwt } from '../middlewares/authMiddleware.js';
import { validateBody } from '../middlewares/requestValidator.js';
import { SendMessageSchema } from '../../application/dtos/chat.dto.js';

const router = Router();

router.use(authenticateJwt);

// Enviar mensaje en el chat de un viaje
router.post(
  '/messages',
  validateBody(SendMessageSchema),
  chatController.sendMessage
);

// Obtener historial de mensajes de un viaje
router.get(
  '/rides/:rideId/messages',
  chatController.getMessages
);

// Marcar mensajes como leídos (acuses de lectura - REQ-08)
router.patch(
  '/rides/:rideId/read',
  chatController.markAsRead
);

export default router;
