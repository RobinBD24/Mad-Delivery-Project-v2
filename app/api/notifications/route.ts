import type { Prisma } from "@prisma/client";

import { requireApiUser } from "@/lib/auth/current-user";
import { handle } from "@/lib/http/errors";
import { pageParams, paginated } from "@/lib/http/respond";
import { prisma } from "@/lib/db";
import { serializeNotification } from "@/lib/serializers";

// GET /api/notifications — the caller's own inbox (?unread=1 for unread only).
export const GET = handle(async (req: Request) => {
  const me = await requireApiUser();
  const url = new URL(req.url);
  const { skip, take, page, pageSize } = pageParams(url);
  const where: Prisma.NotificationWhereInput = { userId: me.id };
  if (url.searchParams.get("unread") === "1") where.isRead = false;

  const [count, items] = await Promise.all([
    prisma.notification.count({ where }),
    prisma.notification.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
  ]);
  return paginated(items.map(serializeNotification), { page, pageSize, count });
});
