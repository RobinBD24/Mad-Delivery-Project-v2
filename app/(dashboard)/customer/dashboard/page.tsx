import type { Metadata } from "next";

import { Icon } from "@/components/layout/icons";
import { PageHeader } from "@/components/layout/page-header";
import { OrderTable } from "@/components/orders/order-table";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardContent, CardHeader, ViewAllLink } from "@/components/ui/card";
import { RankedList } from "@/components/dashboard/ranked-list";
import { EmptyState } from "@/components/ui/empty-state";
import { StatCard } from "@/components/ui/stat-card";
import { ChipRow, StatChip } from "@/components/ui/stat-chip";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { getT } from "@/lib/i18n/server";
import { customerDashboard } from "@/lib/services/dashboards";
import type { CustomerDashboard } from "@/types";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("customer.dashboardTitle") };
}

export default async function CustomerDashboardPage() {
  const user = await requireRole("customer");
  const { t, fmt } = await getT();
  const [data, completed, cancelled, coins, addressCount] = await Promise.all([
    customerDashboard(user) as Promise<CustomerDashboard>,
    prisma.order.count({ where: { customerId: user.id, status: "delivered" } }),
    prisma.order.count({ where: { customerId: user.id, status: "cancelled" } }),
    prisma.rewardLedger.aggregate({ where: { userId: user.id }, _sum: { coins: true } }),
    prisma.customerAddress.count({ where: { userId: user.id } }),
  ]);

  return (
    <>
      <PageHeader
        title={t("customer.welcome", { name: user.first_name || user.username })}
        subtitle={t("customer.welcomeSubtitle")}
        action={
          <span className="flex flex-wrap gap-2">
            {/* req #19 — a clear Order button that opens the homepage/menu ordering
                experience (nearest-branch scoping happens there). prefetch off:
                the homepage is heavy and need not be prefetched from the dashboard. */}
            <ButtonLink href="/" prefetch={false}>{t("customer.orderNow")}</ButtonLink>
            <ButtonLink href="/customer/branches" variant="outline">{t("customer.browseMenu")}</ButtonLink>
          </span>
        }
      />

      {/* Compact stat strip (mockup .chip-row) — this customer's own data only */}
      <ChipRow>
        <StatChip label={t("customer.activeOrders")} value={fmt.num(data.active_order_count)} icon={<Icon name="clock" className="size-4.5" />} accent="amber" />
        <StatChip label={t("customer.completedOrders")} value={fmt.num(completed)} icon={<Icon name="check" className="size-4.5" />} accent="green" />
        <StatChip label={t("customer.cancelledOrders")} value={fmt.num(cancelled)} icon={<Icon name="x" className="size-4.5" />} accent="red" />
        <StatChip label={t("rewards.balance")} value={fmt.num(coins._sum.coins ?? 0)} icon={<Icon name="money" className="size-4.5" />} accent="violet" />
        <StatChip label={t("customer.savedAddresses")} value={fmt.num(addressCount)} icon={<Icon name="pin" className="size-4.5" />} accent="blue" />
        <StatChip label={t("nav.restaurants")} value={fmt.num(data.branches.length)} icon={<Icon name="store" className="size-4.5" />} accent="teal" />
      </ChipRow>

      {/* Main metric cards (mockup .kpi-row) */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={t("customer.activeOrders")} value={fmt.num(data.active_order_count)} icon={<Icon name="clock" />} accent="amber" />
        <StatCard label={t("customer.totalOrders")} value={fmt.num(data.total_orders)} icon={<Icon name="bag" />} accent="brand" />
        <StatCard label={t("customer.completedOrders")} value={fmt.num(completed)} icon={<Icon name="check" />} accent="green" />
        <StatCard label={t("rewards.balance")} value={fmt.num(coins._sum.coins ?? 0)} icon={<Icon name="money" />} accent="violet" />
      </div>

      <div className="grid gap-4.5 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title={t("customer.recentOrders")}
            action={<ViewAllLink href="/customer/orders">{t("customer.allOrders")}</ViewAllLink>}
          />
          {data.recent_orders.length === 0 ? (
            <EmptyState
              title={t("customer.noOrdersYet")}
              description={t("customer.noOrdersYetDesc")}
              action={<ButtonLink href="/customer/branches">{t("customer.viewRestaurants")}</ButtonLink>}
            />
          ) : (
            <OrderTable orders={data.recent_orders} hrefBase="/customer/orders" showCustomer={false} showBranch />
          )}
        </Card>

        <Card className="h-fit">
          <CardHeader
            title={t("customer.openRestaurants")}
            action={<ViewAllLink href="/customer/branches">{t("common.viewAll")}</ViewAllLink>}
          />
          <CardContent>
            <RankedList
              emptyTitle={t("customer.noOrdersYet")}
              items={data.branches.slice(0, 5).map((branch) => ({
                key: branch.id,
                title: branch.name,
                meta: branch.address,
                visual: <Icon name="store" className="size-4" />,
                href: `/customer/branches/${branch.id}/menu`,
              }))}
            />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
