import "server-only";
import { Prisma } from "@prisma/client";
import type { User } from "@prisma/client";

import { prisma } from "@/lib/db";
import { validationError, sk } from "@/lib/http/errors";
import { haversineKm, isValidLatLng, roundKm, type LatLng } from "@/lib/services/geo";
import { coverageFor } from "@/lib/services/delivery";

/**
 * Save a customer's latest validated GPS fix (req #21). Kept SEPARATE from saved
 * addresses + immutable order snapshots; never overwrites a saved default
 * address. Validates finite + in-range coordinates and non-negative accuracy.
 */
export async function saveCustomerLocation(
  user: User,
  lat: number,
  lng: number,
  accuracy?: number | null,
  capturedAt?: number | string | null,
) {
  if (!isValidLatLng(lat, lng)) throw validationError({ location: sk("errors.orders.invalidCoordinates") });
  if (accuracy != null && (!Number.isFinite(Number(accuracy)) || Number(accuracy) < 0)) {
    throw validationError({ accuracy: sk("errors.orders.invalidCoordinates") });
  }
  assertFreshFix(capturedAt);
  await prisma.user.update({
    where: { id: user.id },
    data: {
      currentLat: new Prisma.Decimal(lat.toFixed(7)),
      currentLng: new Prisma.Decimal(lng.toFixed(7)),
      currentAccuracy: accuracy != null ? new Prisma.Decimal(Number(accuracy).toFixed(2)) : null,
      locationUpdatedAt: new Date(),
    },
  });
  return { lat, lng };
}

/**
 * PHASE E — a fix the browser captured must be RECENT. A client may report when
 * it took the reading; an old (or future-dated) one is refused rather than
 * stored as if it were current, so a replayed or cached position cannot be
 * passed off as the customer's location right now. No timestamp at all is
 * accepted: the server stamps its own time, which is the existing behaviour.
 */
export const MAX_FIX_AGE_MS = 5 * 60_000;

export function assertFreshFix(capturedAt?: number | string | null) {
  if (capturedAt === undefined || capturedAt === null || capturedAt === "") return;
  const ms = typeof capturedAt === "number" ? capturedAt : Date.parse(String(capturedAt));
  if (!Number.isFinite(ms)) throw validationError({ captured_at: sk("errors.location.staleFix") });
  const age = Date.now() - ms;
  // A little clock skew forward is tolerated; a stale fix is not.
  if (age > MAX_FIX_AGE_MS || age < -60_000) {
    throw validationError({ captured_at: sk("errors.location.staleFix") });
  }
}

/**
 * How long a stored GPS fix stays authoritative for branch resolution.
 *
 * Distinct from MAX_FIX_AGE_MS, which governs ACCEPTING a fix at write time
 * (five minutes — a browser reading older than that is a replay). Reading is a
 * different question: a customer who shared their location this morning has not
 * moved to another city by lunchtime, and expiring the fix in five minutes would
 * drop them out of their branch constantly. After this window the fix is treated
 * as unknown and the saved default address takes over, which is a deliberate
 * fall-through rather than a silent use of an old coordinate.
 */
export const LOCATION_TRUST_WINDOW_MS = 24 * 60 * 60_000;

/** Where a resolved point came from — surfaced so the UI can explain itself. */
export type PointSource = "gps" | "address";

export interface TrustedPoint extends LatLng {
  source: PointSource;
}

/**
 * Trusted customer coordinates for server-side nearest-branch / coverage.
 *
 * Priority, highest first:
 *   1. a RECENT, valid GPS fix (see LOCATION_TRUST_WINDOW_MS);
 *   2. the default active saved address with valid coordinates.
 *
 * The project models exactly these two sources — there is no separate "selected
 * address" concept, so the default address IS the address-based source. Every
 * coordinate is re-validated with isValidLatLng before use, so a corrupt or
 * out-of-range stored value falls through instead of resolving a wrong branch.
 * Client-supplied coordinates are never trusted here. GPS and saved addresses
 * stay separate: nothing in this module writes one from the other.
 */
export async function trustedCustomerPointDetailed(userId: number): Promise<TrustedPoint | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { currentLat: true, currentLng: true, locationUpdatedAt: true },
  });
  if (user?.currentLat != null && user.currentLng != null) {
    const lat = Number(user.currentLat);
    const lng = Number(user.currentLng);
    const stamped = user.locationUpdatedAt?.getTime() ?? null;
    const fresh = stamped != null && Date.now() - stamped <= LOCATION_TRUST_WINDOW_MS;
    if (fresh && isValidLatLng(lat, lng)) return { lat, lng, source: "gps" };
  }
  // Scoped to THIS customer's own addresses, so an address id can never be
  // borrowed from another account.
  const addr = await prisma.customerAddress.findFirst({
    where: { userId, isActive: true, isDefault: true, latitude: { not: null }, longitude: { not: null } },
  });
  if (addr?.latitude != null && addr.longitude != null) {
    const lat = Number(addr.latitude);
    const lng = Number(addr.longitude);
    if (isValidLatLng(lat, lng)) return { lat, lng, source: "address" };
  }
  return null;
}

/** Coordinates only — the long-standing signature, kept for existing callers. */
export async function trustedCustomerPoint(userId: number): Promise<LatLng | null> {
  const point = await trustedCustomerPointDetailed(userId);
  return point ? { lat: point.lat, lng: point.lng } : null;
}

/**
 * The customer's currently-saved live GPS fix (req #12/#21), for the location
 * permission/status card. Independent of saved addresses. Null coords means the
 * customer has never shared a live location.
 */
export async function customerLocationStatus(userId: number): Promise<{
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  updatedAt: string | null;
}> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { currentLat: true, currentLng: true, currentAccuracy: true, locationUpdatedAt: true },
  });
  return {
    lat: u?.currentLat != null ? Number(u.currentLat) : null,
    lng: u?.currentLng != null ? Number(u.currentLng) : null,
    accuracy: u?.currentAccuracy != null ? Number(u.currentAccuracy) : null,
    updatedAt: u?.locationUpdatedAt ? u.locationUpdatedAt.toISOString() : null,
  };
}

export interface BranchEligibility {
  id: number;
  name: string;
  distance_km: number | null;
  eligible: boolean;
  covered: boolean;
  is_nearest?: boolean;
}

/**
 * Checks whether a specific branch is currently active, unarchived, and covers
 * the authenticated customer's trusted location.
 */
export async function isBranchCoveredForCustomer(userId: number, branchId: number): Promise<boolean> {
  const branch = await prisma.branch.findFirst({
    where: { id: branchId, isActive: true, isArchived: false },
  });
  if (!branch || branch.latitude == null || branch.longitude == null) return false;
  const point = await trustedCustomerPoint(userId);
  if (!point) return false;
  const zones = await prisma.branchDeliveryZone.findMany({
    where: { branchId, isActive: true },
  });
  return coverageFor(branch, zones, point).covered;
}

/**
 * Determine the customer's ELIGIBLE branches server-side.
 * Every branch whose radius or active zones cover the customer's trusted location
 * is marked eligible (Foodpanda model). The closest covered branch is tagged as is_nearest.
 */
export async function nearestEligibleBranchForPoint(
  point: LatLng,
): Promise<{ id: number; distanceKm: number } | null> {
  const branches = await prisma.branch.findMany({
    where: { isActive: true, isArchived: false },
  });
  const covered: { id: number; dist: number }[] = [];
  for (const b of branches) {
    if (b.latitude == null || b.longitude == null) continue;
    const zones = await prisma.branchDeliveryZone.findMany({
      where: { branchId: b.id, isActive: true },
    });
    if (!coverageFor(b, zones, point).covered) continue;
    covered.push({
      id: b.id,
      dist: haversineKm({ lat: Number(b.latitude), lng: Number(b.longitude) }, point),
    });
  }
  covered.sort((a, b) => a.dist - b.dist || a.id - b.id);
  return covered[0] ? { id: covered[0].id, distanceKm: roundKm(covered[0].dist) } : null;
}

export async function nearestEligibleBranch(userId: number): Promise<{
  point: LatLng | null;
  /** Which source the point came from, for UI wording. Null when unresolved. */
  pointSource: PointSource | null;
  nearest: BranchEligibility | null;
  branches: BranchEligibility[];
}> {
  const point = await trustedCustomerPointDetailed(userId);
  const branches = await prisma.branch.findMany({
    where: { isActive: true, isArchived: false },
    orderBy: { name: "asc" },
  });

  const results: (BranchEligibility & { _dist: number | null })[] = [];
  for (const b of branches) {
    if (!point || b.latitude == null || b.longitude == null) {
      results.push({ id: b.id, name: b.name, distance_km: null, eligible: false, covered: false, is_nearest: false, _dist: null });
      continue;
    }
    const zones = await prisma.branchDeliveryZone.findMany({ where: { branchId: b.id, isActive: true } });
    const cov = coverageFor(b, zones, point);
    const dist = haversineKm({ lat: Number(b.latitude), lng: Number(b.longitude) }, point);
    results.push({
      id: b.id,
      name: b.name,
      distance_km: roundKm(dist),
      eligible: cov.covered,
      covered: cov.covered,
      is_nearest: false,
      _dist: dist,
    });
  }

  // Nearest among covered branches
  const covered = results
    .filter((r) => r.covered && r._dist != null)
    .sort((a, b) => a._dist! - b._dist! || a.id - b.id);
  const nearestId = covered[0]?.id ?? null;
  const branchesOut: BranchEligibility[] = results.map((r) => ({
    id: r.id,
    name: r.name,
    distance_km: r.distance_km,
    covered: r.covered,
    eligible: r.covered,
    is_nearest: r.id === nearestId,
  }));
  return {
    point: point ? { lat: point.lat, lng: point.lng } : null,
    pointSource: point?.source ?? null,
    nearest: branchesOut.find((r) => r.id === nearestId) ?? null,
    branches: branchesOut,
  };
}
