import { apiClient } from './api';
import type { AuthResponse, User, AuthTokens } from '../types';

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterPassengerData {
  name: string;
  email: string;
  password: string;
  phone?: string;
}

export interface RegisterDriverData {
  name: string;
  email: string;
  password: string;
  phone: string;
  vehicleModel: string;
  vehiclePlate: string;
  vehicleColor: string;
  licenseNumber: string;
}

export const authService = {
  async login(credentials: LoginCredentials): Promise<AuthResponse['data']> {
    const response = await apiClient.post<AuthResponse>('/auth/login', credentials);
    return response.data.data;
  },

  async registerPassenger(data: RegisterPassengerData): Promise<AuthResponse['data']> {
    const response = await apiClient.post<AuthResponse>('/auth/register/passenger', data);
    return response.data.data;
  },

  async registerDriver(data: RegisterDriverData): Promise<AuthResponse['data']> {
    const response = await apiClient.post<AuthResponse>('/auth/register/driver', data);
    return response.data.data;
  },

  async getMe(): Promise<User> {
    const response = await apiClient.get<{ success: boolean; data: User }>('/auth/me');
    return response.data.data;
  },

  async refreshToken(refreshToken: string): Promise<AuthTokens> {
    const response = await apiClient.post<{ success: boolean; data: AuthTokens }>('/auth/refresh', {
      refreshToken
    });
    return response.data.data;
  }
};
