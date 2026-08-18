import "server-only";
import { Prisma } from "@prisma/client";
import type { User } from "@prisma/client";

import { prisma } from "@/lib/db";
import { forbidden, notFound, sk, validationError } from "@/lib/http/errors";
import { createNotification, notifyUsers } from "@/lib/services/notifications";
import { riderCommissionRate } from "@/lib/services/settings";

export const WITHDRAWAL_INCLUDE = {
  rider: true,
  decidedBy: true,
} satisfies Prisma.RiderWithdrawalInclude;

const ZERO = new Prisma.Decimal(0);

function sumDecimal(rows: { amount: Prisma.Decimal }[]): Prisma.Decimal {
  return rows.reduce((acc, r) => acc.plus(r.amount), ZERO);
}

async function auditLog(input: {
  actorId: number | null;
  action: string;
  entity: string;
  entityId: number | string;
  detail?: string;
}) {
  await prisma.financialAuditLog.create({
    data: {
      actorId: input.actorId,
      action: input.action,
      entity: input.entity,
      entityId: String(input.entityId),
      detail: input.detail ?? "",
    },
  });
}

// ── Commission ──────────────────────────────────────────────────────────

/**
 * Record the rider's commission for a delivered order — exactly once.
 * The unique constraint on RiderCommission.orderId is the hard guarantee;
 * a concurrent/duplicate call hits P2002 and is treated as already-recorded.
 */
export async function recordCommissionForOrder(order: {
  id: number;
  riderId: number | null;
  branchId: number;
}): Promise<boolean> {
  if (!order.riderId) return false;
  const rate = await riderCommissionRate();
  try {
    await prisma.riderCommission.create({
      data: { riderId: order.riderId, orderId: order.id, branchId: order.branchId, amount: rate },
    });
  } catch (err) {
    // P2002 = commission already recorded for this order; not an error.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return false;
    throw err;
  }

  await auditLog({
    actorId: order.riderId,
    action: "commission_recorded",
    entity: "RiderCommission",
    entityId: order.id,
    detail: `Order #${order.id} → ৳${rate.toFixed(2)}`,
  });
  await createNotification(order.riderId, {
    type: "withdrawal",
    titleKey: "notifications.commission.added.title",
    bodyKey: "notifications.commission.added.body",
    params: { id: order.id, amount: rate.toFixed(2) },
    link: "/rider/wallet",
  });
  return true;
}

// ── Wallet summary ──────────────────────────────────────────────────────

export interface WalletSummary {
  totalDeliveries: number;
  totalEarnings: Prisma.Decimal;
  pendingAmount: Prisma.Decimal; // held: pending + approved withdrawals
  paidAmount: Prisma.Decimal; // lifetime paid out
  availableBalance: Prisma.Decimal; // earnings − held − paid
}

export async function riderWalletSummary(riderId: number): Promise<WalletSummary> {
  const [commissions, withdrawals] = await Promise.all([
    prisma.riderCommission.findMany({ where: { riderId }, select: { amount: true } }),
    prisma.riderWithdrawal.findMany({
      where: { riderId, status: { in: ["pending", "approved", "paid"] } },
      select: { amount: true, status: true },
    }),
  ]);

  const totalEarnings = sumDecimal(commissions);
  const pendingAmount = sumDecimal(withdrawals.filter((w) => w.status !== "paid"));
  const paidAmount = sumDecimal(withdrawals.filter((w) => w.status === "paid"));

  return {
    totalDeliveries: commissions.length,
    totalEarnings,
    pendingAmount,
    paidAmount,
    availableBalance: totalEarnings.minus(pendingAmount).minus(paidAmount),
  };
}

// ── Withdrawals ─────────────────────────────────────────────────────────

export async function createWithdrawal(rider: User, amountRaw: string, note: string) {
  const amount = Number(amountRaw);
  if (!amountRaw || Number.isNaN(amount) || amount <= 0) {
    throw validationError({ amount: sk("errors.money.enterValidAmount") });
  }

  const summary = await riderWalletSummary(rider.id);
  if (new Prisma.Decimal(amountRaw).greaterThan(summary.availableBalance)) {
    throw validationError({
      amount: sk("errors.money.insufficientBalance", { amount: summary.availableBalance.toFixed(2) }),
    });
  }

  const withdrawal = await prisma.riderWithdrawal.create({
    data: { riderId: rider.id, amount: new Prisma.Decimal(amountRaw), note: note.trim() },
    include: WITHDRAWAL_INCLUDE,
  });

  await auditLog({
    actorId: rider.id,
    action: "withdrawal_requested",
    entity: "RiderWithdrawal",
    entityId: withdrawal.id,
    detail: `৳${withdrawal.amount.toFixed(2)}`,
  });

  // Notify accounts + super admin.
  const staff = await prisma.user.findMany({
    where: { role: { in: ["accounts", "super_admin"] }, status: "approved", isActive: true },
    select: { id: true },
  });
  await notifyUsers(
    staff.map((u) => u.id),
    {
      type: "withdrawal",
      titleKey: "notifications.withdrawal.requested.title",
      bodyKey: "notifications.withdrawal.requested.body",
      params: {
        name: `${rider.firstName} ${rider.lastName}`.trim(),
        amount: withdrawal.amount.toFixed(2),
      },
      link: "/accounts/withdrawals",
    },
  );
  return withdrawal;
}

type Decision = "approve" | "reject" | "pay";

const DECISION_RULES: Record<Decision, { from: string[]; to: string }> = {
  approve: { from: ["pending"], to: "approved" },
  reject: { from: ["pending", "approved"], to: "rejected" },
  pay: { from: ["approved"], to: "paid" },
};

const DECISION_NOTIFY: Record<Decision, { titleKey: string; bodyKey: string }> = {
  approve: {
    titleKey: "notifications.withdrawal.approved.title",
    bodyKey: "notifications.withdrawal.approved.body",
  },
  reject: {
    titleKey: "notifications.withdrawal.rejected.title",
    bodyKey: "notifications.withdrawal.rejected.body",
  },
  pay: {
    titleKey: "notifications.withdrawal.paid.title",
    bodyKey: "notifications.withdrawal.paid.body",
  },
};

/** Accounts / super admin acts on a withdrawal request. */
export async function decideWithdrawal(
  withdrawalId: number,
  decision: Decision,
  actor: User,
  rejectionReason = "",
) {
  if (actor.role !== "accounts" && actor.role !== "super_admin") throw forbidden();

  const withdrawal = await prisma.riderWithdrawal.findUnique({ where: { id: withdrawalId } });
  if (!withdrawal) throw notFound();

  const rule = DECISION_RULES[decision];
  if (!rule.from.includes(withdrawal.status)) {
    throw validationError({ status: sk("errors.money.requestAlreadyInStatus", { status: withdrawal.status }) });
  }
  if (decision === "reject" && !rejectionReason.trim()) {
    throw validationError({ reason: sk("errors.money.enterRejectionReason") });
  }

  const updated = await prisma.riderWithdrawal.update({
    where: { id: withdrawal.id },
    data: {
      status: rule.to,
      decidedById: actor.id,
      decidedAt: new Date(),
      rejectionReason: decision === "reject" ? rejectionReason.trim() : "",
      paidAt: decision === "pay" ? new Date() : null,
    },
    include: WITHDRAWAL_INCLUDE,
  });

  await auditLog({
    actorId: actor.id,
    action: `withdrawal_${rule.to}`,
    entity: "RiderWithdrawal",
    entityId: withdrawal.id,
    detail: `৳${withdrawal.amount.toFixed(2)}${decision === "reject" ? ` — ${rejectionReason.trim()}` : ""}`,
  });

  const note = DECISION_NOTIFY[decision];
  const withReason = decision === "reject" && Boolean(rejectionReason.trim());
  await createNotification(withdrawal.riderId, {
    type: "withdrawal",
    titleKey: note.titleKey,
    bodyKey: withReason ? "notifications.withdrawal.rejectedWithReason.body" : note.bodyKey,
    params: {
      amount: withdrawal.amount.toFixed(2),
      ...(withReason ? { reason: rejectionReason.trim() } : {}),
    },
    link: "/rider/withdrawals",
  });
  return updated;
}

// ── Accounts-side aggregates ────────────────────────────────────────────

export interface RiderEarningRow {
  riderId: number;
  riderName: string;
  riderUsername: string;
  branchName: string | null;
  deliveries: number;
  totalEarnings: Prisma.Decimal;
  pendingAmount: Prisma.Decimal;
  paidAmount: Prisma.Decimal;
  availableBalance: Prisma.Decimal;
}

/** Per-rider earnings/balance table for the Accounts module. */
export async function allRiderEarnings(): Promise<RiderEarningRow[]> {
  const riders = await prisma.user.findMany({
    where: { role: "rider", status: "approved" },
    include: { riderProfile: { include: { assignedBranch: true } } },
    orderBy: { firstName: "asc" },
  });
  const rows: RiderEarningRow[] = [];
  for (const rider of riders) {
    const s = await riderWalletSummary(rider.id);
    rows.push({
      riderId: rider.id,
      riderName: `${rider.firstName} ${rider.lastName}`.trim() || rider.username,
      riderUsername: rider.username,
      branchName: rider.riderProfile?.assignedBranch?.name ?? null,
      deliveries: s.totalDeliveries,
      totalEarnings: s.totalEarnings,
      pendingAmount: s.pendingAmount,
      paidAmount: s.paidAmount,
      availableBalance: s.availableBalance,
    });
  }
  return rows;
}
