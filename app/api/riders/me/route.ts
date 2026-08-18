import { requireApiRole } from "@/lib/auth/current-user";
import { handle } from "@/lib/http/errors";
import { json } from "@/lib/http/respond";
import { prisma } from "@/lib/db";
import { serializeRiderProfile } from "@/lib/serializers";

// GET /api/riders/me — the logged-in rider's own profile.
export const GET = handle(async () => {
  const me = await requireApiRole("rider");
  const profile = await prisma.riderProfile.upsert({
    where: { userId: me.id },
    create: { userId: me.id },
    update: {},
    include: { user: true, assignedBranch: true },
  });
  return json(serializeRiderProfile(profile));
});
