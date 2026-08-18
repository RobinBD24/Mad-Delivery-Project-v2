"use client";

import { useCallback, useEffect, useState } from "react";

import { ChatBox } from "@/components/chat/chat-box";
import { useTranslation } from "@/lib/i18n/use-translation";
import { cn } from "@/lib/utils";

interface OnlineRider {
  session: number;
  rider: number;
  rider_name: string;
  rider_phone: string;
  duty_chat_thread: number | null;
  has_unread: boolean;
}

/** BM view: riders currently on duty for this branch + their duty chat. */
export function BmDutyChats({ viewerId }: { viewerId: number }) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<OnlineRider[]>([]);
  const [active, setActive] = useState<OnlineRider | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/branch-manager/duty-chats");
    if (res.ok) { const d = await res.json(); setRows(d.results ?? []); }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  return (
    <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
      <div className="space-y-1" data-testid="online-riders">
        {rows.length === 0 ? (
          <p className="text-sm text-fg-muted">{t("rider.noOnlineRiders")}</p>
        ) : rows.map((r) => (
          <button
            key={r.session}
            type="button"
            data-testid="online-rider"
            onClick={() => setActive(r)}
            className={cn(
              "flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm",
              active?.session === r.session ? "border-brand-500 bg-brand-50 dark:bg-brand-500/10" : "border-border-strong hover:bg-surface-hover",
            )}
          >
            <span className="font-medium text-fg-base">{r.rider_name}</span>
            {r.has_unread ? <span className="size-2 rounded-full bg-brand-500" aria-label="unread" /> : null}
          </button>
        ))}
      </div>
      <div>
        {active && active.duty_chat_thread ? (
          <ChatBox base={`/api/duty-chat/${active.duty_chat_thread}`} viewerId={viewerId} title={active.rider_name} />
        ) : (
          <p className="text-sm text-fg-muted">{t("rider.selectRiderToChat")}</p>
        )}
      </div>
    </div>
  );
}
