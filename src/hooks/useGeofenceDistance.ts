import { useCallback, useEffect, useState } from "react";
import { distanceBetweenMeters } from "../lib/location";

export function useGeofenceDistance(
  target: { lat?: number | null; lng?: number | null } | null,
  enabled: boolean,
) {
  const [distance, setDistance] = useState<number | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const updateDistance = useCallback(
    (nextCoords: { lat: number; lng: number }) => {
      if (target?.lat == null || target.lng == null) {
        return;
      }

      setCoords(nextCoords);
      setDistance(distanceBetweenMeters(nextCoords, { lat: target.lat, lng: target.lng }));
      setError(null);
    },
    [target?.lat, target?.lng],
  );

  const refresh = useCallback(async () => {
    if (target?.lat == null || target.lng == null) {
      setError("Target location missing hai");
      return;
    }

    if (!("geolocation" in navigator)) {
      setError("Location access do Settings mein");
      return;
    }

    try {
      setRefreshing(true);
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0,
        });
      });

      updateDistance({
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      });
    } catch {
      setError("Location refresh nahi ho paya");
    } finally {
      setRefreshing(false);
    }
  }, [target?.lat, target?.lng, updateDistance]);

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

        updateDistance(nextCoords);
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
  }, [enabled, target?.lat, target?.lng, updateDistance]);

  return {
    distance,
    coords,
    error,
    refresh,
    refreshing,
    isWithinFence: distance != null && distance <= 50,
  };
}
