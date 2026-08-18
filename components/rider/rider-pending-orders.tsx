import Link from "next/link";

import { OrderStatusActions } from "@/components/orders/order-status-actions";
import { Icon } from "@/components/layout/icons";
import { OrderStatusBadge } from "@/components/ui/badge";
import { Card, CardHeader, ViewAllLink } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { RIDER_NEXT_STATUS } from "@/lib/constants";
import { getT } from "@/lib/i18n/server";
import type { Order } from "@/types";

/**
 * Pending/assigned deliveries list (orders are assigned by the branch manager;
 * riders don't self-accept, so the action is the next delivery-status step).
 * While the rider is offline no requests are presented as available — the
 * design's offline state shows a "go online" empty state instead.
 */
export async function RiderPendingOrders({ orders, online = true }: { orders: Order[]; online?: boolean }) {
  const { t, fmt } = await getT();

  if (!online) {
    return (
      <div data-testid="rider-pending-offline">
        <Card>
          <CardHeader title={t("rider.pendingOrders")} />
          <EmptyState
            title={t("rider.offlineNoRequestsTitle")}
            description={t("rider.offlineNoRequestsDesc")}
          />
        </Card>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader
        title={`${t("rider.pendingOrders")} (${fmt.num(orders.length)})`}
        action={
          <ViewAllLink href="/rider/orders">{t("common.viewAll")}</ViewAllLink>
        }
      />
      {orders.length === 0 ? (
        <EmptyState title={t("rider.noDeliveries")} description={t("rider.noDeliveriesDesc")} />
      ) : (
        <ul className="divide-y divide-border-base">
          {/* Dashboard shows a compact queue; the full list lives at /rider/orders. */}
          {orders.slice(0, 6).map((o) => (
            <li key={o.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-500/15 text-brand-500"><Icon name="bag" className="size-5" /></span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-sm font-semibold text-fg-base">
                  <Link href={`/rider/orders/${o.id}`} className="hover:text-brand-600">{o.order_number ?? `#${fmt.num(o.id)}`}</Link>
                  <OrderStatusBadge status={o.status} />
                </p>
                <p className="truncate text-xs text-fg-muted">
                  {o.branch_name} → {o.delivery_address}
                </p>
                <p className="text-xs text-fg-subtle">{fmt.time(o.created_at)}</p>
              </div>
              <div className="text-right">
                <p className="font-semibold text-fg-base">{fmt.money(o.total_amount)}</p>
                <p className="text-xs text-fg-subtle">{t(`payment.${o.payment_method}`)}</p>
              </div>
              <OrderStatusActions orderId={o.id} nextStatuses={RIDER_NEXT_STATUS[o.status] ?? []} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
