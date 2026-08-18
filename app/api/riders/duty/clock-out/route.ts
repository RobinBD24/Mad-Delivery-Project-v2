import { requireApiRole } from "@/lib/auth/current-user";
import { handle } from "@/lib/http/errors";
import { json } from "@/lib/http/respond";
import { prisma } from "@/lib/db";
import { serializeDutyLog } from "@/lib/serializers";
import { clockOut } from "@/lib/services/riders";

// POST /api/riders/duty/clock-out
export const POST = handle(async () => {
  const me = await requireApiRole("rider");
  const log = await clockOut(me.id);
  const full = await prisma.riderDutyLog.findUniqueOrThrow({ where: { id: log.id }, include: { branch: true, rider: true } });
  return json(serializeDutyLog(full));
});
