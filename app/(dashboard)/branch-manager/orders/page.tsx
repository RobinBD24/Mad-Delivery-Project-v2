import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/layout/page-header";
import { OrderSoundAlert } from "@/components/branch/order-sound-alert";
import { FilterBar } from "@/components/dashboard/filter-bar";
import { SummaryCard, SummaryCardGrid } from "@/components/dashboard/summary-card";
import { Icon } from "@/components/layout/icons";
import { OrderTable } from "@/components/orders/order-table";
import { Card } from "@/components/ui/card";
import { Pagination } from "@/components/ui/pagination";
import { getJSON } from "@/lib/api/client";
import { requireRole } from "@/lib/auth/session";
import { ORDER_STATUS_LABELS } from "@/lib/constants";
import { getT } from "@/lib/i18n/server";
import { getOrderListSummary } from "@/lib/services/page-summaries";
import { cn } from "@/lib/utils";
import type { Order, OrderStatus, Paginated } from "@/types";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("branchManager.ordersTitle") };
}

export default async function BMOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; search?: string; page?: string }>;
}) {
  const { t, locale } = await getT();
  const me = await requireRole("branch_manager");
  const params = await searchParams;
  const page = Number(params.page ?? "1");

  const query = new URLSearchParams();
  if (params.status) query.set("status", params.status);
  if (params.search) query.set("search", params.search);
  if (page > 1) query.set("page", String(page));

  const [data, summary] = await Promise.all([
    getJSON<Paginated<Order>>(`/orders/?${query.toString()}`),
    getOrderListSummary(me),
  ]);

  const chip = (active: boolean) =>
    cn(
      "inline-flex min-h-10 items-center rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
      active ? "bg-brand-500 text-white" : "bg-surface-card text-fg-muted ring-1 ring-slate-200 hover:bg-surface-hover",
    );

  return (
    <>
      <PageHeader
        title={t("branchManager.ordersTitle")}
        subtitle={t("branchManager.ordersSubtitle")}
        action={<OrderSoundAlert initialCount={summary.pending} />}
      />
      <SummaryCardGrid className="mb-5">
        <SummaryCard
          title={t("branchManager.totalOrders")}
          value={summary.total}
          icon={<Icon name="bag" />}
          href="/branch-manager/orders"
          testId="orders-total-card"
        />
        <SummaryCard
          title={t("orderStatus.pending")}
          value={summary.pending}
          icon={<Icon name="clock" />}
          accent="warning"
          href="/branch-manager/orders?status=pending"
          testId="orders-pending-card"
        />
        <SummaryCard
          title={t("orderStatus.preparing")}
          value={summary.preparing}
          icon={<Icon name="kitchen-set" />}
          accent="info"
          href="/branch-manager/orders?status=preparing"
        />
        <SummaryCard
          title={t("orderStatus.delivered")}
          value={summary.delivered}
          icon={<Icon name="check" />}
          accent="success"
          href="/branch-manager/orders?status=delivered"
        />
      </SummaryCardGrid>

      <FilterBar
        className="mb-4"
        search={
          <form action="/branch-manager/orders" method="get" noValidate>
            {params.status ? <input type="hidden" name="status" value={params.status} /> : null}
            <input
              name="search"
              defaultValue={params.search}
              placeholder={t("branchManager.searchPlaceholder")}
              aria-label={t("branchManager.searchPlaceholder")}
              className="min-h-10 w-full rounded-xl border border-border-strong bg-surface-card px-4 py-2.5 text-sm placeholder:text-fg-subtle focus:border-brand-500 focus:outline-2 focus:outline-brand-500/20"
            />
          </form>
        }
        filters={
          <>
            <Link href="/branch-manager/orders" className={chip(!params.status)}>
              {t("common.all")}
            </Link>
            {(Object.keys(ORDER_STATUS_LABELS) as OrderStatus[]).map((status) => (
              <Link
                key={status}
                href={`/branch-manager/orders?status=${status}`}
                className={chip(params.status === status)}
              >
                {t(`orderStatus.${status}`)}
              </Link>
            ))}
          </>
        }
      />

      <Card>
        <OrderTable orders={data.results} hrefBase="/branch-manager/orders" />
        <Pagination
          count={data.count}
          page={page}
          basePath="/branch-manager/orders"
          searchParams={params}
          locale={locale}
        />
      </Card>
    </>
  );
}
