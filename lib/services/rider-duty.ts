import "server-only";
import type { Prisma, User } from "@prisma/client";

import { prisma } from "@/lib/db";
import { conflict, forbidden, notFound, sk, validationError } from "@/lib/http/errors";
import { createNotification, notifyBranchManagers } from "@/lib/services/notifications";

// An order counts as an ACTIVE delivery for a rider while it is assigned to them
// and not yet delivered or cancelled — this blocks going offline / switching.
const OPEN_DELIVERY_STATES = ["accepted", "preparing", "ready", "picked_up", "on_the_way"];

// ── Serializers ─────────────────────────────────────────────────────────
export function serializeDutySession(s: {
  id: number; riderId: number; branchId: number; status: string; startedAt: Date; endedAt: Date | null; endReason: string;
  branch?: { name: string; brandType: string; address: string } | null;
}) {
  return {
    id: s.id,
    rider: s.riderId,
    branch: s.branchId,
    branch_name: s.branch?.name ?? "",
    branch_brand_type: s.branch?.brandType ?? "",
    branch_address: s.branch?.address ?? "",
    status: s.status,
    started_at: s.startedAt.toISOString(),
    ended_at: s.endedAt ? s.endedAt.toISOString() : null,
    end_reason: s.endReason,
  };
}

// ── C1: eligible branches + start duty ──────────────────────────────────
export async function eligibleBranchesForRider() {
  // Eligible = active branches. (Riders are not locked to a home branch.)
  return prisma.branch.findMany({ where: { isActive: true }, orderBy: { name: "asc" } });
}

export async function activeDutySession(riderId: number) {
  return prisma.riderBranchDutySession.findFirst({
    where: { riderId, status: "active" },
    include: { branch: true },
  });
}

/** Any assigned, not-yet-finished delivery blocks going offline / switching. */
export async function hasActiveDelivery(riderId: number): Promise<boolean> {
  const open = await prisma.order.findFirst({ where: { riderId, status: { in: OPEN_DELIVERY_STATES } } });
  return Boolean(open);
}

/**
 * Start an online duty session at a branch (C1). Transactional: rejects a
 * second concurrent active session, validates the branch is active, flips the
 * rider online, and opens the duty chat thread. Notifies the branch's managers.
 */
export async function startDuty(rider: User, branchId: number) {
  if (!branchId || Number.isNaN(branchId)) throw validationError({ branch_id: sk("errors.rider.selectBranch") });
  const branch = await prisma.branch.findFirst({ where: { id: branchId, isActive: true } });
  if (!branch) throw validationError({ branch_id: sk("errors.rider.branchNotEligible") });

  const session = await prisma.$transaction(async (tx) => {
    const existing = await tx.riderBranchDutySession.findFirst({ where: { riderId: rider.id, status: "active" } });
    if (existing) throw conflict(sk("errors.rider.alreadyOnDuty"));
    const s = await tx.riderBranchDutySession.create({
      data: { riderId: rider.id, branchId: branch.id, status: "active" },
      include: { branch: true },
    });
    await tx.riderProfile.upsert({
      where: { userId: rider.id },
      create: { userId: rider.id, isOnline: true },
      update: { isOnline: true },
    });
    // One duty chat thread per session (unique sessionId).
    await tx.riderDutyChatThread.create({ data: { sessionId: s.id, riderId: rider.id, branchId: branch.id } });
    return s;
  });

  await notifyBranchManagers(branch.id, {
    type: "system",
    titleKey: "notifications.rider.dutyStarted.title",
    bodyKey: "notifications.rider.dutyStarted.body",
    params: { rider: `${rider.firstName} ${rider.lastName}`.trim() || rider.username },
    link: "/branch-manager/riders",
  });
  return session;
}

/**
 * End the active duty session (C2). Transactional: requires an active session,
 * blocks while an active delivery is unresolved, flips offline, closes the duty
 * chat and any open delivery chats.
 */
export async function endDuty(rider: User, reason = "offline") {
  const active = await activeDutySession(rider.id);
  if (!active) throw validationError({ detail: sk("errors.rider.notOnDuty") });
  if (await hasActiveDelivery(rider.id)) throw conflict(sk("errors.rider.activeDeliveryBlocksOffline"));

  return prisma.$transaction(async (tx) => {
    const ended = await tx.riderBranchDutySession.update({
      where: { id: active.id },
      data: { status: "ended", endedAt: new Date(), endReason: reason },
      include: { branch: true },
    });
    await tx.riderProfile.update({ where: { userId: rider.id }, data: { isOnline: false } });
    await tx.riderDutyChatThread.updateMany({ where: { sessionId: active.id }, data: { isClosed: true } });
    await tx.orderDeliveryChatThread.updateMany({ where: { riderId: rider.id, status: "active" }, data: { status: "closed" } });
    return ended;
  });
}

export async function dutyHistory(riderId: number) {
  return prisma.riderBranchDutySession.findMany({
    where: { riderId },
    include: { branch: true },
    orderBy: { startedAt: "desc" },
    take: 100,
  });
}

// ── C3: eligible orders for the active-session branch ───────────────────
export async function eligibleOrdersForRider(rider: User) {
  const active = await activeDutySession(rider.id);
  // Orders already assigned to this rider are always visible; the pooled
  // "ready" orders are scoped to the active session branch only.
  const where: Prisma.OrderWhereInput = active
    ? { OR: [{ riderId: rider.id }, { branchId: active.branchId, status: "ready", riderId: null }] }
    : { riderId: rider.id };
  return { activeBranchId: active?.branchId ?? null, where };
}

/** Server-side guard for a rider viewing/acting on a specific order (C3 IDOR). */
export async function assertRiderCanAccessOrder(rider: User, order: { id: number; branchId: number; status: string; riderId: number | null }) {
  if (order.riderId === rider.id) return; // own assignment
  const active = await activeDutySession(rider.id);
  if (active && order.branchId === active.branchId && order.status === "ready" && order.riderId == null) return; // eligible pool
  throw forbidden(sk("errors.rider.orderNotEligible"));
}

// ── C5: order receive confirmation ──────────────────────────────────────
export async function isReceiveConfirmed(orderId: number, riderId: number): Promise<boolean> {
  const c = await prisma.orderReceiveConfirmation.findUnique({ where: { orderId_riderId: { orderId, riderId } } });
  return Boolean(c);
}

/**
 * The assigned rider confirms physically receiving the order (C5). Transactional
 * + idempotent. Only the currently-assigned rider, online in an active session
 * for the order's branch, with the order in a confirmable state, may confirm.
 * Opens the rider↔customer delivery chat (C6) and notifies BM + customer.
 */
export async function confirmReceive(rider: User, orderId: number) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw notFound(sk("errors.orders.orderNotFound"));
  if (order.riderId !== rider.id) throw forbidden(sk("errors.rider.notAssignedRider"));
  const active = await activeDutySession(rider.id);
  if (!active || active.branchId !== order.branchId) throw forbidden(sk("errors.rider.notOnDutyForBranch"));
  if (order.status !== "ready") throw conflict(sk("errors.rider.orderNotConfirmable"));

  const { confirmation, created } = await prisma.$transaction(async (tx) => {
    // Idempotent: a repeat confirm by the same rider returns the existing row.
    const existing = await tx.orderReceiveConfirmation.findUnique({ where: { orderId_riderId: { orderId, riderId: rider.id } } });
    const row = existing ?? (await tx.orderReceiveConfirmation.create({
      data: { orderId, riderId: rider.id, branchId: order.branchId, sessionId: active.id, status: "confirmed" },
    }));
    // Open the delivery chat for this rider+order (only once).
    const openThread = await tx.orderDeliveryChatThread.findFirst({ where: { orderId, riderId: rider.id, status: "active" } });
    if (!openThread) {
      await tx.orderDeliveryChatThread.create({ data: { orderId, riderId: rider.id, customerId: order.customerId, status: "active" } });
    }
    return { confirmation: row, created: !existing };
  });

  if (created) {
    await notifyBranchManagers(order.branchId, {
      type: "order",
      titleKey: "notifications.rider.receiveConfirmed.title",
      bodyKey: "notifications.rider.receiveConfirmed.body",
      params: { id: order.id, rider: `${rider.firstName} ${rider.lastName}`.trim() || rider.username },
      link: `/branch-manager/orders/${order.id}`,
    });
    await createNotification(order.customerId, {
      type: "order",
      titleKey: "notifications.rider.receiveConfirmedCustomer.title",
      bodyKey: "notifications.rider.receiveConfirmedCustomer.body",
      params: { id: order.id },
      link: `/customer/orders/${order.id}`,
    });
  }
  return confirmation;
}

// ── C4/C6 shared chat helpers ───────────────────────────────────────────
function isBody(body: unknown): string {
  const s = String(body ?? "").trim();
  if (!s) throw validationError({ body: sk("errors.ops.messageRequired") });
  return s;
}

// Duty chat (rider ↔ branch manager) membership
export async function dutyThreadWithAccess(user: User, threadId: number) {
  const thread = await prisma.riderDutyChatThread.findUnique({ where: { id: threadId } });
  if (!thread) throw notFound();
  const ok =
    user.id === thread.riderId ||
    user.role === "super_admin" || // audited oversight (read)
    (user.role === "branch_manager" && (await prisma.branch.findFirst({ where: { id: thread.branchId, managerId: user.id } })) != null);
  if (!ok) throw forbidden();
  return thread;
}

export async function sendDutyMessage(user: User, threadId: number, body: string) {
  const text = isBody(body);
  const thread = await dutyThreadWithAccess(user, threadId);
  if (user.role === "super_admin") throw forbidden(); // oversight is read-only
  if (thread.isClosed) throw conflict(sk("errors.rider.chatClosed"));
  const msg = await prisma.riderDutyChatMessage.create({ data: { threadId, senderId: user.id, body: text } });
  // Notify the other party.
  const otherIsRider = user.id !== thread.riderId;
  const recipientId = otherIsRider ? thread.riderId : (await managerOfBranch(thread.branchId));
  if (recipientId) {
    await createNotification(recipientId, {
      type: "system",
      titleKey: "notifications.rider.dutyChat.title",
      bodyKey: "notifications.rider.dutyChat.body",
      params: {},
      link: otherIsRider ? "/rider/duty-chat" : `/branch-manager/riders`,
    });
  }
  return msg;
}

export async function dutyMessages(user: User, threadId: number) {
  const thread = await dutyThreadWithAccess(user, threadId);
  const messages = await prisma.riderDutyChatMessage.findMany({ where: { threadId }, orderBy: { createdAt: "asc" }, include: { sender: true } });
  // Mark read for the viewing participant.
  if (user.id === thread.riderId) await prisma.riderDutyChatThread.update({ where: { id: threadId }, data: { riderLastReadAt: new Date() } });
  else if (user.role === "branch_manager") await prisma.riderDutyChatThread.update({ where: { id: threadId }, data: { managerLastReadAt: new Date() } });
  return { thread, messages };
}

async function managerOfBranch(branchId: number): Promise<number | null> {
  const b = await prisma.branch.findUnique({ where: { id: branchId }, select: { managerId: true } });
  return b?.managerId ?? null;
}

// Delivery chat (rider ↔ customer) membership
export async function deliveryThreadWithAccess(user: User, threadId: number) {
  const thread = await prisma.orderDeliveryChatThread.findUnique({ where: { id: threadId } });
  if (!thread) throw notFound();
  const ok = user.id === thread.riderId || user.id === thread.customerId || user.role === "super_admin";
  if (!ok) throw forbidden();
  return thread;
}

export async function sendDeliveryMessage(user: User, threadId: number, body: string) {
  const text = isBody(body);
  const thread = await deliveryThreadWithAccess(user, threadId);
  if (user.role === "super_admin") throw forbidden(); // oversight read-only
  if (thread.status !== "active") throw conflict(sk("errors.rider.chatClosed"));
  const msg = await prisma.orderDeliveryChatMessage.create({ data: { threadId, senderId: user.id, body: text } });
  const recipientId = user.id === thread.riderId ? thread.customerId : thread.riderId;
  await createNotification(recipientId, {
    type: "order",
    titleKey: "notifications.rider.deliveryChat.title",
    bodyKey: "notifications.rider.deliveryChat.body",
    params: { id: thread.orderId },
    link: user.id === thread.riderId ? `/customer/orders/${thread.orderId}` : `/rider/orders/${thread.orderId}`,
  });
  return msg;
}

export async function deliveryMessages(user: User, threadId: number) {
  const thread = await deliveryThreadWithAccess(user, threadId);
  const messages = await prisma.orderDeliveryChatMessage.findMany({ where: { threadId }, orderBy: { createdAt: "asc" }, include: { sender: true } });
  if (user.id === thread.riderId) await prisma.orderDeliveryChatThread.update({ where: { id: threadId }, data: { riderLastReadAt: new Date() } });
  else if (user.id === thread.customerId) await prisma.orderDeliveryChatThread.update({ where: { id: threadId }, data: { customerLastReadAt: new Date() } });
  return { thread, messages };
}

/** The active delivery thread a customer may see for an order (only after confirm). */
export async function deliveryThreadForOrder(orderId: number) {
  return prisma.orderDeliveryChatThread.findFirst({ where: { orderId, status: "active" }, orderBy: { createdAt: "desc" } });
}

export function serializeChatMessage(m: { id: number; senderId: number; body: string; createdAt: Date; sender?: { firstName: string; lastName: string; role: string } | null }) {
  return {
    id: m.id,
    sender: m.senderId,
    sender_name: m.sender ? `${m.sender.firstName} ${m.sender.lastName}`.trim() : "",
    sender_role: m.sender?.role ?? "",
    body: m.body, // user-written content kept exactly as typed
    created_at: m.createdAt.toISOString(),
  };
}
