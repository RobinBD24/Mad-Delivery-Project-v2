import type { Metadata } from "next";
import Link from "next/link";

import { Icon } from "@/components/layout/icons";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatCard } from "@/components/ui/stat-card";
import { Table, Td } from "@/components/ui/table";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { cn } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("adminReports.salesTitle") };
}

const RANGES = { today: 1, week: 7, month: 30 } as const;
type RangeKey = keyof typeof RANGES;

type Params = { searchParams: Promise<{ range?: string }> };

/** /admin/reports/sales — sales totals, per-branch and top products. */
export default async function AdminSalesReportPage({ searchParams }: Params) {
  const { t, fmt } = await getT();
  await requireRole("super_admin");
  const sp = await searchParams;
  const range: RangeKey = (Object.keys(RANGES) as RangeKey[]).includes(sp.range as RangeKey)
    ? (sp.range as RangeKey)
    : "today";
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  if (range !== "today") since.setDate(since.getDate() - RANGES[range] + 1);

  const delivered = await prisma.order.findMany({
    where: { status: "delivered", createdAt: { gte: since } },
    include: { branch: true, items: { include: { product: true } } },
  });

  const totalSales = delivered.reduce((acc, o) => acc + Number(o.totalAmount), 0);

  const byBranch = new Map<string, { orders: number; sales: number }>();
  const byProduct = new Map<string, { qty: number; revenue: number }>();
  for (const o of delivered) {
    const b = byBranch.get(o.branch.name) ?? { orders: 0, sales: 0 };
    b.orders += 1;
    b.sales += Number(o.totalAmount);
    byBranch.set(o.branch.name, b);
    for (const item of o.items) {
      const key = item.product?.name ?? `#${item.productId}`;
      const p = byProduct.get(key) ?? { qty: 0, revenue: 0 };
      p.qty += item.quantity;
      p.revenue += Number(item.unitPrice) * item.quantity;
      byProduct.set(key, p);
    }
  }
  const topProducts = [...byProduct.entries()].sort((a, b) => b[1].qty - a[1].qty).slice(0, 10);

  const tab = "rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors";

  return (
    <>
      <PageHeader
        title={t("adminReports.salesTitle")}
        subtitle={t("adminReports.salesSub")}
        action={
          <div className="flex items-center gap-1.5 rounded-full bg-surface-muted p-1">
            {(Object.keys(RANGES) as RangeKey[]).map((r) => (
              <Link
                key={r}
                href={`/admin/reports/sales?range=${r}`}
                className={cn(tab, range === r ? "bg-surface-card text-brand-600 shadow-sm" : "text-fg-muted")}
              >
                {t(`adminReports.range_${r}`)}
              </Link>
            ))}
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label={t("adminReports.totalSales")} value={fmt.money(totalSales)} icon={<Icon name="money" />} accent="green" />
        <StatCard label={t("adminReports.deliveredOrders")} value={fmt.num(delivered.length)} icon={<Icon name="check" />} accent="blue" />
        <StatCard
          label={t("adminReports.avgOrderValue")}
          value={fmt.money(delivered.length ? totalSales / delivered.length : 0)}
          icon={<Icon name="chart" />}
          accent="brand"
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title={t("adminReports.byBranch")} />
          {byBranch.size === 0 ? (
            <EmptyState title={t("pages.noData")} />
          ) : (
            <Table headers={[t("pages.colBranch"), t("accounts.colOrders"), t("accounts.colSales")]}>
              {[...byBranch.entries()].map(([name, v]) => (
                <tr key={name} className="hover:bg-surface-hover/70">
                  <Td><span className="font-medium text-fg-base">{name}</span></Td>
                  <Td>{fmt.num(v.orders)}</Td>
                  <Td><span className="font-semibold">{fmt.money(v.sales)}</span></Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>

        <Card>
          <CardHeader title={t("adminReports.topProducts")} />
          {topProducts.length === 0 ? (
            <EmptyState title={t("pages.noData")} />
          ) : (
            <Table headers={[t("adminExtras.colProduct"), t("adminReports.qtySold"), t("adminReports.revenue")]}>
              {topProducts.map(([name, v]) => (
                <tr key={name} className="hover:bg-surface-hover/70">
                  <Td><span className="font-medium text-fg-base">{name}</span></Td>
                  <Td>{fmt.num(v.qty)}</Td>
                  <Td><span className="font-semibold">{fmt.money(v.revenue)}</span></Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
