import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AssignRiderSelect } from "@/components/orders/assign-rider-select";
import { OrderDetailCard } from "@/components/orders/order-detail-card";
import { OrderStatusActions } from "@/components/orders/order-status-actions";
import { PageHeader } from "@/components/layout/page-header";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ApiError, getJSON } from "@/lib/api/client";
import { requireRole } from "@/lib/auth/session";
import { BM_NEXT_STATUS } from "@/lib/constants";
import { getT } from "@/lib/i18n/server";
import type { Order, RiderProfile } from "@/types";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("customer.orderDetailTitle") };
}

export default async function BMOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { t, fmt } = await getT();
  await requireRole("branch_manager");
  const { id } = await params;

  let order: Order;
  try {
    order = await getJSON<Order>(`/orders/${id}/`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  // Riders assigned to this manager's own branch (branch-manager-scoped endpoint).
  const riders = await getJSON<RiderProfile[]>("/riders/branch/").catch(
    () => [] as RiderProfile[],
  );

  return (
    <>
      <PageHeader
        title={t("branchManager.orderNumber", { id: fmt.num(order.id) })}
        subtitle={t("branchManager.manageOrder")}
        breadcrumbs={[
          { label: t("branchManager.ordersTitle"), href: "/branch-manager/orders" },
          { label: order.order_number || `#${order.id}` },
        ]}
        action={
          <ButtonLink href="/branch-manager/orders" variant="outline">
            {t("branchManager.backToOrders")}
          </ButtonLink>
        }
      />

      <OrderDetailCard order={order}>
        <OrderStatusActions orderId={order.id} nextStatuses={BM_NEXT_STATUS[order.status] ?? []} />
      </OrderDetailCard>

      {["accepted", "preparing", "ready"].includes(order.status) ? (
        <Card className="mt-6 max-w-xl">
          <CardHeader title={t("branchManager.assignRider")} subtitle={t("branchManager.assignRiderSub")} />
          <CardContent>
            <AssignRiderSelect
              orderId={order.id}
              currentRiderId={order.rider}
              riders={riders.map((r) => ({
                id: r.user,
                name: r.rider_name || r.rider_username,
              }))}
            />
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}
