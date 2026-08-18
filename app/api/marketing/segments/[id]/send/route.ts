import { requireApiRole } from "@/lib/auth/current-user";
import { handle, notFound, sk, validationError } from "@/lib/http/errors";
import { json } from "@/lib/http/respond";
import { prisma } from "@/lib/db";
import { evaluateSegment } from "@/lib/services/marketing";
import { notifyUsers } from "@/lib/services/notifications";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/marketing/segments/[id]/send  { title, body } — targeted marketing notification.
export const POST = handle(async (req: Request, ctx: Ctx) => {
  const me = await requireApiRole("marketing", "super_admin");
  const { id } = await ctx.params;
  const segment = await prisma.audienceSegment.findUnique({ where: { id: Number(id) } });
  if (!segment) throw notFound();

  const payload = (await req.json().catch(() => ({}))) as { title?: string; body?: string };
  if (!payload.title?.trim()) throw validationError({ title: sk("errors.ops.titleRequired") });

  const userIds = await evaluateSegment(segment.criteria);
  const notice = await prisma.notice.create({
    data: {
      authorId: me.id,
      title: payload.title.trim(),
      body: (payload.body ?? "").trim(),
      audience: "customer",
      type: "marketing",
    },
  });
  const sent = await notifyUsers(userIds, {
    type: "marketing",
    title: payload.title.trim(),
    body: (payload.body ?? "").trim(),
    noticeId: notice.id,
  });
  await prisma.notice.update({ where: { id: notice.id }, data: { recipients: sent } });
  return json({ ok: true, sent, segment: segment.name });
});
