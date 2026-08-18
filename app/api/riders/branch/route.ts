import { requireApproved } from "@/lib/auth/current-user";
import { forbidden, handle } from "@/lib/http/errors";
import { json } from "@/lib/http/respond";
import { prisma } from "@/lib/db";
import { branchForManager } from "@/lib/selectors";
import { serializeRiderProfile } from "@/lib/serializers";

// GET /api/riders/branch — riders for the branch manager's (or super admin's)
// branch, with AUTHORITATIVE online state (req #11). Online = the rider has an
// ACTIVE duty session for THIS branch — never the stale RiderProfile.isOnline
// flag. Riders on active duty here plus riders permanently assigned here are
// returned; a rider on duty at another branch is not shown as online here.
export const GET = handle(async () => {
  const me = await requireApproved();
  if (me.role !== "branch_manager" && me.role !== "super_admin") throw forbidden();
  const branch = await branchForManager(me.id);
  if (!branch) return json([]);

  const activeSessions = await prisma.riderBranchDutySession.findMany({
    where: { branchId: branch.id, status: "active" },
    select: { riderId: true, startedAt: true },
  });
  const online = new Map(activeSessions.map((s) => [s.riderId, s.startedAt]));
  const riderIds = activeSessions.map((s) => s.riderId);

  const profiles = await prisma.riderProfile.findMany({
    where: { OR: [{ assignedBranchId: branch.id }, { userId: { in: riderIds } }] },
    include: { user: true, assignedBranch: true },
  });

  const result = profiles.map((p) => ({
    ...serializeRiderProfile(p),
    is_online: online.has(p.userId), // authoritative — active session at this branch
    on_duty_branch: online.has(p.userId) ? branch.id : null,
    on_duty_since: online.get(p.userId)?.toISOString() ?? null,
    last_ping_at: p.lastPingAt?.toISOString() ?? null,
    latitude: p.currentLat != null ? Number(p.currentLat) : null,
    longitude: p.currentLng != null ? Number(p.currentLng) : null,
  }));
  return json(result);
});
