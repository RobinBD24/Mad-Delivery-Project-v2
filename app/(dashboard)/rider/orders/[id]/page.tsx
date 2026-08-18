import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";

import { DeliveryTimeline } from "@/components/rider/delivery-timeline";
import { RiderOrderPanel } from "@/components/rider/rider-order-panel";
import { OrderStepTracker } from "@/components/rider/order-step-tracker";
import { RoutePanel } from "@/components/rider/route-panel";
import { PageHeader } from "@/components/layout/page-header";
import { OrderStatusActions } from "@/components/orders/order-status-actions";
import { OrderStatusBadge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ApiError, getJSON } from "@/lib/api/client";
import { requireRole } from "@/lib/auth/session";
import { RIDER_NEXT_STATUS } from "@/lib/constants";
import { getT } from "@/lib/i18n/server";
import { mediaUrl } from "@/lib/utils";
import type { Order } from "@/types";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("rider.details") };
}

export default async function RiderOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { t, fmt } = await getT();
  const me = await requireRole("rider");
  const { id } = await params;

  let order: Order;
  try {
    order = await getJSON<Order>(`/orders/${id}/`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  const next = RIDER_NEXT_STATUS[order.status] ?? [];

  return (
    <>
      <PageHeader
        title={t("rider.deliveryNumber", { id: fmt.num(order.id) })}
        subtitle={t("rider.updateProgress")}
        breadcrumbs={[
          { label: t("rider.deliveriesTitle"), href: "/rider/orders" },
          { label: order.order_number || `#${order.id}` },
        ]}
      />

      <Card className="mb-6">
        <CardHeader
          title={
            <span className="flex items-center gap-3">
              {t("rider.orderNumber", { id: fmt.num(order.id) })} <OrderStatusBadge status={order.status} />
            </span>
          }
          subtitle={order.branch_name}
          action={<OrderStatusActions orderId={order.id} nextStatuses={next} />}
        />
        <CardContent>
          <OrderStepTracker status={order.status} />
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader title={t("rider.deliveryChat")} />
        <CardContent>
          <RiderOrderPanel orderId={order.id} viewerId={Number(me.id)} status={order.status} />
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left: route + items */}
        <div className="space-y-6 lg:col-span-2">
          <RoutePanel
            pickup={order.branch_name}
            dropoff={order.delivery_address}
            eta={t("rider.etaValue")}
            distance={t("rider.estimatedDistance")}
            className="min-h-60"
          />

          <Card>
            <CardHeader title={t("rider.orderItems")} />
            <CardContent className="divide-y divide-border-base p-0">
              {order.items.map((item) => {
                const img = mediaUrl(item.product_image);
                return (
                  <div key={item.id} className="flex items-center gap-4 px-5 py-3.5">
                    {img ? (
                      <Image
                        src={img}
                        alt={item.product_name}
                        width={48}
                        height={48}
                        className="size-12 rounded-xl object-cover"
                      />
                    ) : (
                      <span className="flex size-12 items-center justify-center rounded-xl bg-surface-muted text-xl">
                        🍛
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-fg-base">{item.product_name}</p>
                      <p className="text-xs text-fg-muted">
                        {fmt.money(item.unit_price)} × {fmt.num(item.quantity)}
                        {item.food_note ? ` • ${item.food_note}` : ""}
                      </p>
                    </div>
                    <p className="font-semibold text-fg-base">{fmt.money(item.subtotal)}</p>
                  </div>
                );
              })}
              <div className="flex items-center justify-between px-5 py-4">
                <p className="font-semibold text-fg-base">{t("rider.grandTotal")}</p>
                <p className="text-lg font-bold text-rider-600">{fmt.money(order.total_amount)}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right: customer + timeline */}
        <div className="space-y-6">
          <Card>
            <CardHeader title={t("rider.customerAndPayment")} />
            <CardContent className="space-y-4 text-sm">
              <div className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-full bg-rider-50 text-lg ring-1 ring-rider-600/20">
                  👤
                </span>
                <div>
                  <p className="font-semibold text-fg-base">{order.customer_name || "—"}</p>
                  <p className="text-fg-muted">{order.customer_phone || "—"}</p>
                </div>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-fg-subtle">{t("common.address")}</p>
                <p className="mt-1 text-fg-base">{order.delivery_address}</p>
              </div>
              <div className="flex justify-between rounded-xl bg-surface-muted px-3 py-2.5">
                <span className="text-fg-muted">{t("rider.payment")}</span>
                <span className="font-bold text-fg-base">{t(`payment.${order.payment_method}`)}</span>
              </div>
              <div className="flex justify-between rounded-xl bg-rider-50 px-3 py-2.5 ring-1 ring-rider-600/20">
                <span className="text-fg-muted">{t("rider.totalBill")}</span>
                <span className="font-bold text-rider-700">{fmt.money(order.total_amount)}</span>
              </div>
              {order.food_notes ? (
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-fg-subtle">{t("rider.specialInstructions")}</p>
                  <p className="mt-1 text-fg-base">{order.food_notes}</p>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader title={t("rider.deliveryTimeline")} />
            <CardContent>
              <DeliveryTimeline order={order} />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
