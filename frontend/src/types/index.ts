export type UserRole = 'PASSENGER' | 'DRIVER' | 'ADMIN';

export type RideStatus =
  | 'REQUESTED'
  | 'ACCEPTED'
  | 'DRIVER_ARRIVED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED';

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface User {
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

export interface DriverProfile {
  id: string;
  userId: string;
  vehicleModel: string;
  vehiclePlate: string;
  vehicleColor: string;
  licenseNumber: string;
  isOnline: boolean;
  isAvailable: boolean;
  currentLocation?: Coordinates | null;
}

export interface Ride {
  id: string;
  passengerId: string;
  driverId?: string | null;
  status: RideStatus;
  originAddress: string;
  originLocation: Coordinates;
  destinationAddress: string;
  destinationLocation: Coordinates;
  estimatedDistanceKm: number;
  estimatedDurationMin: number;
  fareAmount: number;
  requestedAt: string;
  acceptedAt?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  cancelledAt?: string | null;
  cancellationReason?: string | null;
}

export interface RideMessage {
  id: string;
  rideId: string;
  senderId: string;
  senderRole: UserRole;
  content: string;
  isRead: boolean;
  readAt?: string | null;
  createdAt: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
}

export interface AuthResponse {
  success: boolean;
  data: {
    user: User;
    tokens: AuthTokens;
  };
}
