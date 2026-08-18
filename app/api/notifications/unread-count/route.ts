import { getSessionUser } from "@/lib/auth/current-user";
import { handle } from "@/lib/http/errors";
import { json } from "@/lib/http/respond";
import { unreadCount } from "@/lib/services/notifications";

// GET /api/notifications/unread-count — { count }. Returns 0 for anonymous so
// the topbar bell can poll without erroring during sign-out.
export const GET = handle(async () => {
  const me = await getSessionUser();
  if (!me) return json({ count: 0 });
  return json({ count: await unreadCount(me.id) });
});
