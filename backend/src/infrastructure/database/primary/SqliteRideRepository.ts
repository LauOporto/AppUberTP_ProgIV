import {
  IRideRepository,
  PaginationOptions,
  PaginatedResult
} from '../../../domain/interfaces/IRideRepository.js';
import { Ride } from '../../../domain/entities/Ride.js';
import { RideMessage } from '../../../domain/entities/RideMessage.js';
import { dbContext } from './DatabaseClient.js';
import crypto from 'crypto';

export class SqliteRideRepository implements IRideRepository {
  public async findById(id: string): Promise<Ride | null> {
    return dbContext.rides.get(id) || null;
  }

  public async create(rideData: Omit<Ride, 'id' | 'createdAt' | 'updatedAt'>): Promise<Ride> {
    const now = new Date();
    const newRide: Ride = {
      ...rideData,
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now
    };
    dbContext.rides.set(newRide.id, newRide);
    return newRide;
  }

  public async update(id: string, updates: Partial<Ride>): Promise<Ride | null> {
    const ride = dbContext.rides.get(id);
    if (!ride) return null;
    const updatedRide: Ride = {
      ...ride,
      ...updates,
      updatedAt: new Date()
    };
    dbContext.rides.set(id, updatedRide);
    return updatedRide;
  }

  public async findActiveRideByUserId(userId: string): Promise<Ride | null> {
    const activeStatuses = ['REQUESTED', 'ACCEPTED', 'DRIVER_ARRIVED', 'IN_PROGRESS'];
    for (const ride of dbContext.rides.values()) {
      if (
        activeStatuses.includes(ride.status) &&
        (ride.passengerId === userId || ride.driverId === userId)
      ) {
        return ride;
      }
    }
    return null;
  }

  public async findPendingRides(): Promise<Ride[]> {
    const results: Ride[] = [];
    for (const ride of dbContext.rides.values()) {
      if (ride.status === 'REQUESTED') {
        results.push(ride);
      }
    }
    return results;
  }

  public async findByUserId(
    userId: string,
    options?: PaginationOptions
  ): Promise<PaginatedResult<Ride>> {
    const page = options?.page || 1;
    const limit = options?.limit || 10;

    const userRides = Array.from(dbContext.rides.values())
      .filter(r => r.passengerId === userId || r.driverId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const total = userRides.length;
    const totalPages = Math.ceil(total / limit) || 1;
    const startIndex = (page - 1) * limit;
    const data = userRides.slice(startIndex, startIndex + limit);

    return {
      data,
      total,
      page,
      limit,
      totalPages
    };
  }

  public async addMessage(messageData: Omit<RideMessage, 'id' | 'createdAt'>): Promise<RideMessage> {
    const newMessage: RideMessage = {
      ...messageData,
      id: crypto.randomUUID(),
      createdAt: new Date()
    };
    dbContext.messages.set(newMessage.id, newMessage);
    return newMessage;
  }

  public async getMessagesByRideId(rideId: string): Promise<RideMessage[]> {
    return Array.from(dbContext.messages.values())
      .filter(m => m.rideId === rideId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  public async markMessagesAsRead(rideId: string, readerUserId: string): Promise<void> {
    const now = new Date();
    for (const msg of dbContext.messages.values()) {
      if (msg.rideId === rideId && msg.senderId !== readerUserId && !msg.isRead) {
        msg.isRead = true;
        msg.readAt = now;
      }
    }
  }
}
