import { requireApproved } from "@/lib/auth/current-user";
import { handle } from "@/lib/http/errors";
import { created, pageParams, paginated } from "@/lib/http/respond";
import { categoriesForUser } from "@/lib/selectors";
import { serializeCategory } from "@/lib/serializers";
import { createCategory } from "@/lib/services/catalog";

// GET /api/categories?branch_id=|branch=&search=
// req #11 — the `branch` alias (sent by the customer menu page) and `search`
// are now honoured server-side; visibility rules live in categoriesForUser.
export const GET = handle(async (req: Request) => {
  const me = await requireApproved();
  const url = new URL(req.url);
  const branchId = url.searchParams.get("branch_id") ?? url.searchParams.get("branch");
  const search = url.searchParams.get("search") ?? undefined;
  const { page, pageSize } = pageParams(url);
  const rows = await categoriesForUser(me, branchId ? Number(branchId) : undefined, search);
  return paginated(rows.map(serializeCategory), { page, pageSize, count: rows.length });
});

// POST /api/categories — SUPER ADMIN ONLY (req #7). Categories are created by
// the super admin; branch managers add products under those categories but can
// never create/edit categories. `branch_id` may be a branch id or omitted /
// "global" for "Main Branch (Global)" (req #8). All RBAC + scope + duplicate
// rules are enforced in the catalog service.
export const POST = handle(async (req: Request) => {
  const me = await requireApproved();
  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    description?: string;
    is_active?: boolean;
    branch_id?: number | string | null;
  };
  const category = await createCategory(me, {
    name: body.name ?? "",
    description: body.description,
    isActive: body.is_active,
    branchId: body.branch_id,
  });
  return created(serializeCategory(category));
});
