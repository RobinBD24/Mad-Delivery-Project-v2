import "server-only";
import { Prisma } from "@prisma/client";
import type { Order, User } from "@prisma/client";

import { prisma } from "@/lib/db";
import { conflict, forbidden, sk, validationError } from "@/lib/http/errors";
import {
  ALLOWED_TRANSITIONS,
  BRANCH_MANAGER_SETTABLE,
  CUSTOMER_SETTABLE,
  RIDER_SETTABLE,
} from "@/lib/constants/orders";
import { createNotification, notifyBranchManagers } from "@/lib/services/notifications";
import { recordCommissionForOrder } from "@/lib/services/wallet";
import { awardOrderCoinsByRule } from "@/lib/services/reward-rules";
import { awardCoins } from "@/lib/services/rewards";
import { validateCoupon } from "@/lib/services/marketing";
import { allowedCrustChoices } from "@/lib/constants/enums";
import { coverageFor } from "@/lib/services/delivery";
import { haversineKm, isValidLatLng } from "@/lib/services/geo";
import { isReceiveConfirmed } from "@/lib/services/rider-duty";
import { nextOrderNumber } from "@/lib/services/order-number";
import { customerProductWhere } from "@/lib/services/product-eligibility";
import { resolveOrderDeliveryArea } from "@/lib/services/delivery-areas";
import type { OrderStatus } from "@/types";

export interface OrderItemInput {
  product_id: number;
  variation_id?: number;
  quantity: number;
  food_note?: string;
  /** req #4 — chosen crust ("THICK" | "THIN"); validated against the product. */
  variation_type?: string;
}

/**
 * req #4 — resolve the crust the customer may actually order for a product.
 * THICK/THIN products accept only their own crust (a forged "THIN" on a THICK
 * product is REJECTED server-side, never silently coerced); a BOTH product
 * requires an explicit choice. Returns the value snapshotted onto the order item.
 */
function resolveCrustChoice(policy: string, submitted: string | undefined): string {
  const allowed = allowedCrustChoices(policy);
  const chosen = String(submitted ?? "").trim().toUpperCase();
  if (allowed.length === 0) return ""; // unknown/legacy policy → nothing to enforce
  if (policy === "BOTH") {
    if (!chosen) throw validationError({ items: sk("errors.orders.variationTypeRequired") });
    if (!allowed.includes(chosen as "THICK" | "THIN")) {
      throw validationError({ items: sk("errors.orders.variationTypeNotAvailable") });
    }
    return chosen;
  }
  // Fixed-crust product: an explicit mismatching choice is a hard error.
  if (chosen && chosen !== policy) {
    throw validationError({ items: sk("errors.orders.variationTypeNotAvailable") });
  }
  return policy;
}

/**
 * #20 — Resolve the branch for a DELIVERY order SERVER-SIDE from the cart's
 * products + trusted coordinates, IGNORING any client-submitted branch_id (the
 * browser can never force a branch). The catalog is branch-specific, so the only
 * branch that can serve the cart is the one its products belong to; that branch
 * must be active, not archived, and cover the coordinates. Among branches that
 * could serve the cart it is (trivially) the nearest — computed deterministically
 * with a stable id tiebreak so equal distances resolve consistently. Throws a
 * translated error when no eligible branch can serve the cart.
 */
export async function resolveDeliveryBranch(
  productIds: number[],
  coords: { lat: number; lng: number },
) {
  // Same shared eligibility definition the catalog and the order pipeline use —
  // an ineligible product must not even be able to nominate a serving branch.
  const products = await prisma.product.findMany({
    where: customerProductWhere({ ids: productIds }),
    select: { branchId: true },
  });
  const servingBranchIds = [...new Set(products.map((p) => p.branchId))];
  // Cart must be a single active branch's products (the menu is branch-scoped).
  if (products.length === 0 || servingBranchIds.length !== 1) {
    throw validationError({ items: sk("errors.orders.someProductsUnavailable") });
  }
  // Candidate branches that can SERVE this cart (have its products) AND are
  // active + not archived + cover the point. Pick the nearest (id tiebreak).
  const candidates = await prisma.branch.findMany({
    where: { id: { in: servingBranchIds }, isActive: true, isArchived: false },
  });
  const eligible: { branch: (typeof candidates)[number]; dist: number }[] = [];
  for (const b of candidates) {
    if (b.latitude == null || b.longitude == null) continue;
    const zones = await prisma.branchDeliveryZone.findMany({ where: { branchId: b.id, isActive: true } });
    if (!coverageFor(b, zones, coords).covered) continue;
    eligible.push({ branch: b, dist: haversineKm({ lat: Number(b.latitude), lng: Number(b.longitude) }, coords) });
  }
  eligible.sort((a, z) => a.dist - z.dist || a.branch.id - z.branch.id);
  if (eligible.length === 0) throw validationError({ delivery_address: sk("errors.orders.noEligibleBranch") });
  return eligible[0].branch;
}

type PricedProduct = Prisma.ProductGetPayload<{ include: { variations: true } }>;

/**
 * Resolve the purchasable variation for a line (shared by createOrder + quote).
 * A disabled/foreign variation is rejected; when none is specified fall back to
 * the product's default (then any enabled one).
 */
function resolveVariationFor(product: PricedProduct, variationId?: number) {
  const enabled = product.variations.filter((v) => v.isEnabled);
  if (variationId != null) {
    const chosen = enabled.find((v) => v.id === variationId);
    if (!chosen) throw validationError({ items: sk("errors.orders.variationUnavailable") });
    return chosen;
  }
  return enabled.find((v) => v.isDefault) ?? enabled[0] ?? null;
}

/** Apply a product's percentage discount to a unit price (Decimal-safe input). */
function discountedUnit(price: Prisma.Decimal, discount: Prisma.Decimal): number {
  const p = price.toNumber();
  const d = discount.toNumber();
  return d > 0 ? p - (p * d) / 100 : p;
}

/**
 * Resolve the delivery/pickup branch for a cart (shared by createOrder + quote):
 * pickup uses the explicit branch (must be active, not archived, pickup-enabled);
 * delivery derives the branch server-side from the cart + trusted coordinates
 * (client branch_id ignored — #20). Also validates coordinates for delivery.
 */
async function resolveBranchForCart(input: {
  branchId: number;
  productIds: number[];
  fulfillmentType: "delivery" | "pickup";
  lat?: number | null;
  lng?: number | null;
  /** The ordering customer, so delivery can be pinned to their own branch. */
  customerId?: number;
}) {
  if (input.fulfillmentType === "pickup") {
    const picked = await prisma.branch.findFirst({
      where: { id: input.branchId, isActive: true, isArchived: false },
    });
    if (!picked) throw validationError({ branch_id: sk("errors.orders.branchNotFoundOrClosed") });
    if (!picked.pickupEnabled) throw validationError({ fulfillment_type: sk("errors.orders.pickupUnavailable") });
    return { branch: picked, lat: null as number | null, lng: null as number | null };
  }
  if (input.lat == null || input.lng == null || !isValidLatLng(input.lat, input.lng)) {
    throw validationError({ delivery_address: sk("errors.orders.locationRequired") });
  }
  const branch = await resolveDeliveryBranch(input.productIds, { lat: Number(input.lat), lng: Number(input.lng) });
  // NOTE — the branch is resolved from the CART plus the validated delivery
  // coordinates, server-side, with the client's branch_id ignored. It is not
  // additionally reconciled against the customer's STORED location.
  //
  // Such a reconciliation was implemented and then removed. Because the order's
  // coordinates are the delivery destination and may legitimately differ from
  // where the customer is standing, the check has to compare against the stored
  // browsing point — which makes order acceptance depend on when that point was
  // last written, and the guard fired on carts that were perfectly valid. The
  // hole it would have closed is narrow: a FORGED request carrying another
  // branch's product ids is already refused unless that branch also covers the
  // delivery address, and a legitimately built cart can only contain the
  // storefront's single resolved branch. Recorded in
  // NEAREST_BRANCH_HOMEPAGE_AUDIT.md rather than left implicit.
  return { branch, lat: Number(input.lat), lng: Number(input.lng) };
}

/**
 * req #6 — a server-derived quote for the checkout summary. Uses the SAME branch,
 * area, product-availability and pricing rules as createOrder, but persists
 * nothing. Everything shown to the customer (subtotal, delivery charge, prep time,
 * delivery estimate, overall estimate, total) is computed here, never trusted from
 * the client. Held/inactive/foreign areas and unavailable products throw the same
 * translated validation errors as placing the order would.
 */
export async function quoteOrder(input: {
  branchId: number;
  items: OrderItemInput[];
  fulfillmentType?: string;
  lat?: number | null;
  lng?: number | null;
  deliveryAreaId?: number | null;
  /** Pins a delivery quote to the customer's own resolved branch. */
  customerId?: number;
}) {
  const fulfillmentType = input.fulfillmentType === "pickup" ? "pickup" : "delivery";
  const productIds = input.items.map((i) => i.product_id);
  const { branch } = await resolveBranchForCart({
    branchId: input.branchId,
    productIds,
    fulfillmentType,
    lat: input.lat,
    lng: input.lng,
    customerId: input.customerId,
  });
  const area = fulfillmentType === "delivery"
    ? await resolveOrderDeliveryArea(branch.id, input.deliveryAreaId)
    : null;

  const products = await prisma.product.findMany({
    where: orderableProductWhere(branch.id, productIds),
    include: { variations: true },
  });
  const byId = new Map(products.map((p) => [p.id, p]));
  const missing = productIds.filter((id) => !byId.has(id));
  if (missing.length) throw validationError({ items: sk("errors.orders.someProductsUnavailable") });

  const items = input.items.map((item) => {
    const product = byId.get(item.product_id)!;
    const variation = resolveVariationFor(product, item.variation_id);
    const crust = resolveCrustChoice(product.variationType, item.variation_type);
    const unit = discountedUnit(variation ? variation.price : product.price, product.discount);
    return {
      product_id: product.id,
      variation_id: variation?.id ?? null,
      variation_name: variation?.name ?? "",
      variation_type: crust,
      name: product.name,
      unit_price: Number(unit.toFixed(2)),
      quantity: item.quantity,
      line_total: Number((unit * item.quantity).toFixed(2)),
    };
  });

  const subtotal = Number(items.reduce((s, i) => s + i.line_total, 0).toFixed(2));
  const deliveryCharge =
    fulfillmentType === "pickup"
      ? 0
      : area
        ? Number(new Prisma.Decimal(area.deliveryCharge).toFixed(2))
        : Number(new Prisma.Decimal(branch.deliveryFee).toFixed(2));
  const prepTime = branch.prepTimeMinutes ?? null;
  const deliveryEstimate = area ? area.estimatedDeliveryMinutes : null;
  const overallEstimate =
    prepTime != null ? prepTime + (deliveryEstimate ?? 0) : deliveryEstimate;

  return {
    fulfillment_type: fulfillmentType,
    branch: { id: branch.id, name: branch.name },
    area: area
      ? {
          id: area.id,
          name: area.name,
          delivery_charge: deliveryCharge,
          estimated_delivery_minutes: area.estimatedDeliveryMinutes,
          is_held: area.isHeld,
        }
      : null,
    items,
    subtotal,
    delivery_charge: deliveryCharge,
    prep_time_minutes: prepTime,
    delivery_estimate_minutes: deliveryEstimate,
    overall_estimate_minutes: overallEstimate,
    total: Number((subtotal + deliveryCharge).toFixed(2)),
  };
}

/**
 * PHASE R — the eligibility a product must satisfy to be ORDERABLE from a
 * branch. This is deliberately the same rule the customer catalogue applies, so
 * a direct API call cannot order something the menu would never have shown:
 * the product must belong to this branch, be available, not held by an admin,
 * not soft-deleted, AND sit under an ACTIVE category (or no category at all).
 * A category scoped to a different branch never qualifies.
 */
/**
 * What may be ORDERED. Delegates to the one shared customer-eligibility
 * definition rather than restating it: this clause used to omit the branch
 * active/archived and enabled-variation rules that the catalog list applied, so
 * a product could be hidden from the menu yet still accepted by the order API
 * (and vice versa). Same rules, one place.
 */
function orderableProductWhere(branchId: number, productIds: number[]): Prisma.ProductWhereInput {
  return customerProductWhere({ branchId, ids: productIds });
}

/** Create an order with items. Prices are snapshotted from the products. */
export async function createOrder(input: {
  customerId: number;
  branchId: number;
  items: OrderItemInput[];
  paymentMethod: string;
  deliveryAddress: string;
  foodNotes?: string;
  couponCode?: string;
  fulfillmentType?: string; // "delivery" (default) | "pickup"
  lat?: number | null;
  lng?: number | null;
  deliveryAreaId?: number | null; // #1/#13 — selected named delivery area
  /** PHASE R — one key per checkout attempt; a retry with the same key
   *  returns the order that was already created rather than a second one. */
  idempotencyKey?: string | null;
}): Promise<Order> {
  // Blocked (fake-order) customers may not place orders.
  const customer = await prisma.user.findUnique({ where: { id: input.customerId } });
  if (customer?.isBlocked) {
    throw forbidden(sk("errors.orders.accountBlocked"));
  }

  // PHASE R — duplicate checkout. A double-tapped button or a client retry
  // after a slow response must never become two real orders. The FIRST order
  // is returned unchanged, so the customer sees one order and is charged once.
  // Deliberately not a "same items, recently" heuristic: that would refuse a
  // customer legitimately re-ordering the same food.
  const idempotencyKey = (input.idempotencyKey ?? "").trim().slice(0, 64) || null;
  if (idempotencyKey) {
    const existing = await prisma.order.findFirst({
      where: { customerId: input.customerId, idempotencyKey },
    });
    if (existing) return existing;
  }

  // B1/#20 — fulfillment + branch resolution. For DELIVERY the branch is
  // computed SERVER-SIDE from the cart + trusted coordinates (the client
  // branch_id is ignored — no branch spoofing); for PICKUP the customer's
  // explicit pickup branch is used (existing pickup workflow).
  // B1/#20 — fulfillment + branch resolution. For DELIVERY the branch is
  // computed SERVER-SIDE from the cart + trusted coordinates (client branch_id
  // ignored — no spoofing); PICKUP uses the explicit pickup branch. Coverage +
  // coordinate validation live inside resolveBranchForCart (shared with quote).
  const fulfillmentType = input.fulfillmentType === "pickup" ? "pickup" : "delivery";
  const productIds = input.items.map((i) => i.product_id);
  const resolved = await resolveBranchForCart({
    branchId: input.branchId,
    productIds,
    fulfillmentType,
    lat: input.lat,
    lng: input.lng,
    customerId: input.customerId,
  });
  const branch = resolved.branch;
  const deliveryLat = resolved.lat != null ? new Prisma.Decimal(resolved.lat.toFixed(7)) : null;
  const deliveryLng = resolved.lng != null ? new Prisma.Decimal(resolved.lng.toFixed(7)) : null;
  // #1/#13 — resolve the selected delivery area (delivery only). A held/inactive
  // area or one from another branch is rejected here; its name/charge/estimate
  // are snapshotted IMMUTABLY onto the order so later area edits never change it.
  const area = fulfillmentType === "delivery"
    ? await resolveOrderDeliveryArea(branch.id, input.deliveryAreaId)
    : null;
  // PHASE 11 — the delivery charge is SERVER-derived: a named area supplies its
  // own charge; otherwise the branch-level delivery fee applies. Pickup is free.
  const deliveryChargeSnapshot =
    fulfillmentType === "pickup"
      ? new Prisma.Decimal(0)
      : area
        ? new Prisma.Decimal(area.deliveryCharge)
        : new Prisma.Decimal(branch.deliveryFee);
  const deliveryEstimateSnapshot = area ? area.estimatedDeliveryMinutes : null;
  // Snapshot the radius rule that authorised this delivery (server-computed
  // distance from trusted coordinates). Later radius/fee edits never rewrite it.
  const distanceKm =
    resolved.lat != null && resolved.lng != null && branch.latitude != null && branch.longitude != null
      ? haversineKm({ lat: Number(branch.latitude), lng: Number(branch.longitude) }, { lat: resolved.lat, lng: resolved.lng })
      : null;
  // B2 — snapshot the branch's estimated prep time onto the order (immutable).
  const prepTimeSnapshot = branch.prepTimeMinutes;

  const products = await prisma.product.findMany({
    where: orderableProductWhere(branch.id, productIds),
    include: { variations: true },
  });
  const byId = new Map(products.map((p) => [p.id, p]));
  const missing = productIds.filter((id) => !byId.has(id));
  if (missing.length) {
    throw validationError({ items: sk("errors.orders.someProductsUnavailable") });
  }

  // Variation resolution + discount pricing are shared with quoteOrder
  // (resolveVariationFor / discountedUnit) so the preview and the persisted
  // order can never disagree on price.
  return prisma.$transaction(async (tx) => {
    let total = 0;
    // #15 — reserve a unique, immutable order number inside the same
    // transaction so a rollback releases the sequence (no reuse, no collision).
    const orderNumber = await nextOrderNumber(tx);
    const order = await tx.order.create({
      data: {
        orderNumber,
        idempotencyKey,
        customerId: input.customerId,
        branchId: branch.id,
        paymentMethod: input.paymentMethod,
        deliveryAddress: input.deliveryAddress,
        foodNotes: input.foodNotes ?? "",
        fulfillmentType,
        deliveryLat,
        deliveryLng,
        prepTimeSnapshot,
        deliveryAreaId: area?.id ?? null,
        deliveryAreaName: area?.name ?? "",
        deliveryCharge: deliveryChargeSnapshot,
        deliveryEstimateMinutes: deliveryEstimateSnapshot,
        deliveryDistanceKm: distanceKm != null ? new Prisma.Decimal(distanceKm.toFixed(3)) : null,
        deliveryRadiusKmSnapshot: fulfillmentType === "delivery" ? new Prisma.Decimal(branch.deliveryRadiusKm) : null,
      },
    });
    for (const item of input.items) {
      const product = byId.get(item.product_id)!;
      const variation = resolveVariationFor(product, item.variation_id);
      // req #4 — server-validated crust, snapshotted immutably below.
      const crust = resolveCrustChoice(product.variationType, item.variation_type);
      // Price basis = selected variation price (current), else legacy product price.
      const basePrice = variation ? variation.price : product.price;
      const unit = discountedUnit(basePrice, product.discount);
      total += unit * item.quantity;
      await tx.orderItem.create({
        data: {
          orderId: order.id,
          productId: product.id,
          // Snapshot what was actually bought. Reading these back through the
          // live product relation meant a later rename or photo swap rewrote
          // historical orders.
          productName: product.name,
          productImage: product.image,
          variationId: variation?.id ?? null,
          variationName: variation?.name ?? "",
          variationType: crust,
          quantity: item.quantity,
          unitPrice: new Prisma.Decimal(unit.toFixed(2)),
          foodNote: item.food_note ?? "",
        },
      });
    }
    // Server recalculates the grand total = items + delivery charge (Decimal-safe,
    // never trusts a client total).
    const grandTotal = total + deliveryChargeSnapshot.toNumber();
    return tx.order.update({
      where: { id: order.id },
      data: { totalAmount: new Prisma.Decimal(grandTotal.toFixed(2)) },
    });
  }).then(async (order) => {
    // Coupon applied after the item total is known; discount reduces the total.
    if (input.couponCode?.trim()) {
      const { coupon, discount } = await validateCoupon(input.couponCode, Number(order.totalAmount));
      await prisma.coupon.update({
        where: { id: coupon.id },
        data: { usedCount: { increment: 1 } },
      });
      return prisma.order.update({
        where: { id: order.id },
        data: {
          couponId: coupon.id,
          discountAmount: new Prisma.Decimal(discount.toFixed(2)),
          totalAmount: new Prisma.Decimal((Number(order.totalAmount) - discount).toFixed(2)),
        },
      });
    }
    return order;
  }).then(async (order) => {
    // Confirm to the customer and alert the branch's managers that a new order arrived.
    await createNotification(order.customerId, {
      type: "order",
      titleKey: "notifications.order.placed.title",
      bodyKey: "notifications.order.placed.body",
      params: { id: order.id },
      link: `/customer/orders/${order.id}`,
    });
    await notifyBranchManagers(branch.id, {
      type: "order",
      titleKey: "notifications.order.newOrder.title",
      bodyKey: "notifications.order.newOrder.body",
      params: { id: order.id },
      link: `/branch-manager/orders/${order.id}`,
    });
    return order;
  });
}

type OrderWithBranch = Order & { branch: { managerId: number | null } };

/** Validate the transition and the acting role's right to make it. */
export async function updateOrderStatus(input: {
  order: OrderWithBranch;
  newStatus: OrderStatus;
  user: User;
  /** PHASE J — required when rejecting/cancelling; stored EXACTLY as typed. */
  reason?: string;
}): Promise<Order> {
  const { order, newStatus, user, reason = "" } = input;
  const allowed = ALLOWED_TRANSITIONS[order.status as OrderStatus] ?? [];
  if (!allowed.includes(newStatus)) {
    // PHASE J — an illegal move is a STATE CONFLICT, not a bad field: 409.
    throw conflict(sk("errors.orders.cannotTransitionFromStatus", { status: `@:orderStatus.${order.status}` }));
  }

  if (user.role === "super_admin") {
    // any valid transition
  } else if (user.role === "branch_manager") {
    if (order.branch.managerId !== user.id) throw forbidden(sk("errors.orders.notYourBranch"));
    if (!BRANCH_MANAGER_SETTABLE.includes(newStatus)) {
      throw forbidden(sk("errors.orders.branchManagerCannotSetStatus"));
    }
  } else if (user.role === "rider") {
    if (order.riderId !== user.id) throw forbidden(sk("errors.orders.orderNotAssignedToYou"));
    if (!RIDER_SETTABLE.includes(newStatus)) {
      throw forbidden(sk("errors.orders.riderCannotSetStatus"));
    }
    // C5: the rider must confirm physically receiving the order before the
    // delivery workflow (pickup) can begin.
    if (newStatus === "picked_up" && !(await isReceiveConfirmed(order.id, user.id))) {
      throw conflict(sk("errors.rider.mustConfirmReceiveFirst"));
    }
  } else if (user.role === "customer") {
    if (order.customerId !== user.id) throw forbidden(sk("errors.orders.notYourOrder"));
    if (!CUSTOMER_SETTABLE.includes(newStatus) || order.status !== "pending") {
      throw forbidden(sk("errors.orders.onlyPendingCanBeCancelled"));
    }
  } else {
    throw forbidden(sk("errors.orders.noPermissionToChangeStatus"));
  }

  // PHASE J — a BRANCH MANAGER rejecting an order must state why (the reason is
  // shown to the customer and kept verbatim in the audit trail). A super-admin
  // administrative cancellation is not forced to supply one.
  if (newStatus === "cancelled" && user.role === "branch_manager" && !String(reason).trim()) {
    throw validationError({ reason: sk("errors.orders.rejectionReasonRequired") });
  }

  // The status change and its audit row are written together, so history can
  // never drift from the order's actual state.
  const previousStatus = order.status;
  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.order.update({ where: { id: order.id }, data: { status: newStatus } });
    await tx.orderStatusEvent.create({
      data: {
        orderId: order.id,
        fromStatus: previousStatus,
        toStatus: newStatus,
        actorId: user.id,
        reason: String(reason ?? ""),
      },
    });
    return row;
  });

  // Delivered → record the rider's commission exactly once (unique orderId
  // in RiderCommission makes replays/no-ops safe) and notify the rider.
  if (newStatus === "delivered") {
    await recordCommissionForOrder({
      id: order.id,
      riderId: order.riderId,
      branchId: order.branchId,
    });
    // Customer earns reward coins (idempotent per order). PHASE H — a
    // super-admin EARNING RULE prices the order when one matches; otherwise the
    // legacy flat "order_delivered" rule still applies, so nothing that worked
    // before stops working when no earning rule is configured.
    const byRule = await awardOrderCoinsByRule({
      id: order.id,
      customerId: order.customerId,
      branchId: order.branchId,
      status: newStatus,
      paymentStatus: updated.paymentStatus,
      totalAmount: order.totalAmount,
    });
    if (!byRule) await awardCoins(order.customerId, "order_delivered", `order:${order.id}`);
    // C6: close the rider↔customer delivery chat to new messages (history kept).
    await prisma.orderDeliveryChatThread.updateMany({ where: { orderId: order.id, status: "active" }, data: { status: "closed" } });
  }

  // Notify the customer of every status change (PDF: real-time order updates).
  await createNotification(order.customerId, {
    type: "order",
    titleKey: "notifications.order.statusUpdate.title",
    bodyKey: "notifications.order.statusUpdate.body",
    params: { id: order.id, status: `@:orderStatus.${newStatus}` },
    link: `/customer/orders/${order.id}`,
  });

  // Keep the branch's managers in the loop when the rider drives the delivery.
  if (user.role === "rider") {
    await notifyBranchManagers(order.branchId, {
      type: "order",
      titleKey: "notifications.delivery.riderUpdate.title",
      bodyKey: "notifications.delivery.riderUpdate.body",
      params: { id: order.id, status: `@:orderStatus.${newStatus}` },
      link: `/branch-manager/orders/${order.id}`,
    });
  }

  // Tell the assigned rider when their order gets cancelled by someone else.
  if (newStatus === "cancelled" && order.riderId && order.riderId !== user.id) {
    await createNotification(order.riderId, {
      type: "order",
      titleKey: "notifications.order.cancelled.title",
      bodyKey: "notifications.order.cancelled.body",
      params: { id: order.id },
      link: `/rider/orders/${order.id}`,
    });
  }
  return updated;
}

/** BM (own branch) or super admin assigns/unassigns a rider on an order. */
export async function assignRiderToOrder(input: {
  order: OrderWithBranch;
  riderId: number | null;
  actingUser: User;
}): Promise<Order> {
  const { order, riderId, actingUser } = input;
  if (actingUser.role === "branch_manager" && order.branch.managerId !== actingUser.id) {
    throw forbidden(sk("errors.orders.notYourBranch"));
  }
  const previousRiderId = order.riderId;
  let assignSessionId: number | null = null;
  if (riderId !== null) {
    const rider = await prisma.user.findFirst({
      where: { id: riderId, role: "rider", status: "approved" },
      include: { riderProfile: { select: { isOnline: true } } },
    });
    if (!rider) throw validationError({ rider_id: sk("errors.orders.riderNotFoundOrNotApproved") });
    // Roles spec: an offline rider must not receive new orders.
    if (!rider.riderProfile?.isOnline) {
      throw validationError({ rider_id: sk("errors.orders.riderOffline") });
    }
    // C3: the rider must be on an ACTIVE duty session for THIS order's branch.
    const session = await prisma.riderBranchDutySession.findFirst({
      where: { riderId, status: "active", branchId: order.branchId },
    });
    if (!session) throw validationError({ rider_id: sk("errors.orders.riderNotOnBranchDuty") });
    assignSessionId = session.id;
  }
  // #6 — server-computed branch→delivery distance for the assignment offer.
  let distanceKm: Prisma.Decimal | null = null;
  if (riderId !== null && order.deliveryLat != null && order.deliveryLng != null) {
    const b = await prisma.branch.findUnique({ where: { id: order.branchId }, select: { latitude: true, longitude: true } });
    if (b?.latitude != null && b.longitude != null) {
      distanceKm = new Prisma.Decimal(
        haversineKm(
          { lat: Number(b.latitude), lng: Number(b.longitude) },
          { lat: Number(order.deliveryLat), lng: Number(order.deliveryLng) },
        ).toFixed(3),
      );
    }
  }
  // Transactional reassignment: on rider change, close the previous rider's
  // delivery chat (history preserved; the new rider gets a fresh chat only after
  // their own receive confirmation). Supersede prior pending offers and open a
  // fresh pending offer for the new rider (req #6/#7 accept/reject workflow).
  const updated = await prisma.$transaction(async (tx) => {
    if (previousRiderId && previousRiderId !== riderId) {
      await tx.orderDeliveryChatThread.updateMany({ where: { orderId: order.id, riderId: previousRiderId, status: "active" }, data: { status: "closed" } });
    }
    // Any still-pending offer for this order is superseded by the new decision.
    await tx.riderOrderAssignment.updateMany({ where: { orderId: order.id, status: "pending" }, data: { status: "superseded" } });
    if (riderId !== null) {
      await tx.riderOrderAssignment.create({
        data: { orderId: order.id, riderId, branchId: order.branchId, sessionId: assignSessionId, status: "pending", distanceKm },
      });
    }
    return tx.order.update({ where: { id: order.id }, data: { riderId } });
  });

  if (riderId !== null) {
    // Customer sees a rider was assigned; the rider gets a new-delivery ping.
    await createNotification(order.customerId, {
      type: "order",
      titleKey: "notifications.order.riderAssigned.title",
      bodyKey: "notifications.order.riderAssigned.body",
      params: { id: order.id },
      link: `/customer/orders/${order.id}`,
    });
    await createNotification(riderId, {
      type: "order",
      titleKey: "notifications.delivery.assigned.title",
      bodyKey: "notifications.delivery.assigned.body",
      params: { id: order.id },
      link: `/rider/orders/${order.id}`,
    });
  }
  return updated;
}
