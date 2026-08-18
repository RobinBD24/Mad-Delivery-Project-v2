import { Prisma } from "@prisma/client";

import { requireApiRole } from "@/lib/auth/current-user";
import { handle, sk, validationError } from "@/lib/http/errors";
import { json } from "@/lib/http/respond";
import { prisma } from "@/lib/db";
import { requireManagerBranch } from "@/lib/services/branch-ops";

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function coordinate(
  value: number | string,
  min: number,
  max: number,
): Prisma.Decimal {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw validationError({ location: sk("errors.ops.invalidCoordinates") });
  }
  return new Prisma.Decimal(parsed.toFixed(7));
}

// GET /api/branch-manager/delivery-settings — own branch coverage, prep time,
// pickup config and named zones.
export const GET = handle(async () => {
  const me = await requireApiRole("branch_manager");
  const branch = await requireManagerBranch(me);
  const zones = await prisma.branchDeliveryZone.findMany({ where: { branchId: branch.id }, orderBy: { createdAt: "asc" } });
  return json({
    branch_id: branch.id,
    branch_name: branch.name,
    latitude: branch.latitude?.toString() ?? null,
    longitude: branch.longitude?.toString() ?? null,
    delivery_radius_km: branch.deliveryRadiusKm.toString(),
    prep_time_minutes: branch.prepTimeMinutes,
    pickup_enabled: branch.pickupEnabled,
    pickup_address: branch.pickupAddress,
    pickup_phone: branch.pickupPhone,
    opening_time: branch.openingTime,
    closing_time: branch.closingTime,
    zones: zones.map((z) => ({
      id: z.id,
      name: z.name,
      center_lat: z.centerLat.toString(),
      center_lng: z.centerLng.toString(),
      radius_km: z.radiusKm.toString(),
      delivery_fee: z.deliveryFee.toString(),
      is_active: z.isActive,
    })),
  });
});

// PATCH /api/branch-manager/delivery-settings — set zone (radius/center) + hours.
export const PATCH = handle(async (req: Request) => {
  const me = await requireApiRole("branch_manager");
  const branch = await requireManagerBranch(me);
  const body = (await req.json().catch(() => ({}))) as {
    delivery_radius_km?: number | string;
    latitude?: number | string;
    longitude?: number | string;
    prep_time_minutes?: number | string;
    pickup_enabled?: boolean;
    pickup_address?: string;
    pickup_phone?: string;
    opening_time?: string;
    closing_time?: string;
  };
  const data: Prisma.BranchUpdateInput = {};

  if (body.delivery_radius_km !== undefined) {
    const r = Number(body.delivery_radius_km);
    if (Number.isNaN(r) || r <= 0 || r > 100) throw validationError({ delivery_radius_km: sk("errors.money.enterValidRadius") });
    data.deliveryRadiusKm = new Prisma.Decimal(r.toFixed(1));
  }
  if (body.prep_time_minutes !== undefined) {
    const p = Number(body.prep_time_minutes);
    if (!Number.isFinite(p) || p <= 0) throw validationError({ prep_time_minutes: sk("errors.ops.invalidPrepTime") });
    data.prepTimeMinutes = Math.round(p);
  }
  if (body.pickup_enabled !== undefined) data.pickupEnabled = Boolean(body.pickup_enabled);
  if (body.pickup_address !== undefined) data.pickupAddress = String(body.pickup_address);
  if (body.pickup_phone !== undefined) data.pickupPhone = String(body.pickup_phone);
  if (body.latitude !== undefined && body.latitude !== "") {
    data.latitude = coordinate(body.latitude, -90, 90);
  }
  if (body.longitude !== undefined && body.longitude !== "") {
    data.longitude = coordinate(body.longitude, -180, 180);
  }
  for (const [key, field] of [["opening_time", "openingTime"], ["closing_time", "closingTime"]] as const) {
    const v = body[key];
    if (v !== undefined) {
      if (v && !TIME_RE.test(v)) throw validationError({ [key]: sk("errors.money.enterValidTime") });
      (data as Record<string, unknown>)[field] = v || null;
    }
  }

  await prisma.branch.update({ where: { id: branch.id }, data });
  return json({ ok: true });
});
