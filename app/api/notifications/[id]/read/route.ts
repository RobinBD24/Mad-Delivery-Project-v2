import { requireApiUser } from "@/lib/auth/current-user";
import { handle } from "@/lib/http/errors";
import { json } from "@/lib/http/respond";
import { prisma } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/notifications/[id]/read — mark one of the caller's notifications read.
export const POST = handle(async (_req: Request, ctx: Ctx) => {
  const me = await requireApiUser();
  const { id } = await ctx.params;
  await prisma.notification.updateMany({
    where: { id: Number(id), userId: me.id },
    data: { isRead: true },
  });
  return json({ ok: true });
});
