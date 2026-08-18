import "server-only";
import type { Order, User } from "@prisma/client";

import { prisma } from "@/lib/db";
import { conflict, forbidden, notFound, sk, validationError } from "@/lib/http/errors";
import { createNotification } from "@/lib/services/notifications";
import { validatePhone } from "@/lib/validation/server";

/**
 * PHASE S — payment methods.
 *
 * Two methods only, and NEITHER is an automated gateway:
 *  • Cash on Delivery — the order stays `unpaid` and is settled by the existing
 *    delivery workflow. Nothing here marks it paid.
 *  • Manual bKash — the customer pays the branch's configured number out of band
 *    and submits the transaction id. The order becomes `pending_verification`
 *    and is NEVER auto-marked paid; a branch manager (own branch) or accounts
 *    verifies or rejects it, and the actor + timestamp are recorded.
 */

export const PAYMENT_STATUSES = [
  "unpaid",
  "pending_verification",
  "verified",
  "rejected",
  "paid",
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

/** Normalize a bKash transaction id for storage + duplicate detection. */
function normalizeTransactionId(raw: unknown): string {
  const value = String(raw ?? "").trim().toUpperCase();
  if (!value) throw validationError({ transaction_id: sk("errors.payments.transactionIdRequired") });
  // bKash TrxIDs are short alphanumeric tokens; reject anything else outright.
  if (!/^[A-Z0-9]{6,32}$/.test(value)) {
    throw validationError({ transaction_id: sk("errors.payments.transactionIdInvalid") });
  }
  return value;
}

/** Load an order the CUSTOMER owns, or throw (IDOR-safe). */
async function ownOrder(user: User, orderId: number): Promise<Order> {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw notFound(sk("errors.orders.notFound"));
  if (order.customerId !== user.id) throw forbidden(sk("errors.orders.notYourOrder"));
  return order;
}

/**
 * Customer submits a manual bKash payment for their own order.
 * Rejects when the branch has bKash disabled or no configured number, when the
 * transaction id is malformed, and when that transaction id was already used on
 * another order (duplicate-payment protection).
 */
export async function submitBkashPayment(
  user: User,
  orderId: number,
  input: { transactionId: unknown; payerPhone: unknown },
) {
  const order = await ownOrder(user, orderId);
  if (order.paymentMethod !== "bkash") {
    throw validationError({ payment_method: sk("errors.payments.notBkashOrder") });
  }
  if (order.paymentStatus === "verified" || order.paymentStatus === "paid") {
    throw conflict(sk("errors.payments.alreadySettled"));
  }

  const branch = await prisma.branch.findUnique({ where: { id: order.branchId } });
  if (!branch) throw notFound(sk("errors.catalog.branchNotFound"));
  if (!branch.bkashEnabled || !branch.bkashNumber.trim()) {
    throw validationError({ payment_method: sk("errors.payments.bkashUnavailable") });
  }

  const transactionId = normalizeTransactionId(input.transactionId);
  const payerPhone = validatePhone(String(input.payerPhone ?? ""), "payer_phone");

  // Duplicate transaction ids are refused across ALL orders.
  const clash = await prisma.order.findFirst({
    where: { bkashTransactionId: transactionId, id: { not: order.id } },
    select: { id: true },
  });
  if (clash) throw conflict(sk("errors.payments.duplicateTransaction"));

  const updated = await prisma.order.update({
    where: { id: order.id },
    data: {
      bkashTransactionId: transactionId,
      bkashPayerPhone: payerPhone,
      // Snapshot the number actually advertised, so later branch edits never
      // rewrite what this customer was told to pay.
      bkashDestinationNumber: branch.bkashNumber,
      paymentStatus: "pending_verification",
      paymentSubmittedAt: new Date(),
      paymentRejectionReason: "",
    },
  });

  await notifyBranchPaymentQueue(order.branchId, order.id);
  return updated;
}

async function notifyBranchPaymentQueue(branchId: number, orderId: number) {
  const managers = await prisma.user.findMany({
    where: { role: "branch_manager", managedBranches: { some: { id: branchId } } },
    select: { id: true },
  });
  for (const m of managers) {
    await createNotification(m.id, {
      type: "payment",
      titleKey: "notifications.payment.pending.title",
      bodyKey: "notifications.payment.pending.body",
      params: { id: orderId },
      link: `/branch-manager/orders/${orderId}`,
    });
  }
}

/** Who may verify a payment: accounts (any branch) or the OWN-branch manager. */
async function assertCanVerify(user: User, order: Order) {
  if (user.role === "accounts" || user.role === "super_admin") return;
  if (user.role === "branch_manager") {
    const branch = await prisma.branch.findFirst({ where: { managerId: user.id } });
    if (!branch || branch.id !== order.branchId) {
      throw forbidden(sk("errors.payments.notYourBranch"));
    }
    return;
  }
  throw forbidden(sk("errors.payments.verifyForbidden"));
}

/**
 * Staff verifies or rejects a submitted manual payment. Records the verifier and
 * timestamp, keeps a rejection reason exactly as typed, notifies the customer,
 * and refuses to re-decide an already-decided payment (409) so the audit trail
 * cannot be overwritten.
 */
export async function decideBkashPayment(
  user: User,
  orderId: number,
  approve: boolean,
  reason = "",
) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw notFound(sk("errors.orders.notFound"));
  await assertCanVerify(user, order);

  if (order.paymentStatus !== "pending_verification") {
    throw conflict(sk("errors.payments.notPendingVerification"));
  }
  if (!approve && !String(reason).trim()) {
    throw validationError({ reason: sk("errors.payments.rejectionReasonRequired") });
  }

  const updated = await prisma.order.update({
    where: { id: order.id },
    data: {
      paymentStatus: approve ? "verified" : "rejected",
      paymentVerifiedById: user.id,
      paymentVerifiedAt: new Date(),
      // User-entered reason is stored EXACTLY as typed.
      paymentRejectionReason: approve ? "" : String(reason),
    },
  });

  await createNotification(order.customerId, {
    type: "payment",
    titleKey: approve ? "notifications.payment.verified.title" : "notifications.payment.rejected.title",
    bodyKey: approve ? "notifications.payment.verified.body" : "notifications.payment.rejected.body",
    params: { id: order.id },
    link: `/customer/orders/${order.id}`,
  });
  return updated;
}

/**
 * Branch bKash settings. Super admin may configure any branch; a branch manager
 * only their own (the id is resolved against the assignment, never trusted).
 */
export async function updateBranchPaymentSettings(
  user: User,
  submittedBranchId: number | undefined,
  input: { bkashEnabled?: unknown; bkashNumber?: unknown; bkashInstructions?: unknown },
) {
  const { resolveConfigurableBranch } = await import("@/lib/services/branches");
  const branch = await resolveConfigurableBranch(user, submittedBranchId);

  const data: Record<string, unknown> = {};
  if (input.bkashNumber !== undefined) {
    const raw = String(input.bkashNumber ?? "").trim();
    // An empty value clears the number (and therefore disables acceptance).
    data.bkashNumber = raw ? validatePhone(raw, "bkash_number") : "";
  }
  if (input.bkashInstructions !== undefined) {
    data.bkashInstructions = String(input.bkashInstructions ?? "").slice(0, 500);
  }
  if (input.bkashEnabled !== undefined) {
    const enabled = input.bkashEnabled === true || input.bkashEnabled === "true";
    const effectiveNumber =
      (data.bkashNumber as string | undefined) ?? branch.bkashNumber;
    if (enabled && !String(effectiveNumber ?? "").trim()) {
      // Cannot advertise bKash without a number to pay to.
      throw validationError({ bkash_number: sk("errors.payments.numberRequiredToEnable") });
    }
    data.bkashEnabled = enabled;
  }
  if (Object.keys(data).length === 0) {
    throw validationError({ detail: sk("errors.catalog.nothingToChange") });
  }
  return prisma.branch.update({ where: { id: branch.id }, data });
}
