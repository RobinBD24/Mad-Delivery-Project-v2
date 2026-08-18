"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ChatBox } from "@/components/chat/chat-box";
import { useTranslation } from "@/lib/i18n/use-translation";
import { parseFieldErrors } from "@/lib/validation/contract";

/**
 * Rider order actions (C5/C6): confirm physically receiving the order, then
 * chat with the customer. The delivery chat only appears after confirmation.
 */
export function RiderOrderPanel({ orderId, viewerId, status }: { orderId: number; viewerId: number; status: string }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [thread, setThread] = useState<number | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/orders/${orderId}/delivery-chat`);
    if (res.ok) {
      const d = await res.json();
      setThread(d.thread ?? null);
      setConfirmed(Boolean(d.thread));
    }
  }, [orderId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  async function confirm() {
    setPending(true); setError(null);
    const res = await fetch(`/api/rider/orders/${orderId}/confirm-receive`, { method: "POST" });
    setPending(false);
    if (!res.ok) {
      // No fields to attach to — this action is a single confirm button, so the
      // server's message is shown as a form-level error.
      const data = await res.json().catch(() => null);
      setError(parseFieldErrors(data, t("errors.generic")).formError);
      return;
    }
    await load();
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <Alert tone="error" message={error} />
      {!confirmed ? (
        status === "ready" ? (
          <Button type="button" onClick={confirm} disabled={pending} data-testid="confirm-receive">
            {t("rider.confirmReceive")}
          </Button>
        ) : (
          <p className="text-sm text-fg-muted">{t("rider.confirmReceiveHint")}</p>
        )
      ) : (
        <>
          <p className="text-xs font-medium text-emerald-600" data-testid="receive-confirmed">✓ {t("rider.received")}</p>
          {thread ? <ChatBox base={`/api/delivery-chat/${thread}`} viewerId={viewerId} title={t("rider.deliveryChat")} /> : null}
        </>
      )}
    </div>
  );
}
