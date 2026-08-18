import { requireApiUser } from "@/lib/auth/current-user";
import { handle } from "@/lib/http/errors";
import { json } from "@/lib/http/respond";
import { prisma } from "@/lib/db";

// POST /api/notifications/read-all — mark all the caller's notifications read.
export const POST = handle(async () => {
  const me = await requireApiUser();
  const { count } = await prisma.notification.updateMany({
    where: { userId: me.id, isRead: false },
    data: { isRead: true },
  });
  return json({ ok: true, updated: count });
});
