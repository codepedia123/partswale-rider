import { useEffect, useState } from "react";
import { distanceBetweenMeters } from "../lib/location";

export function useGeofenceDistance(
  target: { lat?: number | null; lng?: number | null } | null,
  enabled: boolean,
) {
  const [distance, setDistance] = useState<number | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || target?.lat == null || target.lng == null) {
      return;
    }

    if (!("geolocation" in navigator)) {
      setError("Location access do Settings mein");
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const nextCoords = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };

        setCoords(nextCoords);
        setDistance(distanceBetweenMeters(nextCoords, { lat: target.lat!, lng: target.lng! }));
        setError(null);
      },
      () => {
        setError("Location access do Settings mein");
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 5000,
      },
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [enabled, target?.lat, target?.lng]);

  return {
    distance,
    coords,
    error,
    isWithinFence: distance != null && distance <= 50,
  };
}
