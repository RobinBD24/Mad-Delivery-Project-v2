import "server-only";
import { Prisma } from "@prisma/client";
import type { User } from "@prisma/client";

import { prisma } from "@/lib/db";
import { notFound, sk, validationError } from "@/lib/http/errors";
import { createNotification, notifySuperAdmins } from "@/lib/services/notifications";

export const EXPENSE_CATEGORIES = [
  "rent",
  "utilities",
  "salary",
  "maintenance",
  "inventory",
  "delivery",
  "other",
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

const ZERO = new Prisma.Decimal(0);

function audit(actorId: number, action: string, entity: string, entityId: number | string, detail: string) {
  return prisma.financialAuditLog.create({
    data: { actorId, action, entity, entityId: String(entityId), detail },
  });
}

/** Process a customer refund (per super-admin policy) and notify the customer. */
export async function processRefund(actor: User, orderId: number, amountRaw: string, reason: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw notFound(sk("errors.money.orderNotFound"));
  const amount = Number(amountRaw);
  if (!amountRaw || Number.isNaN(amount) || amount <= 0) {
    throw validationError({ amount: sk("errors.money.enterValidAmount") });
  }
  const already = await prisma.refund.aggregate({ where: { orderId }, _sum: { amount: true } });
  const refunded = already._sum.amount ?? ZERO;
  if (new Prisma.Decimal(amountRaw).plus(refunded).greaterThan(order.totalAmount)) {
    throw validationError({
      amount: sk("errors.money.refundExceedsOrderTotal", { amount: order.totalAmount.minus(refunded).toFixed(2) }),
    });
  }
  if (!reason.trim()) throw validationError({ reason: sk("errors.money.enterRefundReason") });

  const refund = await prisma.refund.create({
    data: {
      orderId,
      amount: new Prisma.Decimal(amountRaw),
      reason: reason.trim(),
      processedById: actor.id,
    },
    include: { order: true, processedBy: true },
  });
  await audit(actor.id, "refund_processed", "Refund", refund.id, `Order #${orderId} → ৳${amount.toFixed(2)}`);
  await createNotification(order.customerId, {
    type: "payment",
    titleKey: "notifications.refund.processed.title",
    bodyKey: "notifications.refund.processed.body",
    params: { id: orderId, amount: amount.toFixed(2) },
    link: `/customer/orders/${orderId}`,
  });
  // Financial oversight: super admins are told about every refund.
  await notifySuperAdmins({
    type: "payment",
    titleKey: "notifications.refund.recorded.title",
    bodyKey: "notifications.refund.recorded.body",
    params: { id: orderId, amount: amount.toFixed(2) },
    link: `/admin/orders/${orderId}`,
  });
  return refund;
}

/** Record a branch expense. */
export async function recordExpense(
  actor: User,
  input: { branchId: number; category: string; amount: string; note: string; expenseDate: string },
) {
  if (!EXPENSE_CATEGORIES.includes(input.category as ExpenseCategory)) {
    throw validationError({ category: sk("errors.money.selectValidExpenseCategory") });
  }
  const amount = Number(input.amount);
  if (!input.amount || Number.isNaN(amount) || amount <= 0) {
    throw validationError({ amount: sk("errors.money.enterValidAmount") });
  }
  const date = new Date(`${input.expenseDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) throw validationError({ expense_date: sk("errors.money.enterValidDate") });
  const branch = await prisma.branch.findUnique({ where: { id: input.branchId } });
  if (!branch) throw validationError({ branch_id: sk("errors.money.selectBranch") });

  const expense = await prisma.branchExpense.create({
    data: {
      branchId: branch.id,
      category: input.category,
      amount: new Prisma.Decimal(input.amount),
      note: input.note.trim(),
      expenseDate: date,
      createdById: actor.id,
    },
    include: { branch: true, createdBy: true },
  });
  await audit(actor.id, "expense_recorded", "BranchExpense", expense.id, `${branch.name} · ${input.category} · ৳${amount.toFixed(2)}`);
  return expense;
}

/** Record a manual financial adjustment (credit/debit). */
export async function recordAdjustment(
  actor: User,
  input: { type: string; amount: string; note: string; branchId?: number | null },
) {
  if (input.type !== "credit" && input.type !== "debit") {
    throw validationError({ type: sk("errors.money.selectCreditOrDebit") });
  }
  const amount = Number(input.amount);
  if (!input.amount || Number.isNaN(amount) || amount <= 0) {
    throw validationError({ amount: sk("errors.money.enterValidAmount") });
  }
  if (!input.note.trim()) throw validationError({ note: sk("errors.money.enterAdjustmentReason") });

  const adjustment = await prisma.financialAdjustment.create({
    data: {
      type: input.type,
      amount: new Prisma.Decimal(input.amount),
      note: input.note.trim(),
      branchId: input.branchId ?? null,
      createdById: actor.id,
    },
    include: { branch: true, createdBy: true },
  });
  await audit(actor.id, "adjustment_recorded", "FinancialAdjustment", adjustment.id, `${input.type} ৳${amount.toFixed(2)} — ${input.note.trim()}`);
  return adjustment;
}

/** Generate (or regenerate) the end-of-day settlement for a branch+date. */
export async function generateSettlement(actor: User, branchId: number, dateStr: string) {
  const branch = await prisma.branch.findUnique({ where: { id: branchId } });
  if (!branch) throw validationError({ branch_id: sk("errors.money.selectBranch") });
  const date = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(date.getTime())) throw validationError({ date: sk("errors.money.enterValidDate") });
  const next = new Date(date);
  next.setDate(next.getDate() + 1);

  const [orders, commissions, expenses] = await Promise.all([
    prisma.order.findMany({
      where: { branchId, status: "delivered", createdAt: { gte: date, lt: next } },
      select: { totalAmount: true },
    }),
    prisma.riderCommission.findMany({
      where: { branchId, createdAt: { gte: date, lt: next } },
      select: { amount: true },
    }),
    prisma.branchExpense.findMany({
      where: { branchId, expenseDate: { gte: date, lt: next } },
      select: { amount: true },
    }),
  ]);

  const sales = orders.reduce((a, o) => a.plus(o.totalAmount), ZERO);
  const commission = commissions.reduce((a, c) => a.plus(c.amount), ZERO);
  const expenseSum = expenses.reduce((a, e) => a.plus(e.amount), ZERO);
  const net = sales.minus(commission).minus(expenseSum);

  const settlement = await prisma.branchSettlement.upsert({
    where: { branchId_date: { branchId, date } },
    update: { orders: orders.length, sales, commission, expenses: expenseSum, net, generatedById: actor.id },
    create: {
      branchId,
      date,
      orders: orders.length,
      sales,
      commission,
      expenses: expenseSum,
      net,
      generatedById: actor.id,
    },
    include: { branch: true, generatedBy: true },
  });
  await audit(actor.id, "settlement_generated", "BranchSettlement", settlement.id, `${branch.name} · ${dateStr} · net ৳${net.toFixed(2)}`);
  return settlement;
}
