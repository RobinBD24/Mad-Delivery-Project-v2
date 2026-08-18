import { requireApiRole } from "@/lib/auth/current-user";
import { handle } from "@/lib/http/errors";
import { created } from "@/lib/http/respond";
import { prisma } from "@/lib/db";
import { serializeDutyLog } from "@/lib/serializers";
import { clockIn } from "@/lib/services/riders";

// POST /api/riders/duty/clock-in  { branch_id? }
export const POST = handle(async (req: Request) => {
  const me = await requireApiRole("rider");
  const body = (await req.json().catch(() => ({}))) as { branch_id?: number | null };
  const log = await clockIn({ riderId: me.id, branchId: body.branch_id ?? null });
  const full = await prisma.riderDutyLog.findUniqueOrThrow({ where: { id: log.id }, include: { branch: true, rider: true } });
  return created(serializeDutyLog(full));
});
