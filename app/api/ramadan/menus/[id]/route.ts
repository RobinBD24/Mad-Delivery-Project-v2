import { requireApproved } from "@/lib/auth/current-user";
import { handle } from "@/lib/http/errors";
import { json } from "@/lib/http/respond";
import { parseBody } from "@/lib/http/form";
import { saveUpload } from "@/lib/http/upload";
import { prisma } from "@/lib/db";
import { deleteMenu, getMenuForManage, parseMenuItems, serializeMenu, updateMenu } from "@/lib/services/ramadan";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/ramadan/menus/[id] — PHASE L "View". Same branch guard as the
// mutations, so another branch's platter is never readable by id.
export const GET = handle(async (_req: Request, ctx: Ctx) => {
  const me = await requireApproved();
  const { id } = await ctx.params;
  return json(serializeMenu(await getMenuForManage(me, Number(id))));
});

// PATCH /api/ramadan/menus/[id] — update (multipart optional image). Historical
// reservation snapshots are NOT affected by menu edits.
export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const me = await requireApproved();
  const { id } = await ctx.params;
  const { fields, file, has } = await parseBody(req);
  const image = file("image");
  await updateMenu(me, Number(id), {
    ...(has("name") ? { name: fields.name } : {}),
    ...(has("description") ? { description: fields.description } : {}),
    ...(has("price") ? { price: Number(fields.price) } : {}),
    ...(has("compare_at_price") ? { compareAtPrice: fields.compare_at_price ? Number(fields.compare_at_price) : null } : {}),
    ...(has("serving_capacity") ? { servingCapacity: Number(fields.serving_capacity) } : {}),
    ...(has("start_date") ? { startDate: fields.start_date || null } : {}),
    ...(has("end_date") ? { endDate: fields.end_date || null } : {}),
    ...(has("allowed_slots") ? { allowedSlots: fields.allowed_slots } : {}),
    ...(has("min_guests") ? { minGuests: Number(fields.min_guests) } : {}),
    ...(has("max_guests") ? { maxGuests: Number(fields.max_guests) } : {}),
    ...(has("is_active") ? { isActive: fields.is_active === "true" } : {}),
    ...(has("sort_order") ? { sortOrder: Number(fields.sort_order) } : {}),
    ...(has("items") ? { items: parseMenuItems(fields.items) } : {}),
    ...(image ? { image: await saveUpload(image, "ramadan_menus", "image") } : {}),
  });
  const full = await prisma.ramadanMenu.findUnique({ where: { id: Number(id) }, include: { items: true } });
  return json(serializeMenu(full!));
});

// DELETE /api/ramadan/menus/[id] — PHASE L. A platter with reservations is
// archived (and deactivated) rather than deleted; the caller is told which
// happened so the UI can say so plainly.
export const DELETE = handle(async (_req: Request, ctx: Ctx) => {
  const me = await requireApproved();
  const { id } = await ctx.params;
  const result = await deleteMenu(me, Number(id));
  return json({
    archived: result.archived,
    reservations: result.reservations,
    menu: serializeMenu(result.menu),
  });
});
