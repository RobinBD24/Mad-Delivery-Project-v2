"use client";

import { useCallback, useEffect, useState } from "react";

import { ChatBox } from "@/components/chat/chat-box";
import { useTranslation } from "@/lib/i18n/use-translation";

/**
 * Read/participate in an order's delivery chat. The chat only exists after the
 * assigned rider confirms receipt (C6); until then a hint is shown.
 */
export function DeliveryChatPanel({ orderId, viewerId }: { orderId: number; viewerId: number }) {
  const { t } = useTranslation();
  const [thread, setThread] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/orders/${orderId}/delivery-chat`);
    if (res.ok) { const d = await res.json(); setThread(d.thread ?? null); }
    setLoaded(true);
  }, [orderId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  if (!loaded) return null;
  if (!thread) return <p className="text-sm text-fg-muted" data-testid="delivery-chat-unavailable">{t("rider.deliveryChatUnavailable")}</p>;
  return <ChatBox base={`/api/delivery-chat/${thread}`} viewerId={viewerId} />;
}
