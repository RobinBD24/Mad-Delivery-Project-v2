import { requireApproved } from "@/lib/auth/current-user";
import { forbidden, handle, notFound } from "@/lib/http/errors";
import { json } from "@/lib/http/respond";
import { prisma } from "@/lib/db";
import { serializeComplaint } from "@/lib/serializers";
import { COMPLAINT_DETAIL_INCLUDE, isComplaintHandler } from "@/lib/services/complaints";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/complaints/[id] — detail with full message thread.
export const GET = handle(async (_req: Request, ctx: Ctx) => {
  const me = await requireApproved();
  const { id } = await ctx.params;
  const complaint = await prisma.complaint.findUnique({
    where: { id: Number(id) },
    include: COMPLAINT_DETAIL_INCLUDE,
  });
  if (!complaint) throw notFound();

  const isOwner = complaint.complainantId === me.id;
  const canHandle = await isComplaintHandler(me, complaint);
  if (!isOwner && !canHandle) throw forbidden();

  return json(serializeComplaint(complaint));
});
