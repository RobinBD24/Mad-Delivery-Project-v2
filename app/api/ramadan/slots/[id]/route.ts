import { requireApproved } from "@/lib/auth/current-user";
import { handle } from "@/lib/http/errors";
import { json, noContent } from "@/lib/http/respond";
import { deleteSlot, serializeSlot, updateSlot } from "@/lib/services/ramadan";

type Ctx = { params: Promise<{ id: string }> };
export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const me = await requireApproved();
  const { id } = await ctx.params;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const slot = await updateSlot(me, Number(id), {
    ...(b.label !== undefined ? { label: String(b.label) } : {}),
    ...(b.start_time !== undefined ? { startTime: String(b.start_time) } : {}),
    ...(b.end_time !== undefined ? { endTime: String(b.end_time) } : {}),
    ...(b.capacity !== undefined ? { capacity: Number(b.capacity) } : {}),
    ...(b.is_active !== undefined ? { isActive: Boolean(b.is_active) } : {}),
    ...(b.sort_order !== undefined ? { sortOrder: Number(b.sort_order) } : {}),
  });
  return json(serializeSlot(slot));
});
export const DELETE = handle(async (_req: Request, ctx: Ctx) => {
  const me = await requireApproved();
  const { id } = await ctx.params;
  await deleteSlot(me, Number(id));
  return noContent();
});
