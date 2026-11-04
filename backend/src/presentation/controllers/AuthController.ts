import { Request, Response, NextFunction } from 'express';
import { container } from '../../infrastructure/di/container.js';

export class AuthController {
  public async registerPassenger(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await container.authService.registerPassenger(req.body);
      res.status(201).json({
        success: true,
        data: result
      });
    } catch (error) {
      next(error);
    }
  }

  public async registerDriver(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await container.authService.registerDriver(req.body);
      res.status(201).json({
        success: true,
        data: result
      });
    } catch (error) {
      next(error);
    }
  }

  public async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await container.authService.login(req.body);
      res.status(200).json({
        success: true,
        data: result
      });
    } catch (error) {
      next(error);
    }
  }

  public async refreshToken(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tokens = await container.authService.refreshToken(req.body);
      res.status(200).json({
        success: true,
        data: tokens
      });
    } catch (error) {
      next(error);
    }
  }

  public async getProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId;
      const profile = await container.authService.getProfile(userId);
      res.status(200).json({
        success: true,
        data: profile
      });
    } catch (error) {
      next(error);
    }
  }
}

export const authController = new AuthController();
