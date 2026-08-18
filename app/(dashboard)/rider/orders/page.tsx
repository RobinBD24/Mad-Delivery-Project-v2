import type { Metadata } from "next";
import Link from "next/link";

import { RiderOrderList } from "@/components/rider/rider-order-list";
import { PageHeader } from "@/components/layout/page-header";
import { Pagination } from "@/components/ui/pagination";
import { getJSON } from "@/lib/api/client";
import { requireRole } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { cn } from "@/lib/utils";
import type { Order, OrderStatus, Paginated } from "@/types";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("rider.myDeliveries") };
}

const RIDER_FILTERS: OrderStatus[] = ["ready", "picked_up", "on_the_way", "delivered"];

export default async function RiderOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const { t, fmt, locale } = await getT();
  await requireRole("rider");
  const params = await searchParams;
  const page = Number(params.page ?? "1");

  const query = new URLSearchParams();
  if (params.status) query.set("status", params.status);
  if (page > 1) query.set("page", String(page));

  const data = await getJSON<Paginated<Order>>(`/orders/?${query.toString()}`);

  const chip = (active: boolean) =>
    cn(
      "rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
      active
        ? "bg-rider-600 text-white shadow-sm"
        : "bg-surface-card text-fg-muted ring-1 ring-slate-200 hover:bg-rider-50 hover:text-rider-700",
    );

  return (
    <>
      <PageHeader
        title={t("rider.myDeliveries")}
        subtitle={t("rider.myDeliveriesSubtitle", { count: fmt.num(data.count) })}
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <Link href="/rider/orders" className={chip(!params.status)}>
          {t("common.all")}
        </Link>
        {RIDER_FILTERS.map((status) => (
          <Link key={status} href={`/rider/orders?status=${status}`} className={chip(params.status === status)}>
            {t(`orderStatus.${status}`)}
          </Link>
        ))}
      </div>

      <RiderOrderList orders={data.results} />
      <div className="mt-4">
        <Pagination count={data.count} page={page} basePath="/rider/orders" searchParams={params} locale={locale} />
      </div>
    </>
  );
}
