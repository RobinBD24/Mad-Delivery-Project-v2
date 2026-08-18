import type { Metadata } from "next";

import { OrderStatusBadge } from "@/components/ui/badge";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatCard } from "@/components/ui/stat-card";
import { Icon } from "@/components/layout/icons";
import { Table, Td } from "@/components/ui/table";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import type { OrderStatus } from "@/types";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("adminReports.ordersTitle") };
}

/** /admin/reports/orders — today's order report with status breakdown. */
export default async function AdminOrdersReportPage() {
  const { t, fmt } = await getT();
  await requireRole("super_admin");

  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const orders = await prisma.order.findMany({
    where: { createdAt: { gte: start } },
    include: { branch: true, customer: true },
    orderBy: { createdAt: "desc" },
  });

  const delivered = orders.filter((o) => o.status === "delivered").length;
  const cancelled = orders.filter((o) => o.status === "cancelled").length;
  const active = orders.length - delivered - cancelled;

  return (
    <>
      <PageHeader title={t("adminReports.ordersTitle")} subtitle={t("adminReports.ordersSub")} />

      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard label={t("adminReports.todayOrders")} value={fmt.num(orders.length)} icon={<Icon name="bag" />} accent="brand" />
        <StatCard label={t("adminReports.active")} value={fmt.num(active)} icon={<Icon name="clock" />} accent="amber" />
        <StatCard label={t("adminReports.deliveredOrders")} value={fmt.num(delivered)} icon={<Icon name="check" />} accent="green" />
        <StatCard label={t("adminReports.cancelled")} value={fmt.num(cancelled)} icon={<Icon name="x" />} accent="slate" />
      </div>

      <Card className="mt-6">
        {orders.length === 0 ? (
          <EmptyState title={t("adminReports.noOrdersToday")} />
        ) : (
          <Table headers={["#", t("adminExtras.colCustomer"), t("pages.colBranch"), t("pages.colStatus"), t("pages.colAmount"), t("pages.colDate")]}>
            {orders.map((o) => (
              <tr key={o.id} className="hover:bg-surface-hover/70">
                <Td><span className="font-semibold text-fg-base">#{fmt.num(o.id)}</span></Td>
                <Td>{`${o.customer.firstName} ${o.customer.lastName}`.trim() || o.customer.username}</Td>
                <Td>{o.branch.name}</Td>
                <Td><OrderStatusBadge status={o.status as OrderStatus} /></Td>
                <Td><span className="font-semibold">{fmt.money(o.totalAmount.toString())}</span></Td>
                <Td><span className="text-xs text-fg-muted">{fmt.time(o.createdAt.toISOString())}</span></Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
