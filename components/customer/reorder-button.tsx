"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Icon } from "@/components/layout/icons";
import { Button } from "@/components/ui/button";
import { reorderAction } from "@/lib/api/actions";
import { useTranslation } from "@/lib/i18n/use-translation";

/** One-click reorder: duplicates a past order and jumps to the new one. */
export function ReorderButton({ orderId, size = "sm" }: { orderId: number; size?: "sm" | "md" }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function reorder() {
    setError(null);
    start(async () => {
      const res = await reorderAction(orderId);
      if (res.error) return setError(res.error);
      if (res.orderId) router.push(`/customer/orders/${res.orderId}`);
    });
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <Button size={size} variant="outline" disabled={pending} onClick={reorder}>
        <Icon name="cart" className="size-4" /> {t("orders.reorder")}
      </Button>
      {error ? <span className="text-xs text-red-600">{error}</span> : null}
    </span>
  );
}
