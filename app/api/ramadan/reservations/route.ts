import type { Prisma } from "@prisma/client";

import { requireApiRole, requireApproved } from "@/lib/auth/current-user";
import { handle } from "@/lib/http/errors";
import { created, pageParams, paginated } from "@/lib/http/respond";
import { prisma } from "@/lib/db";
import { RES_INCLUDE, createRamadanReservation, reservationScope, serializeReservation } from "@/lib/services/ramadan";

// GET /api/ramadan/reservations?status=&branch_id= — role-scoped.
export const GET = handle(async (req: Request) => {
  const me = await requireApproved();
  const scope = await reservationScope(me);
  if (scope === null) return paginated([]);
  const url = new URL(req.url);
  const where: Prisma.RamadanReservationWhereInput = { ...scope };
  const status = url.searchParams.get("status");
  if (status) where.status = status;
  const branchId = url.searchParams.get("branch_id");
  if (branchId && (me.role === "super_admin" || me.role === "management" || me.role === "accounts")) where.branchId = Number(branchId);
  const { skip, take, page, pageSize } = pageParams(url);
  const [count, rows] = await Promise.all([
    prisma.ramadanReservation.count({ where }),
    prisma.ramadanReservation.findMany({ where, include: RES_INCLUDE, orderBy: { createdAt: "desc" }, skip, take }),
  ]);
  return paginated(rows.map(serializeReservation), { page, pageSize, count });
});

// POST /api/ramadan/reservations — customer creates a Ramadan booking.
export const POST = handle(async (req: Request) => {
  const me = await requireApiRole("customer");
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const reservation = await createRamadanReservation(me, {
    branchId: Number(b.branch_id), bookingDate: String(b.booking_date ?? ""), slotId: Number(b.slot_id),
    tableId: Number(b.table_id), menuId: Number(b.menu_id), quantity: b.quantity != null ? Number(b.quantity) : undefined,
    guestName: String(b.guest_name ?? ""), guestPhone: String(b.guest_phone ?? ""), partySize: Number(b.party_size ?? 2),
    specialRequest: String(b.special_request ?? ""),
  });
  return created(serializeReservation(reservation));
});
