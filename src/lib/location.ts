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

export function distanceBetweenKm(origin: Coordinates, target: Coordinates) {
  return distanceBetweenMeters(origin, target) / 1000;
}

export function roundKm(distanceKm: number) {
  return Math.round(distanceKm * 10) / 10;
}

export function getGoogleMapsRouteUrl(
  originLat?: number | null,
  originLng?: number | null,
  destinationLat?: number | null,
  destinationLng?: number | null,
) {
  if (
    originLat == null ||
    originLng == null ||
    destinationLat == null ||
    destinationLng == null
  ) {
    return null;
  }

  const params = new URLSearchParams({
    api: "1",
    origin: `${originLat},${originLng}`,
    destination: `${destinationLat},${destinationLng}`,
    travelmode: "driving",
  });

  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

export function openGoogleMaps(lat?: number | null, lng?: number | null) {
  if (lat == null || lng == null) {
    return;
  }

  const params = new URLSearchParams({
    api: "1",
    destination: `${lat},${lng}`,
    travelmode: "driving",
  });

  window.open(`https://www.google.com/maps/dir/?${params.toString()}`, "_blank", "noopener,noreferrer");
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
