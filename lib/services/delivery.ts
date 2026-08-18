import "server-only";
import { Prisma } from "@prisma/client";
import type { Branch, BranchDeliveryZone, User } from "@prisma/client";

import { prisma } from "@/lib/db";
import { validationError, sk } from "@/lib/http/errors";
import { branchAllowsBrand, isProductBrand } from "@/lib/constants/enums";
import { directionsUrl, haversineKm, isValidLatLng, roundKm, type LatLng } from "@/lib/services/geo";
import { resolveManageableBranch, assertManagesBranch } from "@/lib/services/branch-ops";

function branchPoint(b: Pick<Branch, "latitude" | "longitude">): LatLng | null {
  if (b.latitude == null || b.longitude == null) return null;
  return { lat: Number(b.latitude), lng: Number(b.longitude) };
}

// ── Coverage math ───────────────────────────────────────────────────────
/**
 * Whether `point` is covered by a branch: inside the branch's primary radius,
 * or inside any active named zone. Returns the distance to the branch centre and
 * the applicable delivery fee (0 for the primary radius, else the covering
 * zone's fee — the cheapest covering zone wins).
 */
export function coverageFor(
  branch: Pick<Branch, "latitude" | "longitude" | "deliveryRadiusKm">,
  zones: Pick<BranchDeliveryZone, "centerLat" | "centerLng" | "radiusKm" | "deliveryFee" | "isActive">[],
  point: LatLng,
): { covered: boolean; distanceKm: number | null; fee: number } {
  const center = branchPoint(branch);
  const distanceKm = center ? roundKm(haversineKm(center, point)) : null;
  let covered = false;
  let fee = 0;

  if (center && distanceKm != null && distanceKm <= Number(branch.deliveryRadiusKm)) {
    covered = true;
    fee = 0;
  }
  for (const z of zones) {
    if (!z.isActive) continue;
    const zc = { lat: Number(z.centerLat), lng: Number(z.centerLng) };
    if (haversineKm(zc, point) <= Number(z.radiusKm)) {
      const zoneFee = Number(z.deliveryFee);
      if (!covered) {
        covered = true;
        fee = zoneFee;
      } else {
        fee = Math.min(fee, zoneFee);
      }
    }
  }
  return { covered, distanceKm, fee };
}

export interface CoverageOutcome {
  covered: boolean;
  branch_id: number;
  branch_name: string;
  distance_km: number | null;
  delivery_fee: number;
  nearest_pickup: PickupInfo | null;
}

export interface PickupInfo {
  branch_id: number;
  branch_name: string;
  address: string;
  phone: string;
  distance_km: number | null;
  latitude: string | null;
  longitude: string | null;
  opening_time: string | null;
  closing_time: string | null;
  directions_url: string | null;
}

function pickupInfo(branch: Branch, point: LatLng | null): PickupInfo {
  const bp = branchPoint(branch);
  return {
    branch_id: branch.id,
    branch_name: branch.name,
    address: branch.pickupAddress || branch.address,
    phone: branch.pickupPhone || branch.phone,
    distance_km: bp && point ? roundKm(haversineKm(bp, point)) : null,
    latitude: branch.latitude?.toString() ?? null,
    longitude: branch.longitude?.toString() ?? null,
    opening_time: branch.openingTime,
    closing_time: branch.closingTime,
    directions_url: bp ? directionsUrl(bp) : null,
  };
}

/**
 * Nearest active branch offering pickup, respecting active state, pickup
 * availability, coordinates and (when given) brand compatibility.
 */
export async function nearestPickupBranch(point: LatLng, opts: { brand?: string | null; excludeBranchId?: number } = {}): Promise<PickupInfo | null> {
  const branches = await prisma.branch.findMany({
    where: { isActive: true, pickupEnabled: true, latitude: { not: null }, longitude: { not: null } },
  });
  let best: { branch: Branch; d: number } | null = null;
  for (const b of branches) {
    if (opts.excludeBranchId && b.id === opts.excludeBranchId) continue;
    // Only filter by brand when a real PRODUCT brand is supplied (cheez/madchef).
    if (opts.brand && isProductBrand(opts.brand) && !branchAllowsBrand(b.brandType, opts.brand)) continue;
    const bp = branchPoint(b)!;
    const d = haversineKm(bp, point);
    if (!best || d < best.d) best = { branch: b, d };
  }
  return best ? pickupInfo(best.branch, point) : null;
}

/**
 * Full coverage check for a customer point against a specific branch. Always
 * computed server-side. When delivery is not available, the nearest eligible
 * pickup branch is attached.
 */
export async function checkCoverage(branchId: number, point: LatLng, opts: { brand?: string | null } = {}): Promise<CoverageOutcome> {
  const branch = await prisma.branch.findUnique({ where: { id: branchId } });
  if (!branch || !branch.isActive) throw validationError({ branch_id: sk("errors.orders.branchNotFoundOrClosed") });
  const zones = await prisma.branchDeliveryZone.findMany({ where: { branchId, isActive: true } });
  const { covered, distanceKm, fee } = coverageFor(branch, zones, point);

  return {
    covered,
    branch_id: branch.id,
    branch_name: branch.name,
    distance_km: distanceKm,
    delivery_fee: fee,
    // Nearest pickup respects the product brand when one is in play; the branch's
    // own brandType is NOT a product brand and must not filter pickup options.
    nearest_pickup: covered ? null : await nearestPickupBranch(point, { brand: opts.brand ?? null }),
  };
}

// ── Zone CRUD (BM own branch / SA any) ──────────────────────────────────
export function serializeZone(z: BranchDeliveryZone) {
  return {
    id: z.id,
    branch: z.branchId,
    name: z.name,
    center_lat: z.centerLat.toString(),
    center_lng: z.centerLng.toString(),
    radius_km: z.radiusKm.toString(),
    delivery_fee: z.deliveryFee.toString(),
    is_active: z.isActive,
    created_at: z.createdAt.toISOString(),
  };
}

interface ZoneInput {
  branchId?: number;
  name: string;
  centerLat: number;
  centerLng: number;
  radiusKm: number;
  deliveryFee?: number;
  isActive?: boolean;
}

function validateZone(input: ZoneInput) {
  if (!input.name.trim()) throw validationError({ name: sk("errors.ops.zoneNameRequired") });
  if (!isValidLatLng(input.centerLat, input.centerLng)) throw validationError({ center_lat: sk("errors.ops.invalidCoordinates") });
  const r = Number(input.radiusKm);
  if (!Number.isFinite(r) || r <= 0 || r > 100) throw validationError({ radius_km: sk("errors.money.enterValidRadius") });
  const fee = Number(input.deliveryFee ?? 0);
  if (!Number.isFinite(fee) || fee < 0) throw validationError({ delivery_fee: sk("errors.ops.invalidFee") });
}

export async function createZone(user: User, input: ZoneInput) {
  const branch = await resolveManageableBranch(user, input.branchId);
  validateZone(input);
  return prisma.branchDeliveryZone.create({
    data: {
      branchId: branch.id,
      name: input.name.trim(),
      centerLat: new Prisma.Decimal(Number(input.centerLat).toFixed(7)),
      centerLng: new Prisma.Decimal(Number(input.centerLng).toFixed(7)),
      radiusKm: new Prisma.Decimal(Number(input.radiusKm).toFixed(2)),
      deliveryFee: new Prisma.Decimal(Number(input.deliveryFee ?? 0).toFixed(2)),
      isActive: input.isActive ?? true,
    },
  });
}

export async function updateZone(user: User, zoneId: number, input: Partial<ZoneInput>) {
  const zone = await prisma.branchDeliveryZone.findUnique({ where: { id: zoneId } });
  if (!zone) throw validationError({ id: sk("errors.ops.zoneNotFound") });
  await assertManagesBranch(user, zone.branchId);
  const merged = {
    name: input.name ?? zone.name,
    centerLat: input.centerLat ?? Number(zone.centerLat),
    centerLng: input.centerLng ?? Number(zone.centerLng),
    radiusKm: input.radiusKm ?? Number(zone.radiusKm),
    deliveryFee: input.deliveryFee ?? Number(zone.deliveryFee),
  };
  validateZone(merged);
  return prisma.branchDeliveryZone.update({
    where: { id: zoneId },
    data: {
      name: merged.name.trim(),
      centerLat: new Prisma.Decimal(merged.centerLat.toFixed(7)),
      centerLng: new Prisma.Decimal(merged.centerLng.toFixed(7)),
      radiusKm: new Prisma.Decimal(merged.radiusKm.toFixed(2)),
      deliveryFee: new Prisma.Decimal(merged.deliveryFee.toFixed(2)),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
  });
}

export async function deleteZone(user: User, zoneId: number) {
  const zone = await prisma.branchDeliveryZone.findUnique({ where: { id: zoneId } });
  if (!zone) throw validationError({ id: sk("errors.ops.zoneNotFound") });
  await assertManagesBranch(user, zone.branchId);
  await prisma.branchDeliveryZone.delete({ where: { id: zoneId } });
}

export async function zonesForBranch(branchId: number) {
  return prisma.branchDeliveryZone.findMany({ where: { branchId }, orderBy: { createdAt: "asc" } });
}
