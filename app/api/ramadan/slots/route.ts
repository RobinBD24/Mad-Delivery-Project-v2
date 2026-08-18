import { requireApproved } from "@/lib/auth/current-user";
import { handle } from "@/lib/http/errors";
import { created, paginated } from "@/lib/http/respond";
import { resolveManageableBranch } from "@/lib/services/branch-ops";
import { createSlot, serializeSlot, slotsForBranch } from "@/lib/services/ramadan";

// GET /api/ramadan/slots?branch_id=&active= — slots for a manageable branch.
export const GET = handle(async (req: Request) => {
  const me = await requireApproved();
  const url = new URL(req.url);
  const branch = await resolveManageableBranch(me, url.searchParams.get("branch_id") ? Number(url.searchParams.get("branch_id")) : undefined);
  const slots = await slotsForBranch(branch.id, url.searchParams.get("active") === "true");
  return paginated(slots.map(serializeSlot));
});

// POST /api/ramadan/slots
export const POST = handle(async (req: Request) => {
  const me = await requireApproved();
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const slot = await createSlot(me, {
    branchId: b.branch_id != null ? Number(b.branch_id) : undefined,
    label: String(b.label ?? ""), startTime: String(b.start_time ?? ""), endTime: String(b.end_time ?? ""),
    capacity: b.capacity != null ? Number(b.capacity) : undefined, isActive: b.is_active != null ? Boolean(b.is_active) : undefined,
    sortOrder: b.sort_order != null ? Number(b.sort_order) : undefined,
  });
  return created(serializeSlot(slot));
});
