import { useCallback, useEffect, useState } from "react";
import { fetchRiderLocation, getNextRiderLocationRefreshDelay } from "../lib/data";
import { distanceBetweenMeters } from "../lib/location";

export function useGeofenceDistance(
  target: { lat?: number | null; lng?: number | null } | null,
  enabled: boolean,
  fallbackRiderId?: string | null,
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

  const refreshFromSavedLocation = useCallback(async () => {
    if (!fallbackRiderId) {
      setError("Location refresh nahi ho paya");
      return null;
    }

    try {
      const savedLocation = await fetchRiderLocation(fallbackRiderId);
      updateDistance(savedLocation);
      return savedLocation;
    } catch {
      setError("Location refresh nahi ho paya");
      return null;
    }
  }, [fallbackRiderId, updateDistance]);

  const refresh = useCallback(async () => {
    if (target?.lat == null || target.lng == null) {
      setError("Target location missing hai");
      return;
    }

    try {
      setRefreshing(true);
      await refreshFromSavedLocation();
    } finally {
      setRefreshing(false);
    }
  }, [target?.lat, target?.lng, updateDistance, refreshFromSavedLocation]);

  useEffect(() => {
    if (!enabled || target?.lat == null || target.lng == null) {
      return;
    }

    let timeoutId: number | null = null;
    let cancelled = false;

    const loadAndSchedule = async () => {
      const savedLocation = await refreshFromSavedLocation();
      if (cancelled || !savedLocation) {
        return;
      }

      const nextDelay = getNextRiderLocationRefreshDelay(savedLocation.locationUpdatedAt);
      timeoutId = window.setTimeout(loadAndSchedule, nextDelay <= 0 ? 5 * 60 * 1000 : nextDelay);
    };

    void loadAndSchedule();

    return () => {
      cancelled = true;
      if (timeoutId != null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [enabled, target?.lat, target?.lng, updateDistance, refreshFromSavedLocation]);

  return {
    distance,
    coords,
    error,
    refresh,
    refreshing,
    isWithinFence: distance != null && distance <= 50,
  };
}
