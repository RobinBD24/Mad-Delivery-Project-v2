import "server-only";
import { Prisma } from "@prisma/client";
import type { Coupon } from "@prisma/client";

import { prisma } from "@/lib/db";
import { sk, validationError } from "@/lib/http/errors";

export function serializeCoupon(c: {
  id: number;
  code: string;
  discountType: string;
  value: Prisma.Decimal;
  minOrder: Prisma.Decimal;
  maxUses: number;
  usedCount: number;
  startsAt: Date | null;
  endsAt: Date | null;
  isActive: boolean;
  createdAt: Date;
}) {
  return {
    id: c.id,
    code: c.code,
    discount_type: c.discountType,
    value: c.value.toFixed(2),
    min_order: c.minOrder.toFixed(2),
    max_uses: c.maxUses,
    used_count: c.usedCount,
    starts_at: c.startsAt?.toISOString() ?? null,
    ends_at: c.endsAt?.toISOString() ?? null,
    is_active: c.isActive,
    created_at: c.createdAt.toISOString(),
  };
}

export function parseCouponBody(body: Record<string, unknown>) {
  const code = String(body.code ?? "").trim().toUpperCase();
  if (!code) throw validationError({ code: sk("errors.ops.couponCodeRequired") });
  const discountType = body.discount_type === "fixed" ? "fixed" : "percent";
  const value = Number(body.value);
  if (Number.isNaN(value) || value <= 0 || (discountType === "percent" && value > 100)) {
    throw validationError({ value: sk("errors.ops.discountValueInvalid") });
  }
  return {
    code,
    discountType,
    value: new Prisma.Decimal(value.toFixed(2)),
    minOrder: new Prisma.Decimal(Number(body.min_order ?? 0).toFixed(2)),
    maxUses: Math.max(0, Math.floor(Number(body.max_uses ?? 0) || 0)),
    startsAt: body.starts_at ? new Date(String(body.starts_at)) : null,
    endsAt: body.ends_at ? new Date(String(body.ends_at)) : null,
    isActive: body.is_active === undefined ? true : Boolean(body.is_active),
  };
}

export function serializeCampaign(c: {
  id: number;
  title: string;
  description: string;
  type: string;
  startsAt: Date;
  endsAt: Date;
  isActive: boolean;
  couponId: number | null;
  createdAt: Date;
  coupon?: { code: string } | null;
}) {
  return {
    id: c.id,
    title: c.title,
    description: c.description,
    type: c.type,
    starts_at: c.startsAt.toISOString(),
    ends_at: c.endsAt.toISOString(),
    is_active: c.isActive,
    coupon: c.couponId,
    coupon_code: c.coupon?.code ?? null,
    created_at: c.createdAt.toISOString(),
  };
}

export function parseCampaignBody(body: Record<string, unknown>) {
  const title = String(body.title ?? "").trim();
  if (!title) throw validationError({ title: sk("errors.ops.campaignTitleRequired") });
  const type = ["discount", "offer", "promotion"].includes(String(body.type))
    ? String(body.type)
    : "promotion";
  const startsAt = new Date(String(body.starts_at ?? ""));
  const endsAt = new Date(String(body.ends_at ?? ""));
  if (Number.isNaN(startsAt.getTime())) throw validationError({ starts_at: sk("errors.ops.startDateRequired") });
  if (Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) {
    throw validationError({ ends_at: sk("errors.ops.endDateAfterStart") });
  }
  return {
    title,
    description: String(body.description ?? "").trim(),
    type,
    startsAt,
    endsAt,
    isActive: body.is_active === undefined ? true : Boolean(body.is_active),
    couponId: body.coupon_id ? Number(body.coupon_id) : null,
  };
}

export interface SegmentCriteria {
  location?: string; // substring match on user address / delivery address
  min_orders?: number;
  days_since_last_order?: number; // ordered within the last N days
}

/** Validate a coupon code for an order subtotal; returns coupon + discount. */
export async function validateCoupon(
  code: string,
  subtotal: number,
): Promise<{ coupon: Coupon; discount: number }> {
  const coupon = await prisma.coupon.findUnique({ where: { code: code.trim().toUpperCase() } });
  const fail = () => validationError({ coupon_code: sk("errors.ops.couponInvalidOrExpired") });
  if (!coupon || !coupon.isActive) throw fail();
  const now = new Date();
  if (coupon.startsAt && coupon.startsAt > now) throw fail();
  if (coupon.endsAt && coupon.endsAt < now) throw fail();
  if (coupon.maxUses > 0 && coupon.usedCount >= coupon.maxUses) throw fail();
  if (subtotal < Number(coupon.minOrder)) {
    throw validationError({
      coupon_code: sk("errors.ops.couponMinOrder", { amount: Number(coupon.minOrder).toFixed(0) }),
    });
  }
  const discount =
    coupon.discountType === "percent"
      ? (subtotal * Number(coupon.value)) / 100
      : Math.min(Number(coupon.value), subtotal);
  return { coupon, discount: Math.round(discount * 100) / 100 };
}

/** Users matching a segment's criteria (approved customers only). */
export async function evaluateSegment(criteriaRaw: string): Promise<number[]> {
  let criteria: SegmentCriteria = {};
  try {
    criteria = JSON.parse(criteriaRaw) as SegmentCriteria;
  } catch {
    criteria = {};
  }

  const where: Prisma.UserWhereInput = { role: "customer", status: "approved", isActive: true };
  if (criteria.location) {
    where.OR = [
      { address: { contains: criteria.location } },
      { orders: { some: { deliveryAddress: { contains: criteria.location } } } },
    ];
  }
  const users = await prisma.user.findMany({
    where,
    include: { _count: { select: { orders: true } }, orders: { orderBy: { createdAt: "desc" }, take: 1 } },
  });

  return users
    .filter((u) => {
      if (criteria.min_orders && u._count.orders < criteria.min_orders) return false;
      if (criteria.days_since_last_order) {
        const last = u.orders[0]?.createdAt;
        if (!last) return false;
        const cutoff = Date.now() - criteria.days_since_last_order * 86400000;
        if (last.getTime() < cutoff) return false;
      }
      return true;
    })
    .map((u) => u.id);
}
