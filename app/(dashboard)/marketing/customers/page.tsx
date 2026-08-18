import type { Metadata } from "next";

import { Icon } from "@/components/layout/icons";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { OrderTable } from "@/components/orders/order-table";
import { requireRole } from "@/lib/auth/session";
import { marketingDashboard } from "@/lib/services/dashboards";
import { getT } from "@/lib/i18n/server";
import type { MarketingDashboard } from "@/types";

export const metadata: Metadata = { title: "Customers" };

/**
 * /marketing/customers — customer engagement view. Uses the marketing dashboard
 * aggregates (growth counts + recent customer orders). A full customer directory
 * is not exposed to marketing by the backend, so this is a read-only summary.
 */
export default async function MarketingCustomersPage() {
  await requireRole("marketing");
  const { t, fmt } = await getT();
  const data = (await marketingDashboard()) as MarketingDashboard;

  return (
    <>
      <PageHeader title={t("pages.customersTitle")} subtitle={t("pages.customersSub")} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t("pages.totalCustomers")} value={fmt.num(data.total_customers)} icon={<Icon name="users" />} accent="brand" />
        <StatCard label={t("pages.newToday")} value={fmt.num(data.new_customers_today)} icon={<Icon name="user" />} accent="green" />
        <StatCard label={t("pages.new7d")} value={fmt.num(data.new_customers_7d)} icon={<Icon name="user" />} accent="blue" />
        <StatCard label={t("pages.new30d")} value={fmt.num(data.new_customers_30d)} icon={<Icon name="user" />} accent="violet" />
      </div>

      <Card className="mt-6">
        <CardHeader title={t("pages.recentOrders")} />
        <OrderTable orders={data.recent_orders} hrefBase={null} showBranch />
      </Card>
    </>
  );
}
