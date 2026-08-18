import { requireApiRole } from "@/lib/auth/current-user";
import { handle, sk, validationError } from "@/lib/http/errors";
import { created, paginated } from "@/lib/http/respond";
import { prisma } from "@/lib/db";
import { parseCouponBody, serializeCoupon } from "@/lib/services/marketing";

// GET /api/marketing/coupons
export const GET = handle(async () => {
  await requireApiRole("marketing", "super_admin", "management");
  const items = await prisma.coupon.findMany({ orderBy: { createdAt: "desc" } });
  return paginated(items.map(serializeCoupon));
});

// POST /api/marketing/coupons
export const POST = handle(async (req: Request) => {
  const me = await requireApiRole("marketing", "super_admin");
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const data = parseCouponBody(body);
  const exists = await prisma.coupon.findUnique({ where: { code: data.code } });
  if (exists) throw validationError({ code: sk("errors.ops.couponCodeExists") });
  const coupon = await prisma.coupon.create({ data: { ...data, createdById: me.id } });
  return created(serializeCoupon(coupon));
});
