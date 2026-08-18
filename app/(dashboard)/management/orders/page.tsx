import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { OrderTable } from "@/components/orders/order-table";
import { getJSON } from "@/lib/api/client";
import { requireRole } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import type { Order, Paginated } from "@/types";

export const metadata: Metadata = { title: "Orders" };

/** /management/orders — management read-only operational view of all orders. */
export default async function ManagementOrdersPage() {
  await requireRole("management");
  const { t } = await getT();
  const data = await getJSON<Paginated<Order>>("/orders/?page_size=100");

  return (
    <>
      <PageHeader title={t("pages.ordersTitle")} subtitle={t("pages.ordersSub")} />
      <Card>
        <OrderTable orders={data.results} hrefBase={null} showBranch />
      </Card>
    </>
  );
}
