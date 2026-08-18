import { requireApproved } from "@/lib/auth/current-user";
import { handle, sk, validationError } from "@/lib/http/errors";
import { json } from "@/lib/http/respond";
import { prisma } from "@/lib/db";
import { serializeTable } from "@/lib/services/branch-ops";
import { eligibleMenus, getConfig, serializeConfig, serializeMenu, serializeSlot, slotsForBranch } from "@/lib/services/ramadan";

// GET /api/ramadan/available?branch_id=&date=&slot_id=
// Customer booking helper: config, active slots, bookable tables, and menus
// eligible for the branch/date/slot. Menus are filtered server-side.
export const GET = handle(async (req: Request) => {
  await requireApproved();
  const url = new URL(req.url);
  const branchId = Number(url.searchParams.get("branch_id"));
  if (!branchId) throw validationError({ branch_id: sk("errors.ops.branchRequired") });
  const branch = await prisma.branch.findFirst({ where: { id: branchId, isActive: true } });
  if (!branch) throw validationError({ branch_id: sk("errors.ops.branchRequired") });

  const config = await getConfig(branchId);
  const slots = await slotsForBranch(branchId, true);
  const tables = await prisma.branchTable.findMany({
    where: { branchId, isActive: true, status: { not: "out_of_service" } },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  });
  const dateStr = url.searchParams.get("date");
  const slotId = url.searchParams.get("slot_id") ? Number(url.searchParams.get("slot_id")) : null;
  let menus: ReturnType<typeof serializeMenu>[] = [];
  if (dateStr && /^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
    const date = new Date(`${dateStr.slice(0, 10)}T00:00:00.000Z`);
    menus = (await eligibleMenus(branchId, date, slotId)).map(serializeMenu);
  }
  return json({
    config: serializeConfig(config, branchId),
    slots: slots.map(serializeSlot),
    tables: tables.map(serializeTable),
    menus,
  });
});
