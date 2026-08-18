import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/layout/page-header";
import { FilterBar } from "@/components/dashboard/filter-bar";
import { SummaryCard, SummaryCardGrid } from "@/components/dashboard/summary-card";
import { Icon } from "@/components/layout/icons";
import { OrderTable } from "@/components/orders/order-table";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Pagination } from "@/components/ui/pagination";
import { getJSON } from "@/lib/api/client";
import { requireRole } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { getOrderListSummary } from "@/lib/services/page-summaries";
import { cn } from "@/lib/utils";
import type { Order, OrderStatus, Paginated } from "@/types";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("customer.ordersTitle") };
}

const CUSTOMER_FILTERS: OrderStatus[] = ["pending", "preparing", "on_the_way", "delivered", "cancelled"];

export default async function CustomerOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const me = await requireRole("customer");
  const { t, locale } = await getT();
  const params = await searchParams;
  const page = Number(params.page ?? "1");

  const query = new URLSearchParams();
  if (params.status) query.set("status", params.status);
  if (page > 1) query.set("page", String(page));

  const [data, summary] = await Promise.all([
    getJSON<Paginated<Order>>(`/orders/?${query.toString()}`),
    getOrderListSummary(me),
  ]);
  const activeOrders =
    summary.pending +
    summary.accepted +
    summary.preparing +
    summary.ready +
    summary.picked_up +
    summary.on_the_way;

  const chip = (active: boolean) =>
    cn(
      "inline-flex min-h-10 items-center rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
      active ? "bg-brand-500 text-white" : "bg-surface-card text-fg-muted ring-1 ring-slate-200 hover:bg-surface-hover",
    );

  return (
    <>
      <PageHeader
        title={t("customer.ordersTitle")}
        subtitle={t("customer.ordersSubtitle")}
        action={<ButtonLink href="/customer/branches">{t("customer.newOrder")}</ButtonLink>}
      />
      <SummaryCardGrid className="mb-5">
        <SummaryCard
          title={t("customer.totalOrders")}
          value={summary.total}
          icon={<Icon name="bag" />}
          href="/customer/orders"
          testId="orders-total-card"
        />
        <SummaryCard
          title={t("customer.activeOrders")}
          value={activeOrders}
          icon={<Icon name="clock" />}
          accent="info"
        />
        <SummaryCard
          title={t("orderStatus.delivered")}
          value={summary.delivered}
          icon={<Icon name="check" />}
          accent="success"
          href="/customer/orders?status=delivered"
        />
        <SummaryCard
          title={t("orderStatus.cancelled")}
          value={summary.cancelled}
          icon={<Icon name="x" />}
          accent="danger"
          href="/customer/orders?status=cancelled"
        />
      </SummaryCardGrid>

      <FilterBar
        className="mb-4"
        filters={
          <>
            <Link href="/customer/orders" className={chip(!params.status)}>{t("common.all")}</Link>
            {CUSTOMER_FILTERS.map((status) => (
              <Link key={status} href={`/customer/orders?status=${status}`} className={chip(params.status === status)}>
                {t(`orderStatus.${status}`)}
              </Link>
            ))}
          </>
        }
      />

      <Card>
        <OrderTable orders={data.results} hrefBase="/customer/orders" showCustomer={false} showBranch />
        <Pagination count={data.count} page={page} basePath="/customer/orders" searchParams={params} locale={locale} />
      </Card>
    </>
  );
}
