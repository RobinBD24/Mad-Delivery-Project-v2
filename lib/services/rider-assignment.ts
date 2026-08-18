import "server-only";
import type { User } from "@prisma/client";

import { prisma } from "@/lib/db";
import { conflict, forbidden, notFound, sk, validationError } from "@/lib/http/errors";
import { notifyBranchManagers } from "@/lib/services/notifications";
import { confirmReceive } from "@/lib/services/rider-duty";

const RESPONDABLE_STATES = new Set(["pending", "accepted", "preparing", "ready"]);

function serializeAssignment(a: {
  id: number;
  orderId: number;
  riderId: number;
  branchId: number;
  status: string;
  distanceKm: unknown;
  rejectionReason: string;
  respondedAt: Date | null;
  createdAt: Date;
}) {
  return {
    id: a.id,
    order: a.orderId,
    rider: a.riderId,
    branch: a.branchId,
    status: a.status,
    distance_km: a.distanceKm != null ? Number(a.distanceKm) : null,
    rejection_reason: a.rejectionReason,
    responded_at: a.respondedAt ? a.respondedAt.toISOString() : null,
    created_at: a.createdAt.toISOString(),
  };
}

/**
 * Pending assignment offers for the rider (req #6). Only offers where the rider
 * is STILL the order's assigned rider and the offer is pending are returned —
 * so a superseded/reassigned offer never surfaces a stale popup. Includes the
 * order number + delivery address + distance for the popup.
 */
export async function pendingAssignmentsForRider(rider: User) {
  const rows = await prisma.riderOrderAssignment.findMany({
    where: { riderId: rider.id, status: "pending", order: { riderId: rider.id } },
    include: {
      order: { select: { id: true, orderNumber: true, deliveryAddress: true, deliveryLat: true, deliveryLng: true, branchId: true, status: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  return rows
    .filter((r) => RESPONDABLE_STATES.has(r.order.status))
    .map((r) => ({
      ...serializeAssignment(r),
      order_number: r.order.orderNumber,
      delivery_address: r.order.deliveryAddress,
      delivery_lat: r.order.deliveryLat != null ? Number(r.order.deliveryLat) : null,
      delivery_lng: r.order.deliveryLng != null ? Number(r.order.deliveryLng) : null,
    }));
}

/**
 * Accept / reject a pending assignment (req #6/#7). Server verifies: the rider
 * is the order's currently-assigned rider, has an active duty session for the
 * order's branch, the order is in a respondable state, and a pending offer
 * exists (not already responded / superseded). Idempotent per terminal state.
 */
export async function respondToAssignment(
  rider: User,
  orderId: number,
  action: "accept" | "reject",
  reason = "",
) {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { branch: true } });
  if (!order) throw notFound(sk("errors.orders.orderNotFound"));
  if (order.riderId !== rider.id) throw forbidden(sk("errors.orders.orderNotAssignedToYou"));

  const session = await prisma.riderBranchDutySession.findFirst({
    where: { riderId: rider.id, status: "active", branchId: order.branchId },
  });
  if (!session) throw conflict(sk("errors.orders.riderNotOnBranchDuty"));

  const assignment = await prisma.riderOrderAssignment.findFirst({
    where: { orderId, riderId: rider.id },
    orderBy: { createdAt: "desc" },
  });
  if (!assignment) throw notFound(sk("errors.rider.noPendingAssignment"));

  // Idempotency: repeating the same terminal response is a no-op.
  if (assignment.status === "accepted" && action === "accept") return serializeAssignment(assignment);
  if (assignment.status === "rejected" && action === "reject") return serializeAssignment(assignment);
  if (assignment.status !== "pending") throw conflict(sk("errors.rider.assignmentAlreadyResolved"));
  if (!RESPONDABLE_STATES.has(order.status)) throw conflict(sk("errors.rider.assignmentAlreadyResolved"));

  if (action === "accept") {
    const updated = await prisma.riderOrderAssignment.update({
      where: { id: assignment.id },
      data: { status: "accepted", respondedAt: new Date() },
    });
    await notifyBranchManagers(order.branchId, {
      type: "delivery",
      titleKey: "notifications.assignment.accepted.title",
      bodyKey: "notifications.assignment.accepted.body",
      params: { number: order.orderNumber ?? `#${order.id}` },
      link: `/branch-manager/orders/${order.id}`,
    });
    return serializeAssignment(updated);
  }

  // Reject — reason required (stored verbatim); order returns to unassigned.
  const trimmed = String(reason ?? "").trim();
  if (!trimmed) throw validationError({ reason: sk("errors.rider.rejectionReasonRequired") });
  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.riderOrderAssignment.update({
      where: { id: assignment.id },
      data: { status: "rejected", rejectionReason: trimmed, respondedAt: new Date() },
    });
    // Return the order to the correct assignment state — unassigned (not lost).
    await tx.order.update({ where: { id: orderId }, data: { riderId: null } });
    await tx.orderDeliveryChatThread.updateMany({ where: { orderId, riderId: rider.id, status: "active" }, data: { status: "closed" } });
    return updated;
  });
  await notifyBranchManagers(order.branchId, {
    type: "delivery",
    titleKey: "notifications.assignment.rejected.title",
    bodyKey: "notifications.assignment.rejected.body",
    params: { number: order.orderNumber ?? `#${order.id}`, reason: trimmed },
    link: `/branch-manager/orders/${order.id}`,
  });
  return serializeAssignment(result);
}

/**
 * Pickup verification by unique order number (req #8/#16). The rider references
 * the order number; the server verifies it maps to an order assigned to THIS
 * rider, at a branch the rider is on active duty for, then runs the existing
 * receive-confirmation (which enforces state + idempotency + opens the delivery
 * chat + notifies). A valid-looking number alone never marks an order collected.
 */
export async function verifyPickupByOrderNumber(rider: User, orderNumber: string) {
  const number = String(orderNumber ?? "").trim();
  if (!number) throw validationError({ order_number: sk("errors.rider.orderNumberRequired") });
  const order = await prisma.order.findUnique({ where: { orderNumber: number } });
  if (!order) throw notFound(sk("errors.orders.orderNotFound"));
  if (order.riderId !== rider.id) throw forbidden(sk("errors.orders.orderNotAssignedToYou"));
  const session = await prisma.riderBranchDutySession.findFirst({
    where: { riderId: rider.id, status: "active", branchId: order.branchId },
  });
  if (!session) throw conflict(sk("errors.orders.riderNotOnBranchDuty"));
  // Delegates all state/idempotency checks to the existing confirmReceive.
  const c = await confirmReceive(rider, order.id);
  return {
    order: c.orderId,
    order_number: order.orderNumber,
    rider: c.riderId,
    branch: c.branchId,
    status: c.status,
    confirmed_at: c.confirmedAt.toISOString(),
  };
}

/**
 * Acceptance details for a Branch Manager order view (req #7/#14). Reads the
 * latest assignment + accepting rider from the DB — acceptance is never inferred
 * from UI state. Caller must already have branch access to the order.
 */
export async function acceptanceDetailsForOrder(orderId: number) {
  const a = await prisma.riderOrderAssignment.findFirst({
    where: { orderId },
    orderBy: { createdAt: "desc" },
    include: { rider: { select: { firstName: true, lastName: true, phone: true, username: true } } },
  });
  if (!a) return null;
  return {
    ...serializeAssignment(a),
    rider_name: `${a.rider.firstName} ${a.rider.lastName}`.trim() || a.rider.username,
    rider_phone: a.rider.phone,
  };
}
