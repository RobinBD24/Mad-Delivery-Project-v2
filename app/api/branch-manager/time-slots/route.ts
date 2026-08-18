import { requireApiRole } from "@/lib/auth/current-user";
import { handle } from "@/lib/http/errors";
import { created, paginated } from "@/lib/http/respond";
import { prisma } from "@/lib/db";
import { addTimeSlot, requireManagerBranch } from "@/lib/services/branch-ops";

function serialize(s: { id: number; label: string; startTime: string; endTime: string; isActive: boolean }) {
  return { id: s.id, label: s.label, start_time: s.startTime, end_time: s.endTime, is_active: s.isActive };
}

// GET /api/branch-manager/time-slots
export const GET = handle(async () => {
  const me = await requireApiRole("branch_manager");
  const branch = await requireManagerBranch(me);
  const slots = await prisma.deliveryTimeSlot.findMany({
    where: { branchId: branch.id },
    orderBy: { startTime: "asc" },
  });
  return paginated(slots.map(serialize));
});

// POST /api/branch-manager/time-slots  { label, start_time, end_time }
export const POST = handle(async (req: Request) => {
  const me = await requireApiRole("branch_manager");
  const branch = await requireManagerBranch(me);
  const body = (await req.json().catch(() => ({}))) as { label?: string; start_time?: string; end_time?: string };
  const slot = await addTimeSlot(branch.id, {
    label: String(body.label ?? ""),
    startTime: String(body.start_time ?? ""),
    endTime: String(body.end_time ?? ""),
  });
  return created(serialize(slot));
});
