import { apiClient } from './api';
import type { Ride, Coordinates, RideMessage } from '../types';

export interface FareEstimateResult {
  distanceKm: number;
  estimatedMinutes: number;
  fareAmount: number;
}

export interface CreateRidePayload {
  originAddress: string;
  originLocation: Coordinates;
  destinationAddress: string;
  destinationLocation: Coordinates;
}

export interface PaginatedRidesResponse {
  success: boolean;
  data: Ride[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export const rideService = {
  async estimateFare(originLocation: Coordinates, destinationLocation: Coordinates): Promise<FareEstimateResult> {
    const res = await apiClient.post<{ success: boolean; data: FareEstimateResult }>('/rides/estimate', {
      originLocation,
      destinationLocation
    });
    return res.data.data;
  },

  async requestRide(payload: CreateRidePayload): Promise<Ride> {
    const res = await apiClient.post<{ success: boolean; data: Ride }>('/rides', payload);
    return res.data.data;
  },

  async getActiveRide(): Promise<Ride | null> {
    const res = await apiClient.get<{ success: boolean; data: Ride | null }>('/rides/active');
    return res.data.data;
  },

  async getPendingRides(): Promise<Ride[]> {
    const res = await apiClient.get<{ success: boolean; data: Ride[] }>('/rides/pending');
    return res.data.data;
  },

  async acceptRide(rideId: string): Promise<Ride> {
    const res = await apiClient.post<{ success: boolean; data: Ride }>(`/rides/${rideId}/accept`);
    return res.data.data;
  },

  async updateRideStatus(rideId: string, status: string, cancellationReason?: string): Promise<Ride> {
    const res = await apiClient.patch<{ success: boolean; data: Ride }>(`/rides/${rideId}/status`, {
      status,
      cancellationReason
    });
    return res.data.data;
  },

  async getRideHistory(page = 1, limit = 10): Promise<PaginatedRidesResponse> {
    const res = await apiClient.get<PaginatedRidesResponse>(`/rides/history?page=${page}&limit=${limit}`);
    return res.data;
  },

  async getRideMessages(rideId: string): Promise<RideMessage[]> {
    const res = await apiClient.get<{ success: boolean; data: RideMessage[] }>(`/chat/rides/${rideId}/messages`);
    return res.data.data;
  },

  async markMessagesAsRead(rideId: string): Promise<void> {
    await apiClient.patch(`/chat/rides/${rideId}/read`);
  }
};
