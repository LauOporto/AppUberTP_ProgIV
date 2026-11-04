import { Request, Response, NextFunction } from 'express';
import { container } from '../../infrastructure/di/container.js';

export class ChatController {
  public async sendMessage(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user!;
      const message = await container.chatService.sendMessage(user.userId, user.role, req.body);
      res.status(201).json({
        success: true,
        data: message
      });
    } catch (error) {
      next(error);
    }
  }

  public async getMessages(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { rideId } = req.params;
      const messages = await container.chatService.getRideMessages(userId, rideId);
      res.status(200).json({
        success: true,
        data: messages
      });
    } catch (error) {
      next(error);
    }
  }

  public async markAsRead(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { rideId } = req.params;
      await container.chatService.markMessagesAsRead(userId, rideId);
      res.status(200).json({
        success: true,
        message: 'Mensajes marcados como leídos'
      });
    } catch (error) {
      next(error);
    }
  }
}

export const chatController = new ChatController();
