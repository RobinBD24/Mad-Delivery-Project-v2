"use client";

import { useCallback, useEffect, useState } from "react";

import { ChatBox } from "@/components/chat/chat-box";
import { useTranslation } from "@/lib/i18n/use-translation";

/** Rider's duty chat with the branch manager (active while on duty). */
export function RiderDutyChat({ viewerId }: { viewerId: number }) {
  const { t } = useTranslation();
  const [thread, setThread] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/rider/duty");
    if (res.ok) { const d = await res.json(); setThread(d.duty_chat_thread ?? null); }
    setLoaded(true);
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  if (!loaded) return null;
  if (!thread) return <p className="text-sm text-fg-muted" data-testid="duty-chat-offline">{t("rider.dutyChatOffline")}</p>;
  return <ChatBox base={`/api/duty-chat/${thread}`} viewerId={viewerId} />;
}
