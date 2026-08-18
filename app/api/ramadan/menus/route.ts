import { requireApproved } from "@/lib/auth/current-user";
import { handle } from "@/lib/http/errors";
import { created, paginated } from "@/lib/http/respond";
import { parseBody } from "@/lib/http/form";
import { saveUpload } from "@/lib/http/upload";
import { resolveManageableBranch } from "@/lib/services/branch-ops";
import { createMenu, menusForBranch, parseMenuItems, serializeMenu } from "@/lib/services/ramadan";

// GET /api/ramadan/menus?branch_id=&include_archived=true — menus for a
// manageable branch. Archived platters are hidden unless asked for (PHASE L).
export const GET = handle(async (req: Request) => {
  const me = await requireApproved();
  const url = new URL(req.url);
  const branch = await resolveManageableBranch(me, url.searchParams.get("branch_id") ? Number(url.searchParams.get("branch_id")) : undefined);
  const menus = await menusForBranch(branch.id, {
    includeArchived: url.searchParams.get("include_archived") === "true",
  });
  return paginated(menus.map(serializeMenu));
});

// POST /api/ramadan/menus — multipart (optional image → webp; `items` is JSON or newline list).
export const POST = handle(async (req: Request) => {
  const me = await requireApproved();
  const { fields, file } = await parseBody(req);
  const image = file("image");
  const items = parseMenuItems(fields.items);
  const menu = await createMenu(me, {
    branchId: fields.branch_id ? Number(fields.branch_id) : undefined,
    name: fields.name ?? "", description: fields.description ?? "",
    image: image ? await saveUpload(image, "ramadan_menus", "image") : null,
    price: Number(fields.price), compareAtPrice: fields.compare_at_price ? Number(fields.compare_at_price) : null,
    servingCapacity: fields.serving_capacity ? Number(fields.serving_capacity) : 4,
    startDate: fields.start_date || null, endDate: fields.end_date || null,
    allowedSlots: fields.allowed_slots ?? "", minGuests: fields.min_guests ? Number(fields.min_guests) : 0,
    maxGuests: fields.max_guests ? Number(fields.max_guests) : 0,
    isActive: fields.is_active ? fields.is_active === "true" : true,
    sortOrder: fields.sort_order ? Number(fields.sort_order) : 0, items,
  });
  return created(serializeMenu(menu));
});

