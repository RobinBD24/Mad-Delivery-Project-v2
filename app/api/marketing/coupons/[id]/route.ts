import { requireApiRole } from "@/lib/auth/current-user";
import { handle, notFound } from "@/lib/http/errors";
import { json, noContent } from "@/lib/http/respond";
import { prisma } from "@/lib/db";
import { parseCouponBody, serializeCoupon } from "@/lib/services/marketing";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/marketing/coupons/[id]
export const GET = handle(async (_req: Request, ctx: Ctx) => {
  await requireApiRole("marketing", "super_admin");
  const { id } = await ctx.params;
  const coupon = await prisma.coupon.findUnique({ where: { id: Number(id) } });
  if (!coupon) throw notFound();
  return json(serializeCoupon(coupon));
});

// PATCH /api/marketing/coupons/[id]
export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  await requireApiRole("marketing", "super_admin");
  const { id } = await ctx.params;
  const existing = await prisma.coupon.findUnique({ where: { id: Number(id) } });
  if (!existing) throw notFound();
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const merged = {
    code: existing.code,
    discount_type: existing.discountType,
    value: existing.value.toString(),
    min_order: existing.minOrder.toString(),
    max_uses: existing.maxUses,
    starts_at: existing.startsAt?.toISOString(),
    ends_at: existing.endsAt?.toISOString(),
    is_active: existing.isActive,
    ...body,
  };
  const data = parseCouponBody(merged);
  const coupon = await prisma.coupon.update({ where: { id: existing.id }, data });
  return json(serializeCoupon(coupon));
});

// DELETE /api/marketing/coupons/[id]
export const DELETE = handle(async (_req: Request, ctx: Ctx) => {
  await requireApiRole("marketing", "super_admin");
  const { id } = await ctx.params;
  const existing = await prisma.coupon.findUnique({ where: { id: Number(id) } });
  if (!existing) throw notFound();
  await prisma.coupon.delete({ where: { id: existing.id } });
  return noContent();
});
