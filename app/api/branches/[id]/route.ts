import { Prisma } from "@prisma/client";

import { requireApproved } from "@/lib/auth/current-user";
import { forbidden, handle, notFound, sk, validationError } from "@/lib/http/errors";
import { parseBody } from "@/lib/http/form";
import { json } from "@/lib/http/respond";
import { saveUpload } from "@/lib/http/upload";
import { revalidateCatalog } from "@/lib/cache/catalog";
import { prisma } from "@/lib/db";
import { serializeBranch } from "@/lib/serializers";
import { isBrandType } from "@/lib/constants/enums";
import { isValidLatLng } from "@/lib/services/geo";
import { archiveOrDeleteBranch } from "@/lib/services/branches";
import { validatePhone } from "@/lib/validation/server";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/branches/[id]
export const GET = handle(async (_req: Request, ctx: Ctx) => {
  const me = await requireApproved();
  const { id } = await ctx.params;
  const branch = await prisma.branch.findUnique({ where: { id: Number(id) }, include: { manager: true } });
  if (
    !branch ||
    ((me.role === "customer" || me.role === "rider") &&
      (!branch.isActive || branch.isArchived))
  ) {
    throw notFound(sk("errors.catalog.branchNotFound"));
  }
  return json(serializeBranch(branch));
});

// PATCH /api/branches/[id] — Super Admin only.
export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const me = await requireApproved();
  if (me.role !== "super_admin") throw forbidden(sk("errors.catalog.onlySuperAdminCanModifyBranch"));
  const { id } = await ctx.params;
  const { fields, file, has } = await parseBody(req);

  const data: Prisma.BranchUpdateInput = {};
  if (has("name")) data.name = fields.name;
  if (has("address")) data.address = fields.address;
  if (has("email")) data.email = fields.email;
  if (has("brand_type")) {
    if (!isBrandType(fields.brand_type)) throw validationError({ brand_type: sk("errors.catalog.invalidBrandType") });
    data.brandType = fields.brand_type;
  }
  if (has("prep_time_minutes")) {
    const p = Number(fields.prep_time_minutes);
    if (!Number.isFinite(p) || p <= 0) throw validationError({ prep_time_minutes: sk("errors.ops.invalidPrepTime") });
    data.prepTimeMinutes = Math.round(p);
  }
  if (has("pickup_enabled")) data.pickupEnabled = fields.pickup_enabled === "true";
  if (has("pickup_address")) data.pickupAddress = fields.pickup_address;
  if (has("pickup_phone")) data.pickupPhone = fields.pickup_phone;
  if (has("bkash_number")) data.bkashNumber = fields.bkash_number;
  if (has("opening_time")) data.openingTime = fields.opening_time || null;
  if (has("closing_time")) data.closingTime = fields.closing_time || null;
  if (has("is_active")) data.isActive = fields.is_active === "true";
  if (fields.phone) data.phone = validatePhone(fields.phone);
  // req #2 — validate any coordinates that enter (preserved hidden values,
  // geocoding); never trusted for distance/nearest, which are recomputed.
  if (fields.latitude || fields.longitude) {
    const lat = Number(fields.latitude);
    const lng = Number(fields.longitude);
    if (!isValidLatLng(lat, lng)) throw validationError({ latitude: sk("errors.orders.invalidCoordinates") });
    data.latitude = new Prisma.Decimal(lat.toFixed(7));
    data.longitude = new Prisma.Decimal(lng.toFixed(7));
  }
  if (fields.delivery_radius_km) data.deliveryRadiusKm = new Prisma.Decimal(fields.delivery_radius_km);

  const logo = file("logo");
  if (logo) data.logo = await saveUpload(logo, "branch_logos", "logo");

  const existing = await prisma.branch.findUnique({ where: { id: Number(id) } });
  if (!existing) throw notFound(sk("errors.catalog.branchNotFound"));
  if (Object.keys(data).length === 0) {
    validationError({ detail: sk("errors.catalog.nothingToChange") });
  }
  const branch = await prisma.branch.update({ where: { id: Number(id) }, data, include: { manager: true } });
  // `brand_type` and `is_active` both change which of this branch's products a
  // customer may see (BRAND_MATCHES_BRANCH / LIVE_BRANCH in the shared rules).
  if (has("brand_type") || has("is_active")) revalidateCatalog({ branchId: branch.id });
  return json(serializeBranch(branch));
});

// DELETE /api/branches/[id] — Super Admin only.
// DELETE /api/branches/[id] — SUPER ADMIN ONLY (req #5). Dependency-aware:
// a branch with history is ARCHIVED (all records preserved, no new orders); a
// genuinely unused branch is hard-deleted. Returns { action, dependencies } so
// the UI can say accurately whether it deleted or archived.
export const DELETE = handle(async (_req: Request, ctx: Ctx) => {
  const me = await requireApproved();
  if (me.role !== "super_admin") throw forbidden(sk("errors.catalog.onlySuperAdminCanDeleteBranch"));
  const { id } = await ctx.params;
  const result = await archiveOrDeleteBranch(me.id, Number(id));
  return json({ action: result.action, dependencies: result.dependencies });
});
