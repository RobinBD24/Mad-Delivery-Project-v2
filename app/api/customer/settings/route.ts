import { requireApiUser } from "@/lib/auth/current-user";
import { handle } from "@/lib/http/errors";
import { json } from "@/lib/http/respond";
import { prisma } from "@/lib/db";

// GET /api/customer/settings — own preferences.
export const GET = handle(async () => {
  const me = await requireApiUser();
  return json({ notifications_enabled: me.notificationsEnabled });
});

// PATCH /api/customer/settings  { notifications_enabled }
export const PATCH = handle(async (req: Request) => {
  const me = await requireApiUser();
  const body = (await req.json().catch(() => ({}))) as { notifications_enabled?: boolean };
  const updated = await prisma.user.update({
    where: { id: me.id },
    data: { notificationsEnabled: Boolean(body.notifications_enabled) },
  });
  return json({ notifications_enabled: updated.notificationsEnabled });
});
