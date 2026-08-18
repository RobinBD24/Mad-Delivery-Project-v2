import type { Metadata } from "next";

import { Icon } from "@/components/layout/icons";
import { PageHeader } from "@/components/layout/page-header";
import { RiderOrderList } from "@/components/rider/rider-order-list";
import { StatCard } from "@/components/ui/stat-card";
import { getJSON } from "@/lib/api/client";
import { requireRole } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import type { Order, Paginated, WalletSummaryT } from "@/types";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("rider.orderHistoryTitle") };
}

/** /rider/order-history — the rider's completed deliveries + an earnings summary. */
export default async function RiderOrderHistoryPage() {
  const { t, fmt } = await getT();
  await requireRole("rider");
  const [data, wallet] = await Promise.all([
    getJSON<Paginated<Order>>("/orders/?status=delivered&page_size=50"),
    getJSON<WalletSummaryT>("/rider/wallet/"),
  ]);
  const delivered = data.count;

  return (
    <>
      <PageHeader title={t("rider.orderHistoryTitle")} subtitle={t("rider.orderHistorySub")} />
      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <StatCard label={t("rider.deliveredOrders")} value={fmt.num(delivered)} icon={<Icon name="check" />} accent="green" />
        <StatCard label={t("wallet.totalEarnings")} value={fmt.money(wallet.total_earnings)} icon={<Icon name="money" />} accent="brand" />
      </div>
      <RiderOrderList orders={data.results} />
    </>
  );
}
