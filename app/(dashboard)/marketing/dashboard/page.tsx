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
import { Table, Td } from "@/components/ui/table";
import { requireRole } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { marketingDashboard } from "@/lib/services/dashboards";
import type { MarketingDashboard } from "@/types";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("marketing.title") };
}


export default async function MarketingDashboardPage() {
  const { t, fmt } = await getT();
  await requireRole("marketing");
  const data = (await marketingDashboard()) as MarketingDashboard;

  return (
    <>
      <PageHeader title={t("marketing.title")} subtitle={t("marketing.subtitle")} />

      {/* Compact stat strip (mockup .chip-row) */}
      <ChipRow>
        <StatChip label={t("marketing.chipNewToday")} value={fmt.num(data.new_customers_today)} icon={<Icon name="user" className="size-4.5" />} accent="green" />
        <StatChip label={t("marketing.chipNew7d")} value={fmt.num(data.new_customers_7d)} icon={<Icon name="user" className="size-4.5" />} accent="blue" />
        <StatChip label={t("marketing.chipNew30d")} value={fmt.num(data.new_customers_30d)} icon={<Icon name="chart" className="size-4.5" />} accent="violet" />
        <StatChip label={t("marketing.totalOrders")} value={fmt.num(data.total_orders)} icon={<Icon name="bag" className="size-4.5" />} accent="amber" />
        <StatChip label={t("marketing.activeBranches")} value={fmt.num(data.active_branches)} icon={<Icon name="store" className="size-4.5" />} accent="teal" />
        <StatChip label={t("marketing.popularCount")} value={fmt.num(data.popular_products.length)} icon={<Icon name="grid" className="size-4.5" />} accent="brand" />
      </ChipRow>

      {/* Main metric cards (mockup .kpi-row) */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={t("marketing.totalCustomers")} value={fmt.num(data.total_customers)} icon={<Icon name="users" />} accent="brand" />
        <StatCard label={t("marketing.newCustomers30d")} value={fmt.num(data.new_customers_30d)} icon={<Icon name="chart" />} accent="violet" />
        <StatCard label={t("marketing.totalOrders")} value={fmt.num(data.total_orders)} icon={<Icon name="bag" />} accent="blue" />
        <StatCard label={t("marketing.activeBranches")} value={fmt.num(data.active_branches)} icon={<Icon name="store" />} accent="green" />
      </div>

      <div className="grid gap-4.5 lg:grid-cols-2">
        <Card>
          <CardHeader
            title={t("marketing.popularProducts")}
            subtitle={t("marketing.popularProductsSubtitle")}
            action={<ViewAllLink href="/marketing/products">{t("common.viewAll")}</ViewAllLink>}
          />
          <CardContent>
            <RankedList
              emptyTitle={t("marketing.noOrderDataYet")}
              items={data.popular_products.map((item) => ({
                key: item.product__id,
                title: item.product__name,
                meta: `${fmt.num(item.order_count)} ${t("marketing.timesOrdered")}`,
                value: fmt.money(item.revenue),
                visual: <Icon name="grid" className="size-4" />,
              }))}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader title={t("marketing.topCategories")} subtitle={t("marketing.topCategoriesSubtitle")} />
          {data.top_categories.length === 0 ? (
            <EmptyState title={t("marketing.noSalesYet")} />
          ) : (
            <Table headers={[t("marketing.colCategory"), t("marketing.colOrders"), t("marketing.colQuantity")]}>
              {data.top_categories.map((row) => (
                <tr key={row.product__category__id} className="hover:bg-surface-hover/70">
                  <Td><span className="font-medium text-fg-base">{row.product__category__name}</span></Td>
                  <Td>{fmt.num(row.order_count)}</Td>
                  <Td>{fmt.num(row.quantity)}</Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader
          title={t("marketing.recentOrders")}
          subtitle={t("marketing.recentOrdersSubtitle")}
          action={<ViewAllLink href="/marketing/reports">{t("common.viewAll")}</ViewAllLink>}
        />
        {data.recent_orders.length === 0 ? (
          <EmptyState title={t("marketing.noOrdersYet")} />
        ) : (
          <OrderTable orders={data.recent_orders} hrefBase="/customer/orders" showBranch />
        )}
      </Card>

      <Card className="mt-6">
        <CardHeader title={t("marketing.campaignsCoupons")} />
        <CardContent className="flex flex-wrap gap-3">
          <ButtonLink href="/marketing/campaigns" variant="outline">
            <Icon name="bag" className="size-4" /> {t("nav.campaigns")}
          </ButtonLink>
          <ButtonLink href="/marketing/coupons" variant="outline">
            <Icon name="money" className="size-4" /> {t("nav.coupons")}
          </ButtonLink>
          <ButtonLink href="/marketing/audience" variant="outline">
            <Icon name="users" className="size-4" /> {t("nav.audience")}
          </ButtonLink>
          <ButtonLink href="/marketing/performance" variant="outline">
            <Icon name="chart" className="size-4" /> {t("nav.performance")}
          </ButtonLink>
        </CardContent>
      </Card>
    </>
  );
}
