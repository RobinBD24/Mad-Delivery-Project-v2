import { requireApproved } from "@/lib/auth/current-user";
import { handle, notFound, sk } from "@/lib/http/errors";
import { json } from "@/lib/http/respond";
import { parseId } from "@/lib/http/params";
import { prisma } from "@/lib/db";
import { serializeCategory } from "@/lib/serializers";
import { deleteCategory, updateCategory } from "@/lib/services/catalog";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/categories/[id]
export const GET = handle(async (_req: Request, ctx: Ctx) => {
  await requireApproved();
  const { id } = await ctx.params;
  const categoryId = parseId(id);
  const category = await prisma.category.findUnique({
    where: { id: categoryId },
    include: { branch: true, _count: { select: { products: true } } },
  });
  if (!category) throw notFound(sk("errors.catalog.categoryNotFound"));
  return json(serializeCategory(category));
});

// PATCH /api/categories/[id] — SUPER ADMIN ONLY (req #7). RBAC + scope +
// duplicate checks live in the catalog service (updateCategory).
export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const me = await requireApproved();
  const { id } = await ctx.params;
  const categoryId = parseId(id);
  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    description?: string;
    is_active?: boolean;
    branch_id?: number | string | null;
  };
  const updated = await updateCategory(me, categoryId, {
    name: body.name,
    description: body.description,
    isActive: body.is_active,
    ...(body.branch_id !== undefined ? { branchId: body.branch_id } : {}),
  });
  return json(serializeCategory(updated));
});

// DELETE /api/categories/[id] — SUPER ADMIN ONLY (req #7). Deactivates instead
// of hard-deleting when the category still has products, so existing products +
// historical orders are never corrupted (req #8).
export const DELETE = handle(async (_req: Request, ctx: Ctx) => {
  const me = await requireApproved();
  const { id } = await ctx.params;
  const categoryId = parseId(id);
  const result = await deleteCategory(me, categoryId);
  return json(result);
});
