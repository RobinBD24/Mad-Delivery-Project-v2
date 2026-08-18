import { requireApproved } from "@/lib/auth/current-user";
import { handle } from "@/lib/http/errors";
import { json } from "@/lib/http/respond";
import { serializeComplaint } from "@/lib/serializers";
import { changeComplaintStatus } from "@/lib/services/complaints";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/complaints/[id]/status  { status } — recipient/super-admin updates status.
export const POST = handle(async (req: Request, ctx: Ctx) => {
  const me = await requireApproved();
  const { id } = await ctx.params;
  const payload = (await req.json().catch(() => ({}))) as { status?: string };
  const complaint = await changeComplaintStatus(Number(id), String(payload.status ?? ""), me);
  return json(serializeComplaint(complaint));
});
