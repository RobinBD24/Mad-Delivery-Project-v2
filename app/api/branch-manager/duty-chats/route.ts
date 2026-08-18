import { requireApiRole } from "@/lib/auth/current-user";
import { handle } from "@/lib/http/errors";
import { json } from "@/lib/http/respond";
import { prisma } from "@/lib/db";
import { requireManagerBranch } from "@/lib/services/branch-ops";

// GET /api/branch-manager/duty-chats — riders currently on active duty for the
// manager's own branch, with their duty-chat thread + unread flag.
export const GET = handle(async () => {
  const me = await requireApiRole("branch_manager");
  const branch = await requireManagerBranch(me);
  const sessions = await prisma.riderBranchDutySession.findMany({
    where: { branchId: branch.id, status: "active" },
    include: { rider: true, chatThread: { include: { messages: { orderBy: { createdAt: "desc" }, take: 1 } } } },
    orderBy: { startedAt: "desc" },
  });
  return json({
    branch: branch.id,
    results: sessions.map((s) => {
      const thread = s.chatThread;
      const last = thread?.messages[0];
      const unread = Boolean(last && last.senderId === s.riderId && (!thread?.managerLastReadAt || last.createdAt > thread.managerLastReadAt));
      return {
        session: s.id,
        rider: s.riderId,
        rider_name: `${s.rider.firstName} ${s.rider.lastName}`.trim() || s.rider.username,
        rider_phone: s.rider.phone,
        started_at: s.startedAt.toISOString(),
        duty_chat_thread: thread?.id ?? null,
        has_unread: unread,
      };
    }),
  });
});
