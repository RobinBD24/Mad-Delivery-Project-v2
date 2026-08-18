import Link from "next/link";

import { OrderStatusBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { getT } from "@/lib/i18n/server";
import type { Order } from "@/types";

import { OrderStepTracker } from "./order-step-tracker";

/** Green-themed rider delivery list (replaces the shared table on rider pages). */
export async function RiderOrderList({ orders }: { orders: Order[] }) {
  const { t, fmt } = await getT();
  if (orders.length === 0) {
    return (
      <EmptyState
        title={t("rider.noDeliveries")}
        description={t("rider.noDeliveriesDesc")}
      />
    );
  }

  return (
    <ul className="space-y-3">
      {orders.map((order) => (
        <li key={order.id}>
          <Link
            href={`/rider/orders/${order.id}`}
            className="block overflow-hidden rounded-2xl border border-border-base bg-surface-card shadow-card transition-shadow hover:border-rider-600/40 hover:shadow-card-hover"
          >
            <div className="flex items-center gap-3 px-4 py-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-rider-50 text-2xl ring-1 ring-rider-600/20">
                🏍️
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-extrabold text-fg-base">{order.order_number ?? `#${fmt.num(order.id)}`}</span>
                  <OrderStatusBadge status={order.status} />
                </div>
                <p className="truncate text-[11px] text-fg-muted">
                  {order.branch_name} → {order.delivery_address}
                </p>
                <p className="mt-0.5 text-[10px] text-fg-subtle">{fmt.dateTime(order.created_at)}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-extrabold text-fg-base">{fmt.money(order.total_amount)}</p>
                <p className="text-[11px] font-semibold text-rider-600">
                  {t(`payment.${order.payment_method}`)}
                </p>
              </div>
            </div>
            <div className="border-t border-border-base px-4 py-3">
              <OrderStepTracker status={order.status} />
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
