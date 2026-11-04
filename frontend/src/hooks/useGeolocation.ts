import { useState, useEffect } from 'react';
import type { Coordinates } from '../types';

export const useGeolocation = () => {
  // Coordenadas por defecto: UTN FRRe Resistencia, Chaco (-27.4514, -58.9866)
  const defaultCoords: Coordinates = { latitude: -27.4514, longitude: -58.9866 };
  const [coords, setCoords] = useState<Coordinates>(defaultCoords);
  const [hasPermission, setHasPermission] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!navigator.geolocation) {
      setError('Geolocalización no soportada por el navegador');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude
        });
        setHasPermission(true);
      },
      (err) => {
        setError(err.message);
        // Mantiene las coordenadas por defecto
      },
      { enableHighAccuracy: true }
    );
  }, []);

  return { coords, hasPermission, error, setCoords };
};
