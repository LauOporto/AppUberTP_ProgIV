export type UserRole = 'PASSENGER' | 'DRIVER' | 'ADMIN';

export interface User {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  phone?: string;
  avatarUrl?: string;
  ratingAverage: number;
  totalTrips: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserProfileResponse {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  phone?: string;
  avatarUrl?: string;
  ratingAverage: number;
  totalTrips: number;
  createdAt: string;
}
