import type { Prisma } from "@prisma/client";

import { requireApproved, requireApiRole } from "@/lib/auth/current-user";
import { handle } from "@/lib/http/errors";
import { created, pageParams, paginated } from "@/lib/http/respond";
import { prisma } from "@/lib/db";
import {
  RESERVATION_INCLUDE,
  createReservation,
  reservationsWhereForUser,
  serializeReservation,
} from "@/lib/services/branch-ops";

// GET /api/reservations — role-scoped (?status=).
export const GET = handle(async (req: Request) => {
  const me = await requireApproved();
  const scope = await reservationsWhereForUser(me);
  if (scope === null) return paginated([]);
  const url = new URL(req.url);
  const { skip, take, page, pageSize } = pageParams(url);
  const where: Prisma.TableReservationWhereInput = { ...scope };
  const status = url.searchParams.get("status");
  if (status) where.status = status;

  const [count, items] = await Promise.all([
    prisma.tableReservation.count({ where }),
    prisma.tableReservation.findMany({ where, include: RESERVATION_INCLUDE, orderBy: { requestedAt: "desc" }, skip, take }),
  ]);
  return paginated(items.map(serializeReservation), { page, pageSize, count });
});

// POST /api/reservations — customer requests a table.
export const POST = handle(async (req: Request) => {
  const me = await requireApiRole("customer");
  const body = (await req.json().catch(() => ({}))) as {
    branch_id?: number;
    guest_name?: string;
    guest_phone?: string;
    party_size?: number;
    requested_at?: string;
    note?: string;
    table_id?: number | null;
  };
  const reservation = await createReservation(me, {
    branchId: Number(body.branch_id),
    guestName: String(body.guest_name ?? ""),
    guestPhone: String(body.guest_phone ?? ""),
    partySize: Number(body.party_size ?? 2),
    requestedAt: String(body.requested_at ?? ""),
    note: String(body.note ?? ""),
    tableId: body.table_id != null ? Number(body.table_id) : null,
  });
  return created(serializeReservation(reservation));
});
