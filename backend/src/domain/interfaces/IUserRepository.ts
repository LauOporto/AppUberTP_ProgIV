import { User } from '../entities/User.js';
import { DriverProfile } from '../entities/DriverProfile.js';

export interface IUserRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  create(user: Omit<User, 'id' | 'createdAt' | 'updatedAt'>): Promise<User>;
  update(id: string, updates: Partial<User>): Promise<User | null>;
  
  // Driver Profile operations
  findDriverProfileByUserId(userId: string): Promise<DriverProfile | null>;
  createDriverProfile(profile: Omit<DriverProfile, 'id' | 'createdAt' | 'updatedAt'>): Promise<DriverProfile>;
  updateDriverProfile(userId: string, updates: Partial<DriverProfile>): Promise<DriverProfile | null>;
  findAvailableDrivers(): Promise<Array<{ user: User; profile: DriverProfile }>>;
}
