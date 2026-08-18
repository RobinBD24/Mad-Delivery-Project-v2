import { Prisma } from "@prisma/client";

import { requireApiRole } from "@/lib/auth/current-user";
import { handle, notFound, sk, validationError } from "@/lib/http/errors";
import { json, noContent } from "@/lib/http/respond";
import { prisma } from "@/lib/db";
import { isValidLatLng } from "@/lib/services/geo";
import { serializeAddress } from "@/lib/services/addresses";

type Ctx = { params: Promise<{ id: string }> };

// PATCH /api/customer/addresses/[id] — own address only (IDOR-safe). Default
// switching is transactional. (req #17)
export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const me = await requireApiRole("customer");
  const { id } = await ctx.params;
  const existing = await prisma.customerAddress.findFirst({ where: { id: Number(id), userId: me.id } });
  if (!existing) throw notFound();

  const body = (await req.json().catch(() => ({}))) as {
    label?: string;
    custom_label?: string;
    address?: string;
    area?: string;
    instructions?: string;
    latitude?: number | null;
    longitude?: number | null;
    is_default?: boolean;
    is_active?: boolean;
  };
  if (body.label !== undefined && !body.label.trim()) throw validationError({ label: sk("errors.ops.labelRequired") });
  if (body.address !== undefined && !body.address.trim()) throw validationError({ address: sk("errors.ops.addressRequired") });

  const data: Prisma.CustomerAddressUpdateInput = {};
  if (body.label !== undefined) data.label = body.label.trim();
  if (body.custom_label !== undefined) data.customLabel = body.custom_label.trim();
  if (body.address !== undefined) data.address = body.address.trim();
  if (body.area !== undefined) data.area = body.area.trim();
  if (body.instructions !== undefined) data.instructions = body.instructions.trim();
  if (body.latitude !== undefined || body.longitude !== undefined) {
    if (body.latitude == null || body.longitude == null) {
      data.latitude = null;
      data.longitude = null;
    } else {
      if (!isValidLatLng(body.latitude, body.longitude)) throw validationError({ latitude: sk("errors.orders.invalidCoordinates") });
      data.latitude = new Prisma.Decimal(Number(body.latitude).toFixed(7));
      data.longitude = new Prisma.Decimal(Number(body.longitude).toFixed(7));
    }
  }
  if (body.is_active !== undefined) data.isActive = Boolean(body.is_active);

  const updated = await prisma.$transaction(async (tx) => {
    // Setting default clears all others (exactly one active default).
    if (body.is_default) {
      await tx.customerAddress.updateMany({ where: { userId: me.id }, data: { isDefault: false } });
      data.isDefault = true;
    }
    const row = await tx.customerAddress.update({ where: { id: existing.id }, data });
    // If this address was default and is being deactivated, hand the default to
    // another active address so exactly one active default remains.
    if (row.isDefault && row.isActive === false) {
      await tx.customerAddress.update({ where: { id: row.id }, data: { isDefault: false } });
      const next = await tx.customerAddress.findFirst({
        where: { userId: me.id, isActive: true, id: { not: row.id } },
        orderBy: { createdAt: "asc" },
      });
      if (next) await tx.customerAddress.update({ where: { id: next.id }, data: { isDefault: true } });
      return tx.customerAddress.findUniqueOrThrow({ where: { id: row.id } });
    }
    return row;
  });
  return json(serializeAddress(updated));
});

// DELETE /api/customer/addresses/[id] — own address only. Deleting the default
// atomically promotes another active address; blocked only if it is the sole
// active address AND others exist inactive is fine (no active default needed).
export const DELETE = handle(async (_req: Request, ctx: Ctx) => {
  const me = await requireApiRole("customer");
  const { id } = await ctx.params;
  const existing = await prisma.customerAddress.findFirst({ where: { id: Number(id), userId: me.id } });
  if (!existing) throw notFound();

  await prisma.$transaction(async (tx) => {
    await tx.customerAddress.delete({ where: { id: existing.id } });
    if (existing.isDefault) {
      const next = await tx.customerAddress.findFirst({
        where: { userId: me.id, isActive: true },
        orderBy: { createdAt: "asc" },
      });
      if (next) await tx.customerAddress.update({ where: { id: next.id }, data: { isDefault: true } });
    }
  });
  return noContent();
});
