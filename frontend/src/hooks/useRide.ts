import { useState, useEffect, useCallback } from 'react';
import type { Ride } from '../types';
import { rideService } from '../services/rideService';
import { useSocket } from '../context/SocketContext';

export const useRide = () => {
  const [activeRide, setActiveRide] = useState<Ride | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const { socket } = useSocket();

  const fetchActiveRide = useCallback(async () => {
    try {
      setLoading(true);
      const ride = await rideService.getActiveRide();
      setActiveRide(ride);
      setError(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al obtener viaje activo';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchActiveRide();
  }, [fetchActiveRide]);

  // Escuchar cambios de estado en tiempo real vía WebSocket
  useEffect(() => {
    if (!socket || !activeRide) return;

    socket.emit('ride:join_room', activeRide.id);

    const handleStatusChanged = (data: { status: string; payload?: unknown }) => {
      setActiveRide((prev) => (prev ? { ...prev, status: data.status as Ride['status'] } : null));
    };

    socket.on('ride:status_changed', handleStatusChanged);

    return () => {
      socket.off('ride:status_changed', handleStatusChanged);
    };
  }, [socket, activeRide]);

  return { activeRide, setActiveRide, loading, error, refresh: fetchActiveRide };
};
