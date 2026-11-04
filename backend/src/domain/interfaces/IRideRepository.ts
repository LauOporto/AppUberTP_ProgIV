import { Ride, RideStatus } from '../entities/Ride.js';
import { RideMessage } from '../entities/RideMessage.js';

export interface PaginationOptions {
  page?: number;
  limit?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface IRideRepository {
  findById(id: string): Promise<Ride | null>;
  create(ride: Omit<Ride, 'id' | 'createdAt' | 'updatedAt'>): Promise<Ride>;
  update(id: string, updates: Partial<Ride>): Promise<Ride | null>;
  findActiveRideByUserId(userId: string): Promise<Ride | null>;
  findPendingRides(): Promise<Ride[]>;
  findByUserId(userId: string, options?: PaginationOptions): Promise<PaginatedResult<Ride>>;
  
  // Mensajes asociados al viaje (REQ-03, REQ-05, REQ-08)
  addMessage(message: Omit<RideMessage, 'id' | 'createdAt'>): Promise<RideMessage>;
  getMessagesByRideId(rideId: string): Promise<RideMessage[]>;
  markMessagesAsRead(rideId: string, readerUserId: string): Promise<void>;
}
