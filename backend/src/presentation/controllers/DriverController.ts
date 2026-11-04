import { Request, Response, NextFunction } from 'express';
import { container } from '../../infrastructure/di/container.js';

export class DriverController {
  public async updateLocation(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const driverId = req.user!.userId;
      const { latitude, longitude } = req.body;
      await container.driverLocationService.updateLocation(driverId, { latitude, longitude });
      res.status(200).json({
        success: true,
        message: 'Ubicación actualizada en proveedor de tiempo real'
      });
    } catch (error) {
      next(error);
    }
  }

  public async toggleOnline(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const driverId = req.user!.userId;
      const { isOnline } = req.body;
      await container.driverLocationService.toggleOnline(driverId, Boolean(isOnline));
      res.status(200).json({
        success: true,
        isOnline: Boolean(isOnline)
      });
    } catch (error) {
      next(error);
    }
  }

  public async getAvailableDrivers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const drivers = await container.driverLocationService.getAvailableLiveDrivers();
      res.status(200).json({
        success: true,
        data: drivers
      });
    } catch (error) {
      next(error);
    }
  }
}

export const driverController = new DriverController();
