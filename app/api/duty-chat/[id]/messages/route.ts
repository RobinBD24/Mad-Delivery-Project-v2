import { requireApproved } from "@/lib/auth/current-user";
import { handle } from "@/lib/http/errors";
import { created, json } from "@/lib/http/respond";
import { dutyMessages, sendDutyMessage, serializeChatMessage } from "@/lib/services/rider-duty";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/duty-chat/[id]/messages — membership-checked (rider / branch manager / SA read).
export const GET = handle(async (_req: Request, ctx: Ctx) => {
  const me = await requireApproved();
  const { id } = await ctx.params;
  const { thread, messages } = await dutyMessages(me, Number(id));
  return json({ thread: thread.id, is_closed: thread.isClosed, results: messages.map(serializeChatMessage) });
});

// POST /api/duty-chat/[id]/messages  { body }
export const POST = handle(async (req: Request, ctx: Ctx) => {
  const me = await requireApproved();
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { body?: string };
  const msg = await sendDutyMessage(me, Number(id), String(body.body ?? ""));
  return created(serializeChatMessage(msg));
});
