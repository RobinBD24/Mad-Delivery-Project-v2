import { requireApproved } from "@/lib/auth/current-user";
import { handle } from "@/lib/http/errors";
import { created, json } from "@/lib/http/respond";
import { addReservationMessage, reservationMessages } from "@/lib/services/branch-ops";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/reservations/[id]/messages — membership-checked history (for polling).
export const GET = handle(async (_req: Request, ctx: Ctx) => {
  const me = await requireApproved();
  const { id } = await ctx.params;
  const messages = await reservationMessages(me, Number(id));
  return json({
    results: messages.map((m) => ({
      id: m.id,
      sender: m.senderId,
      sender_name: `${m.sender.firstName} ${m.sender.lastName}`.trim() || m.sender.username,
      sender_role: m.sender.role,
      body: m.body,
      created_at: m.createdAt.toISOString(),
    })),
  });
});

// POST /api/reservations/[id]/messages  { body }
export const POST = handle(async (req: Request, ctx: Ctx) => {
  const me = await requireApproved();
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { body?: string };
  const msg = await addReservationMessage(Number(id), me, String(body.body ?? ""));
  return created({
    id: msg.id,
    sender: msg.senderId,
    sender_name: `${msg.sender.firstName} ${msg.sender.lastName}`.trim() || msg.sender.username,
    sender_role: msg.sender.role,
    body: msg.body,
    created_at: msg.createdAt.toISOString(),
  });
});
