import { requireApproved } from "@/lib/auth/current-user";
import { handle } from "@/lib/http/errors";
import { json } from "@/lib/http/respond";
import { serializeReservation, setReservationStatus } from "@/lib/services/branch-ops";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/reservations/[id]/status  { status }
export const POST = handle(async (req: Request, ctx: Ctx) => {
  const me = await requireApproved();
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { status?: string; rejection_reason?: string; table_id?: number | null };
  const reservation = await setReservationStatus(Number(id), String(body.status ?? ""), me, {
    rejectionReason: body.rejection_reason,
    tableId: body.table_id !== undefined ? (body.table_id != null ? Number(body.table_id) : null) : undefined,
  });
  return json(serializeReservation(reservation));
});
