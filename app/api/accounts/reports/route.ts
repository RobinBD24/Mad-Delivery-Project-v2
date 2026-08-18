import { Prisma } from "@prisma/client";

import { requireApiRole } from "@/lib/auth/current-user";
import { handle } from "@/lib/http/errors";
import { json } from "@/lib/http/respond";
import { prisma } from "@/lib/db";

const ZERO = new Prisma.Decimal(0);

type PeriodKind = "daily" | "weekly" | "monthly" | "yearly";

/** Bucket key for a date under the chosen period granularity. */
function periodKey(d: Date, kind: PeriodKind): string {
  const iso = d.toISOString();
  if (kind === "daily") return iso.slice(0, 10); // YYYY-MM-DD
  if (kind === "monthly") return iso.slice(0, 7); // YYYY-MM
  if (kind === "yearly") return iso.slice(0, 4); // YYYY
  // ISO week: YYYY-Www
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

// GET /api/accounts/reports?period=daily|weekly|monthly&days=30
// Period rows (orders, sales, rider commission, withdrawals paid) + totals.
export const GET = handle(async (req: Request) => {
  await requireApiRole("accounts", "super_admin", "management");
  const url = new URL(req.url);
  const period = (url.searchParams.get("period") ?? "daily") as PeriodKind;
  const kind: PeriodKind = ["daily", "weekly", "monthly", "yearly"].includes(period) ? period : "daily";
  const defaultDays = kind === "daily" ? 30 : kind === "weekly" ? 84 : kind === "monthly" ? 365 : 1095;
  const days = Math.min(Math.max(Number(url.searchParams.get("days")) || defaultDays, 1), 1825);
  const since = new Date(Date.now() - days * 86400000);

  const [orders, commissions, paid, expenses] = await Promise.all([
    prisma.order.findMany({
      where: { status: "delivered", createdAt: { gte: since } },
      select: { createdAt: true, totalAmount: true },
    }),
    prisma.riderCommission.findMany({
      where: { createdAt: { gte: since } },
      select: { createdAt: true, amount: true },
    }),
    prisma.riderWithdrawal.findMany({
      where: { status: "paid", paidAt: { gte: since } },
      select: { paidAt: true, amount: true },
    }),
    prisma.branchExpense.findMany({
      where: { expenseDate: { gte: since } },
      select: { amount: true },
    }),
  ]);

  const rows = new Map<
    string,
    { orders: number; sales: Prisma.Decimal; commission: Prisma.Decimal; paidOut: Prisma.Decimal }
  >();
  const bucket = (key: string) => {
    const existing = rows.get(key);
    if (existing) return existing;
    const fresh = { orders: 0, sales: ZERO, commission: ZERO, paidOut: ZERO };
    rows.set(key, fresh);
    return fresh;
  };

  for (const o of orders) {
    const b = bucket(periodKey(o.createdAt, kind));
    b.orders += 1;
    b.sales = b.sales.plus(o.totalAmount);
  }
  for (const c of commissions) {
    const b = bucket(periodKey(c.createdAt, kind));
    b.commission = b.commission.plus(c.amount);
  }
  for (const w of paid) {
    if (!w.paidAt) continue;
    const b = bucket(periodKey(w.paidAt, kind));
    b.paidOut = b.paidOut.plus(w.amount);
  }

  const results = [...rows.entries()]
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([label, v]) => ({
      label,
      orders: v.orders,
      sales: v.sales.toFixed(2),
      commission: v.commission.toFixed(2),
      withdrawals_paid: v.paidOut.toFixed(2),
    }));

  const totalSales = orders.reduce((acc, o) => acc.plus(o.totalAmount), ZERO);
  const totalCommission = commissions.reduce((acc, c) => acc.plus(c.amount), ZERO);
  const totalPaid = paid.reduce((acc, w) => acc.plus(w.amount), ZERO);
  const totalExpenses = expenses.reduce((acc, e) => acc.plus(e.amount), ZERO);

  return json({
    period: kind,
    days,
    totals: {
      orders: orders.length,
      sales: totalSales.toFixed(2),
      commission: totalCommission.toFixed(2),
      withdrawals_paid: totalPaid.toFixed(2),
      expenses: totalExpenses.toFixed(2),
      net_after_commission: totalSales.minus(totalCommission).toFixed(2),
      net_revenue: totalSales.minus(totalCommission).minus(totalExpenses).toFixed(2),
    },
    results,
  });
});
