// Pure geographic helpers (no DB). Distances use the Haversine great-circle
// formula — the reliable server-side basis for delivery coverage and nearest
// pickup. Google Maps only replaces coordinate ACQUISITION (geocoding); the math
// here is authoritative and never trusts client-submitted distances.

export interface LatLng {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_KM = 6371;

export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Round a distance to a friendly precision (2 decimals). */
export function roundKm(km: number): number {
  return Math.round(km * 100) / 100;
}

/** A valid finite coordinate pair within earth bounds. */
export function isValidLatLng(lat: unknown, lng: unknown): boolean {
  const a = Number(lat);
  const b = Number(lng);
  return Number.isFinite(a) && Number.isFinite(b) && a >= -90 && a <= 90 && b >= -180 && b <= 180;
}

/** Google Maps directions deep-link to a destination coordinate. */
export function directionsUrl(dest: LatLng): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${dest.lat},${dest.lng}`;
}

/**
 * PHASE E — a coordinate the client actually SENT, as a number.
 *
 * `Number(null)` is 0 and `Number("")` is 0, so a missing latitude would
 * otherwise be silently accepted as the equator rather than rejected. Anything
 * that is not a finite number — including null, empty string and booleans —
 * comes back as NaN, which every range check already refuses.
 */
export function coordinateOrNaN(value: unknown): number {
  if (value === null || value === undefined || value === "" || typeof value === "boolean") return Number.NaN;
  return Number(value);
}
