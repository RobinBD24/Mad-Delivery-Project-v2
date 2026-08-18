import { requireApproved } from "@/lib/auth/current-user";
import { handle } from "@/lib/http/errors";
import { created } from "@/lib/http/respond";
import { serializeComplaintMessage } from "@/lib/serializers";
import { addComplaintMessage } from "@/lib/services/complaints";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/complaints/[id]/messages  { body } — reply on the thread.
export const POST = handle(async (req: Request, ctx: Ctx) => {
  const me = await requireApproved();
  const { id } = await ctx.params;
  const payload = (await req.json().catch(() => ({}))) as { body?: string };
  const msg = await addComplaintMessage(Number(id), me, String(payload.body ?? ""));
  return created(serializeComplaintMessage(msg));
});
