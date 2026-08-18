import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { RiderOrderList } from "@/components/rider/rider-order-list";
import { getJSON } from "@/lib/api/client";
import { requireRole } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import type { Order, Paginated } from "@/types";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("rider.newOrdersTitle") };
}

/** /rider/new-orders — orders assigned to this rider that are ready for pickup. */
export default async function RiderNewOrdersPage() {
  const { t } = await getT();
  await requireRole("rider");
  const data = await getJSON<Paginated<Order>>("/orders/?status=ready&page_size=50");

  return (
    <>
      <PageHeader title={t("rider.newOrdersTitle")} subtitle={t("rider.newOrdersSub")} />
      <RiderOrderList orders={data.results} />
    </>
  );
}
