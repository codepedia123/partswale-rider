export interface Coordinates {
  lat: number;
  lng: number;
}

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

export function distanceBetweenMeters(origin: Coordinates, target: Coordinates) {
  const earthRadius = 6371000;
  const deltaLat = toRadians(target.lat - origin.lat);
  const deltaLng = toRadians(target.lng - origin.lng);
  const lat1 = toRadians(origin.lat);
  const lat2 = toRadians(target.lat);

  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadius * c;
}

export function openGoogleMaps(lat?: number | null, lng?: number | null) {
  if (lat == null || lng == null) {
    return;
  }

  window.open(`https://maps.google.com/?q=${lat},${lng}`, "_blank", "noopener,noreferrer");
}

export function getCurrentPosition(options?: PositionOptions) {
  return new Promise<GeolocationPosition>((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("Location access not available"));
      return;
    }

    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 5000,
      ...options,
    });
  });
}

export function positionToCoordinates(position: GeolocationPosition): Coordinates {
  return {
    lat: position.coords.latitude,
    lng: position.coords.longitude,
  };
}
