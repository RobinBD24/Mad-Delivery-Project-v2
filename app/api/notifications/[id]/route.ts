import { requireApiUser } from "@/lib/auth/current-user";
import { handle } from "@/lib/http/errors";
import { json } from "@/lib/http/respond";
import { prisma } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

// DELETE /api/notifications/[id] — remove one of the caller's own notifications.
// Scoped by userId so a caller can never delete another user's notification.
export const DELETE = handle(async (_req: Request, ctx: Ctx) => {
  const me = await requireApiUser();
  const { id } = await ctx.params;
  const { count } = await prisma.notification.deleteMany({
    where: { id: Number(id), userId: me.id },
  });
  return json({ ok: true, deleted: count });
});
