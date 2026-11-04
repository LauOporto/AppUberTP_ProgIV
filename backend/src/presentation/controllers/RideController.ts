import { Request, Response, NextFunction } from 'express';
import { container } from '../../infrastructure/di/container.js';

export class RideController {
  public async estimateFare(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const estimate = container.rideService.estimateFare(req.body);
      res.status(200).json({
        success: true,
        data: estimate
      });
    } catch (error) {
      next(error);
    }
  }

  public async requestRide(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const passengerId = req.user!.userId;
      const ride = await container.rideService.requestRide(passengerId, req.body);
      res.status(201).json({
        success: true,
        data: ride
      });
    } catch (error) {
      next(error);
    }
  }

  public async acceptRide(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const driverId = req.user!.userId;
      const { rideId } = req.params;
      const ride = await container.rideService.acceptRide(driverId, rideId);
      res.status(200).json({
        success: true,
        data: ride
      });
    } catch (error) {
      next(error);
    }
  }

  public async updateStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { rideId } = req.params;
      const ride = await container.rideService.updateRideStatus(userId, rideId, req.body);
      res.status(200).json({
        success: true,
        data: ride
      });
    } catch (error) {
      next(error);
    }
  }

  public async getActiveRide(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId;
      const ride = await container.rideService.getActiveRide(userId);
      res.status(200).json({
        success: true,
        data: ride
      });
    } catch (error) {
      next(error);
    }
  }

  public async getPendingRides(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const rides = await container.rideService.getPendingRidesForDrivers();
      res.status(200).json({
        success: true,
        data: rides
      });
    } catch (error) {
      next(error);
    }
  }

  public async getUserRides(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { page, limit } = req.query as unknown as { page: number; limit: number };
      const paginated = await container.rideService.getUserRides(userId, { page, limit });
      res.status(200).json({
        success: true,
        ...paginated
      });
    } catch (error) {
      next(error);
    }
  }

  public async getRideById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { rideId } = req.params;
      const ride = await container.rideService.getRideById(rideId, userId);
      res.status(200).json({
        success: true,
        data: ride
      });
    } catch (error) {
      next(error);
    }
  }
}

export const rideController = new RideController();
