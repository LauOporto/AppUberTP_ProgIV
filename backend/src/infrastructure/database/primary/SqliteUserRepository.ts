import { IUserRepository } from '../../../domain/interfaces/IUserRepository.js';
import { User } from '../../../domain/entities/User.js';
import { DriverProfile } from '../../../domain/entities/DriverProfile.js';
import { dbContext } from './DatabaseClient.js';
import crypto from 'crypto';

export class SqliteUserRepository implements IUserRepository {
  public async findById(id: string): Promise<User | null> {
    return dbContext.users.get(id) || null;
  }

  public async findByEmail(email: string): Promise<User | null> {
    const users = Array.from(dbContext.users.values());
    return users.find(u => u.email.toLowerCase() === email.toLowerCase()) || null;
  }

  public async create(userData: Omit<User, 'id' | 'createdAt' | 'updatedAt'>): Promise<User> {
    const now = new Date();
    const newUser: User = {
      ...userData,
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now
    };
    dbContext.users.set(newUser.id, newUser);
    return newUser;
  }

  public async update(id: string, updates: Partial<User>): Promise<User | null> {
    const user = dbContext.users.get(id);
    if (!user) return null;
    const updatedUser: User = {
      ...user,
      ...updates,
      updatedAt: new Date()
    };
    dbContext.users.set(id, updatedUser);
    return updatedUser;
  }

  public async findDriverProfileByUserId(userId: string): Promise<DriverProfile | null> {
    return dbContext.driverProfiles.get(userId) || null;
  }

  public async createDriverProfile(
    profileData: Omit<DriverProfile, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<DriverProfile> {
    const now = new Date();
    const newProfile: DriverProfile = {
      ...profileData,
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now
    };
    dbContext.driverProfiles.set(newProfile.userId, newProfile);
    return newProfile;
  }

  public async updateDriverProfile(
    userId: string,
    updates: Partial<DriverProfile>
  ): Promise<DriverProfile | null> {
    const profile = dbContext.driverProfiles.get(userId);
    if (!profile) return null;
    const updatedProfile: DriverProfile = {
      ...profile,
      ...updates,
      updatedAt: new Date()
    };
    dbContext.driverProfiles.set(userId, updatedProfile);
    return updatedProfile;
  }

  public async findAvailableDrivers(): Promise<Array<{ user: User; profile: DriverProfile }>> {
    const results: Array<{ user: User; profile: DriverProfile }> = [];
    for (const profile of dbContext.driverProfiles.values()) {
      if (profile.isOnline && profile.isAvailable) {
        const user = dbContext.users.get(profile.userId);
        if (user) {
          results.push({ user, profile });
        }
      }
    }
    return results;
  }
}
