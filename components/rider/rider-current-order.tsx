import { Icon } from "@/components/layout/icons";
import { OrderStatusActions } from "@/components/orders/order-status-actions";
import { OrderStatusBadge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { RIDER_NEXT_STATUS } from "@/lib/constants";
import { getT } from "@/lib/i18n/server";
import type { Order } from "@/types";

function Row({ icon, label, value }: { icon: string; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-muted text-fg-muted">
        <Icon name={icon} className="size-4" />
      </span>
      <div className="min-w-0">
        <p className="text-xs text-fg-subtle">{label}</p>
        <p className="text-sm font-medium text-fg-base">{value || "—"}</p>
      </div>
    </div>
  );
}

/** Current-order card — the rider's in-progress (or next ready) delivery. */
export async function RiderCurrentOrder({ orders }: { orders: Order[] }) {
  const { t, fmt } = await getT();
  const current =
    orders.find((o) => o.status === "on_the_way" || o.status === "picked_up") ??
    orders.find((o) => o.status === "ready") ??
    orders[0];

  if (!current) {
    return (
      <Card>
        <CardHeader title={t("rider.currentOrder")} />
        <EmptyState title={t("rider.noCurrentOrder")} description={t("rider.noCurrentOrderDesc")} />
      </Card>
    );
  }

  const mapsHref = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(current.delivery_address)}`;
  const next = RIDER_NEXT_STATUS[current.status] ?? [];

  return (
    <Card>
      <CardHeader
        title={t("rider.currentOrder")}
        subtitle={current.order_number ?? `#${fmt.num(current.id)}`}
        action={<OrderStatusBadge status={current.status} />}
      />
      <CardContent className="space-y-3">
        <Row icon="store" label={t("rider.pickupLocation")} value={current.branch_name} />
        <Row icon="clock" label={t("rider.pickupTime")} value={fmt.time(current.created_at)} />
        <Row icon="pin" label={t("rider.dropoffLocation")} value={current.delivery_address} />
        <Row icon="user" label={t("orders.customer")} value={`${current.customer_name || "—"} · ${current.customer_phone || "—"}`} />
        <Row icon="money" label={t("rider.orderPrice")} value={`${fmt.money(current.total_amount)} · ${t(`payment.${current.payment_method}`)}`} />

        <div className="pt-1">
          <OrderStatusActions orderId={current.id} nextStatuses={next} />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <a
            href={mapsHref}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-center gap-1.5 rounded-xl border border-border-strong px-4 py-2 text-sm font-semibold text-fg-base hover:bg-surface-hover"
          >
            <Icon name="pin" className="size-4" /> {t("rider.navigate")}
          </a>
          <a
            href={current.customer_phone ? `tel:${current.customer_phone}` : "#"}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-border-strong px-4 py-2 text-sm font-semibold text-fg-base hover:bg-surface-hover aria-disabled:pointer-events-none aria-disabled:opacity-50"
            aria-disabled={!current.customer_phone}
          >
            <Icon name="phone" className="size-4" /> {t("rider.callCustomer")}
          </a>
        </div>

        <ButtonLink href={`/rider/orders/${current.id}`} variant="ghost" className="w-full">
          {t("rider.details")}
        </ButtonLink>
      </CardContent>
    </Card>
  );
}
