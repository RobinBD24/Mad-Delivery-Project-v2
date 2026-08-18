import { requireApproved } from "@/lib/auth/current-user";
import { handle } from "@/lib/http/errors";
import { json } from "@/lib/http/respond";
import { serializeReservation, setRamadanStatus } from "@/lib/services/ramadan";

type Ctx = { params: Promise<{ id: string }> };
// POST /api/ramadan/reservations/[id]/status  { status, rejection_reason? }
export const POST = handle(async (req: Request, ctx: Ctx) => {
  const me = await requireApproved();
  const { id } = await ctx.params;
  const b = (await req.json().catch(() => ({}))) as { status?: string; rejection_reason?: string };
  const r = await setRamadanStatus(Number(id), String(b.status ?? ""), me, { reason: b.rejection_reason });
  return json(serializeReservation(r));
});
