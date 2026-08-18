"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { Spinner } from "@/components/ui/spinner";
import { updateOrderStatusAction } from "@/lib/api/actions";
import { useTranslation } from "@/lib/i18n/use-translation";
import type { OrderStatus } from "@/types";

const NEXT_LABEL_KEYS: Partial<Record<OrderStatus, string>> = {
  accepted: "orders.nextAccepted",
  preparing: "orders.nextPreparing",
  ready: "orders.nextReady",
  picked_up: "orders.nextPickedUp",
  on_the_way: "orders.nextOnTheWay",
  delivered: "orders.nextDelivered",
};

/**
 * Buttons for the valid next statuses of an order.
 * `nextStatuses` is computed on the server per role; cancellation gets a confirm modal.
 */
export function OrderStatusActions({
  orderId,
  nextStatuses,
}: {
  orderId: number;
  nextStatuses: OrderStatus[];
}) {
  const { t } = useTranslation();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const forward = nextStatuses.filter((s) => s !== "cancelled");
  const canCancel = nextStatuses.includes("cancelled");

  function advance(status: OrderStatus) {
    startTransition(async () => {
      const result = await updateOrderStatusAction(orderId, status);
      setError(result.error);
    });
  }

  if (nextStatuses.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {error ? <p className="w-full text-sm text-red-600">{error}</p> : null}
      {forward.map((status) => (
        <Button
          key={status}
          size="sm"
          variant={status === "delivered" ? "success" : "primary"}
          disabled={pending}
          onClick={() => advance(status)}
        >
          {pending ? <Spinner className="size-3.5 border-white/40 border-t-white" /> : null}
          {NEXT_LABEL_KEYS[status] ? t(NEXT_LABEL_KEYS[status]!) : t(`orderStatus.${status}`)}
        </Button>
      ))}
      {canCancel ? (
        <ConfirmModal
          trigger={
            <Button size="sm" variant="outline" className="text-red-600" disabled={pending}>
              {t("orders.cancelOrder")}
            </Button>
          }
          title={t("orders.cancelOrderConfirmTitle")}
          description={t("orders.cancelOrderConfirmDesc")}
          confirmLabel={t("orders.cancelOrderConfirmLabel")}
          action={async () => updateOrderStatusAction(orderId, "cancelled")}
        />
      ) : null}
    </div>
  );
}
