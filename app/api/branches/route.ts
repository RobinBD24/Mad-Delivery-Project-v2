import { Prisma } from "@prisma/client";

import { requireApproved } from "@/lib/auth/current-user";
import { forbidden, handle, sk, validationError } from "@/lib/http/errors";
import { parseBody } from "@/lib/http/form";
import { created, pageParams, paginated } from "@/lib/http/respond";
import { saveUpload } from "@/lib/http/upload";
import { prisma } from "@/lib/db";
import { serializeBranch } from "@/lib/serializers";
import { isBrandType } from "@/lib/constants/enums";
import { isValidLatLng } from "@/lib/services/geo";
import { validatePhone } from "@/lib/validation/server";

// GET /api/branches — all branches for staff; active-only for customer/rider.
export const GET = handle(async (req: Request) => {
  const me = await requireApproved();
  const url = new URL(req.url);
  const { skip, take, page, pageSize } = pageParams(url);

  const where: Prisma.BranchWhereInput = {};
  // req #5 — customers/riders never see archived branches; they're inactive.
  if (me.role === "customer" || me.role === "rider") {
    where.isActive = true;
    where.isArchived = false;
  }
  const isActive = url.searchParams.get("is_active");
  if (isActive === "true" || isActive === "false") where.isActive = isActive === "true";

  // req #11 — server-side branch search. Whitespace is trimmed; SQLite LIKE is
  // case-insensitive for ASCII (same convention as adminUserListWhere). Matches
  // the branch name, its address, and the names of its delivery areas, so a
  // customer can find a branch by the area it delivers to. Search NEVER widens
  // visibility: the role-based active/non-archived clause above still applies,
  // and nearest-branch eligibility is decided separately server-side.
  const search = (url.searchParams.get("search") ?? "").trim().slice(0, 80);
  if (search) {
    where.OR = [
      { name: { contains: search } },
      { address: { contains: search } },
      { deliveryAreas: { some: { name: { contains: search }, isActive: true } } },
    ];
  }

  const [count, branches] = await Promise.all([
    prisma.branch.count({ where }),
    prisma.branch.findMany({ where, include: { manager: true }, orderBy: { createdAt: "desc" }, skip, take }),
  ]);
  return paginated(branches.map(serializeBranch), { page, pageSize, count });
});

// POST /api/branches — Super Admin creates a branch (multipart w/ optional logo).
export const POST = handle(async (req: Request) => {
  const me = await requireApproved();
  if (me.role !== "super_admin") throw forbidden(sk("errors.catalog.onlySuperAdminCanCreateBranch"));
  const { fields, file } = await parseBody(req);

  const name = (fields.name ?? "").trim();
  const address = (fields.address ?? "").trim();
  const phone = (fields.phone ?? "").trim();
  const errs: Record<string, string> = {};
  if (!name) errs.name = sk("errors.catalog.branchNameRequired");
  if (!address) errs.address = sk("errors.catalog.addressRequired");
  if (!phone) errs.phone = sk("errors.catalog.phoneRequired");
  if (Object.keys(errs).length) throw validationError(errs);
  validatePhone(phone);

  const brandType = (fields.brand_type ?? "combined").trim();
  if (!isBrandType(brandType)) throw validationError({ brand_type: sk("errors.catalog.invalidBrandType") });

  const data: Prisma.BranchCreateInput = {
    name,
    address,
    phone,
    email: fields.email ?? "",
    brandType,
    bkashNumber: fields.bkash_number ?? "",
    openingTime: fields.opening_time || null,
    closingTime: fields.closing_time || null,
    isActive: fields.is_active ? fields.is_active === "true" : true,
  };
  if (fields.prep_time_minutes) {
    const p = Number(fields.prep_time_minutes);
    if (!Number.isFinite(p) || p <= 0) throw validationError({ prep_time_minutes: sk("errors.ops.invalidPrepTime") });
    data.prepTimeMinutes = Math.round(p);
  }
  if (fields.pickup_enabled !== undefined) data.pickupEnabled = fields.pickup_enabled === "true";
  if (fields.pickup_address !== undefined) data.pickupAddress = fields.pickup_address;
  if (fields.pickup_phone !== undefined) data.pickupPhone = fields.pickup_phone;
  // req #2 — coordinates no longer come from raw UI text fields, but any that
  // enter (preserved hidden values, geocoding) are validated server-side. Both
  // must be finite + in range, or the pair is rejected.
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

  const branch = await prisma.branch.create({ data, include: { manager: true } });
  return created(serializeBranch(branch));
});
