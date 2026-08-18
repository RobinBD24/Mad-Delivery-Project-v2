"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { Icon } from "@/components/layout/icons";
import { useTranslation } from "@/lib/i18n/use-translation";

/**
 * Topbar bell. Polls the unread count so the badge stays fresh without a
 * websocket; clicking it opens the caller's role-scoped notifications inbox.
 */
export function NotificationBell({ href }: { href: string }) {
  const { t } = useTranslation();
  const [count, setCount] = useState(0);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const res = await fetch("/api/notifications/unread-count", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { count: number };
        if (alive) setCount(data.count ?? 0);
      } catch {
        /* ignore transient network errors */
      }
    }
    load();
    const timer = setInterval(load, 30_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  return (
    // .icon-btn + .badge from static_design/Branch-manager_dashboard.html
    <Link
      href={href}
      aria-label={t("notifications.title")}
      data-testid="notification-bell"
      className="relative flex size-11 items-center justify-center rounded-full border border-border-base bg-surface-muted text-fg-muted transition hover:bg-surface-hover hover:text-fg-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
    >
      <Icon name="bell" className="size-4.5" />
      {count > 0 ? (
        <span
          data-testid="notification-badge"
          className="absolute -right-0.5 -top-0.5 flex h-4.5 min-w-4.5 items-center justify-center rounded-full border-2 border-surface-page bg-brand-500 px-1 text-[10px] font-bold text-white"
        >
          {count > 99 ? "99+" : count}
        </span>
      ) : null}
    </Link>
  );
}
