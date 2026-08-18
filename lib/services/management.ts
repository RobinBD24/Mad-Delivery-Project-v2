import "server-only";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { daysAgo } from "@/lib/utils/dates";

export const MANAGEMENT_REPORTS = [
  "sales",
  "orders",
  "branches",
  "riders",
  "customers",
  "products",
  "finance",
  "complaints",
  "marketing",
  "delivery",
  "attendance",
] as const;
export type ManagementReportType = (typeof MANAGEMENT_REPORTS)[number];

export interface ReportData {
  /** i18n key suffix under `mgmtReports.*` for the title. */
  key: ManagementReportType;
  columns: string[]; // i18n key suffixes under `mgmtReports.col.*`
  rows: (string | number)[][];
}

const ZERO = new Prisma.Decimal(0);
const money = (d: Prisma.Decimal) => Number(d).toFixed(2);

/** Build a management report of the given type (used by pages + CSV export). */
export async function buildReport(type: ManagementReportType): Promise<ReportData> {
  switch (type) {
    case "sales": {
      const orders = await prisma.order.findMany({
        where: { status: "delivered", createdAt: { gte: daysAgo(30) } },
        select: { createdAt: true, totalAmount: true },
      });
      const byDay = new Map<string, { orders: number; sales: Prisma.Decimal }>();
      for (const o of orders) {
        const k = o.createdAt.toISOString().slice(0, 10);
        const b = byDay.get(k) ?? { orders: 0, sales: ZERO };
        b.orders += 1;
        b.sales = b.sales.plus(o.totalAmount);
        byDay.set(k, b);
      }
      return {
        key: "sales",
        columns: ["date", "orders", "sales"],
        rows: [...byDay.entries()].sort(([a], [b]) => (a < b ? 1 : -1)).map(([d, v]) => [d, v.orders, money(v.sales)]),
      };
    }
    case "orders": {
      const grouped = await prisma.order.groupBy({ by: ["status"], _count: true });
      return {
        key: "orders",
        columns: ["status", "count"],
        rows: grouped.map((g) => [g.status, g._count]),
      };
    }
    case "branches": {
      const branches = await prisma.branch.findMany({
        include: {
          manager: true,
          _count: { select: { riders: true } },
          orders: { where: { status: "delivered" }, select: { totalAmount: true } },
        },
        orderBy: { name: "asc" },
      });
      return {
        key: "branches",
        columns: ["branch", "manager", "riders", "orders", "sales"],
        rows: branches.map((b) => [
          b.name,
          b.manager ? `${b.manager.firstName} ${b.manager.lastName}`.trim() || b.manager.username : "—",
          b._count.riders,
          b.orders.length,
          money(b.orders.reduce((a, o) => a.plus(o.totalAmount), ZERO)),
        ]),
      };
    }
    case "riders": {
      const riders = await prisma.user.findMany({
        where: { role: "rider", status: "approved" },
        include: {
          deliveries: { where: { status: "delivered" }, select: { id: true } },
          commissions: { select: { amount: true } },
          riderReviewsReceived: { select: { rating: true } },
        },
        orderBy: { firstName: "asc" },
      });
      return {
        key: "riders",
        columns: ["rider", "deliveries", "earnings", "rating"],
        rows: riders.map((r) => {
          const ratings = r.riderReviewsReceived;
          const avg = ratings.length ? (ratings.reduce((a, x) => a + x.rating, 0) / ratings.length).toFixed(1) : "—";
          return [
            `${r.firstName} ${r.lastName}`.trim() || r.username,
            r.deliveries.length,
            money(r.commissions.reduce((a, c) => a.plus(c.amount), ZERO)),
            avg,
          ];
        }),
      };
    }
    case "customers": {
      const customers = await prisma.user.findMany({
        where: { role: "customer" },
        select: { dateJoined: true },
      });
      const byDay = new Map<string, number>();
      for (const c of customers) {
        const k = c.dateJoined.toISOString().slice(0, 10);
        byDay.set(k, (byDay.get(k) ?? 0) + 1);
      }
      return {
        key: "customers",
        columns: ["date", "newCustomers"],
        rows: [...byDay.entries()].sort(([a], [b]) => (a < b ? 1 : -1)).map(([d, n]) => [d, n]),
      };
    }
    case "products": {
      const items = await prisma.orderItem.findMany({
        where: { order: { status: "delivered" } },
        include: { product: true },
      });
      const byProduct = new Map<string, { qty: number; revenue: Prisma.Decimal }>();
      for (const i of items) {
        const name = i.product?.name ?? `#${i.productId}`;
        const b = byProduct.get(name) ?? { qty: 0, revenue: ZERO };
        b.qty += i.quantity;
        b.revenue = b.revenue.plus(i.unitPrice.mul(i.quantity));
        byProduct.set(name, b);
      }
      return {
        key: "products",
        columns: ["product", "qtySold", "revenue"],
        rows: [...byProduct.entries()]
          .sort((a, b) => b[1].qty - a[1].qty)
          .map(([name, v]) => [name, v.qty, money(v.revenue)]),
      };
    }
    case "finance": {
      const [orders, commissions, expenses, refunds] = await Promise.all([
        prisma.order.findMany({ where: { status: "delivered" }, select: { totalAmount: true } }),
        prisma.riderCommission.findMany({ select: { amount: true } }),
        prisma.branchExpense.findMany({ select: { amount: true } }),
        prisma.refund.findMany({ select: { amount: true } }),
      ]);
      const sales = orders.reduce((a, o) => a.plus(o.totalAmount), ZERO);
      const comm = commissions.reduce((a, c) => a.plus(c.amount), ZERO);
      const exp = expenses.reduce((a, e) => a.plus(e.amount), ZERO);
      const ref = refunds.reduce((a, r) => a.plus(r.amount), ZERO);
      const net = sales.minus(comm).minus(exp).minus(ref);
      return {
        key: "finance",
        columns: ["metric", "amount"],
        rows: [
          ["totalSales", money(sales)],
          ["riderCommission", money(comm)],
          ["expenses", money(exp)],
          ["refunds", money(ref)],
          ["netRevenue", money(net)],
        ],
      };
    }
    case "complaints": {
      const grouped = await prisma.complaint.groupBy({ by: ["status", "recipientRole"], _count: true });
      return {
        key: "complaints",
        columns: ["recipient", "status", "count"],
        rows: grouped.map((g) => [g.recipientRole, g.status, g._count]),
      };
    }
    case "marketing": {
      const coupons = await prisma.coupon.findMany({ orderBy: { usedCount: "desc" } });
      return {
        key: "marketing",
        columns: ["coupon", "type", "redemptions", "maxUses"],
        rows: coupons.map((c) => [
          c.code,
          c.discountType,
          c.usedCount,
          c.maxUses === 0 ? "∞" : c.maxUses,
        ]),
      };
    }
    case "delivery": {
      const branches = await prisma.branch.findMany({
        include: {
          orders: { where: { status: "delivered" }, select: { createdAt: true, updatedAt: true } },
        },
        orderBy: { name: "asc" },
      });
      return {
        key: "delivery",
        columns: ["branch", "deliveries", "avgMinutes"],
        rows: branches.map((b) => {
          const times = b.orders.map((o) => (o.updatedAt.getTime() - o.createdAt.getTime()) / 60000);
          const avg = times.length ? Math.round(times.reduce((a, x) => a + x, 0) / times.length) : 0;
          return [b.name, b.orders.length, avg];
        }),
      };
    }
    case "attendance": {
      const duties = await prisma.riderDutyLog.findMany({
        where: { date: { gte: daysAgo(30) } },
        include: { rider: true },
      });
      const byRider = new Map<string, number>();
      for (const d of duties) {
        const name = `${d.rider.firstName} ${d.rider.lastName}`.trim() || d.rider.username;
        byRider.set(name, (byRider.get(name) ?? 0) + 1);
      }
      return {
        key: "attendance",
        columns: ["rider", "dutyDays"],
        rows: [...byRider.entries()].sort((a, b) => b[1] - a[1]).map(([name, n]) => [name, n]),
      };
    }
  }
}

/** Render a report as CSV text. */
export function reportToCsv(report: ReportData, columnLabels: string[]): string {
  const escape = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = columnLabels.map(escape).join(",");
  const body = report.rows.map((r) => r.map(escape).join(",")).join("\n");
  return `${header}\n${body}\n`;
}
