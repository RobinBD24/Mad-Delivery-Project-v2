import { Prisma } from "@prisma/client";

import { requireApiRole } from "@/lib/auth/current-user";
import { handle, sk, validationError } from "@/lib/http/errors";
import { created, paginated } from "@/lib/http/respond";
import { prisma } from "@/lib/db";
import { isValidLatLng } from "@/lib/services/geo";
import { serializeAddress } from "@/lib/services/addresses";
import { LIMITS } from "@/lib/validation/limits";
import { validateRequired } from "@/lib/validation/server";

// GET /api/customer/addresses — own saved addresses (active first, default first).
export const GET = handle(async (req: Request) => {
  const me = await requireApiRole("customer");
  const url = new URL(req.url);
  const activeOnly = url.searchParams.get("active") === "1";
  const items = await prisma.customerAddress.findMany({
    where: { userId: me.id, ...(activeOnly ? { isActive: true } : {}) },
    orderBy: [{ isActive: "desc" }, { isDefault: "desc" }, { createdAt: "asc" }],
  });
  return paginated(items.map(serializeAddress));
});

// POST /api/customer/addresses — add an address (req #17). Exactly one active
// default is maintained transactionally; the first active address is the default.
export const POST = handle(async (req: Request) => {
  const me = await requireApiRole("customer");
  const body = (await req.json().catch(() => ({}))) as {
    label?: string;
    custom_label?: string;
    address?: string;
    area?: string;
    instructions?: string;
    latitude?: number;
    longitude?: number;
    is_default?: boolean;
  };
  if (!body.label?.trim()) throw validationError({ label: sk("errors.ops.addressLabelRequired") });
  if (!body.address?.trim()) throw validationError({ address: sk("errors.ops.addressRequired") });
  // Same length caps the customer form enforces before sending.
  const label = validateRequired(body.label, "label", { max: 40 });
  const addressText = validateRequired(body.address, "address", { max: LIMITS.longTextMax });
  if (body.custom_label) validateRequired(body.custom_label, "custom_label", { max: 40 });
  if (body.area) validateRequired(body.area, "area", { max: 80 });
  if (body.instructions) validateRequired(body.instructions, "instructions", { max: 200 });
  let latitude: Prisma.Decimal | null = null;
  let longitude: Prisma.Decimal | null = null;
  if (body.latitude != null && body.longitude != null) {
    if (!isValidLatLng(body.latitude, body.longitude)) {
      throw validationError({ latitude: sk("errors.orders.invalidCoordinates") });
    }
    latitude = new Prisma.Decimal(Number(body.latitude).toFixed(7));
    longitude = new Prisma.Decimal(Number(body.longitude).toFixed(7));
  }

  const activeCount = await prisma.customerAddress.count({ where: { userId: me.id, isActive: true } });
  const makeDefault = Boolean(body.is_default) || activeCount === 0;

  const address = await prisma.$transaction(async (tx) => {
    if (makeDefault) {
      await tx.customerAddress.updateMany({ where: { userId: me.id }, data: { isDefault: false } });
    }
    return tx.customerAddress.create({
      data: {
        userId: me.id,
        label,
        customLabel: body.custom_label?.trim() ?? "",
        address: addressText,
        area: body.area?.trim() ?? "",
        instructions: body.instructions?.trim() ?? "",
        latitude,
        longitude,
        isDefault: makeDefault,
        isActive: true,
      },
    });
  });
  return created(serializeAddress(address));
});
