import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { RiderOrderList } from "@/components/rider/rider-order-list";
import { requireRole } from "@/lib/auth/session";
import { riderDashboard } from "@/lib/services/dashboards";
import { getT } from "@/lib/i18n/server";
import type { RiderDashboard } from "@/types";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("rider.deliveriesTitle") };
}

/** /rider/deliveries — the rider's active (in-progress) deliveries. */
export default async function RiderDeliveriesPage() {
  const { t } = await getT();
  const me = await requireRole("rider");
  const data = (await riderDashboard(me)) as RiderDashboard;

  return (
    <>
      <PageHeader title={t("rider.deliveriesTitle")} subtitle={t("rider.deliveriesSub")} />
      <RiderOrderList orders={data.active_orders} />
    </>
  );
}
