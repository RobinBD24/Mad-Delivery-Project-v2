import { requireApiRole } from "@/lib/auth/current-user";
import { handle } from "@/lib/http/errors";
import { json } from "@/lib/http/respond";
import { prisma } from "@/lib/db";
import { activeDutySession, eligibleBranchesForRider, serializeDutySession } from "@/lib/services/rider-duty";
import { serializePublicBranch } from "@/lib/serializers";

// GET /api/rider/duty — current active session (+ its duty chat thread) and the
// list of eligible active branches the rider may go on duty for.
export const GET = handle(async () => {
  const me = await requireApiRole("rider");
  const active = await activeDutySession(me.id);
  const thread = active ? await prisma.riderDutyChatThread.findUnique({ where: { sessionId: active.id } }) : null;
  const branches = await eligibleBranchesForRider();
  return json({
    active_session: active ? serializeDutySession(active) : null,
    duty_chat_thread: thread ? thread.id : null,
    eligible_branches: branches.map(serializePublicBranch),
  });
});
