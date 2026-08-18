"use client";

import Link from "next/link";

import { Icon } from "@/components/layout/icons";
import { notificationText } from "@/components/notifications/notification-list";
import { Card, CardHeader, ViewAllLink } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { useTranslation } from "@/lib/i18n/use-translation";
import { cn } from "@/lib/utils";
import type { Notification } from "@/types";

/**
 * Compact notifications panel for the rider dashboard right column — reuses
 * the inbox's key-based translation so system messages follow the UI locale.
 */
export function RiderNotificationPanel({ notifications }: { notifications: Notification[] }) {
  const { t, fmt } = useTranslation();

  return (
    <Card>
      <CardHeader
        title={t("rider.recentNotifications")}
        action={<ViewAllLink href="/rider/notifications">{t("common.viewAll")}</ViewAllLink>}
      />
      {notifications.length === 0 ? (
        <EmptyState title={t("notifications.emptyTitle")} description={t("notifications.emptyDesc")} />
      ) : (
        <ul className="divide-y divide-border-base">
          {notifications.slice(0, 4).map((n) => {
            const { title } = notificationText(t, n);
            return (
              <li key={n.id}>
                <Link
                  href={n.link || "/rider/notifications"}
                  className="flex items-start gap-2.5 px-5 py-3 hover:bg-surface-hover/70"
                >
                  <span
                    className={cn(
                      "mt-1 size-2 shrink-0 rounded-full",
                      n.is_read ? "bg-border-strong" : "bg-brand-500",
                    )}
                  />
                  <span className="min-w-0 flex-1">
                    <span className={cn("block truncate text-[13px]", n.is_read ? "text-fg-muted" : "font-semibold text-fg-base")}>
                      {title}
                    </span>
                    <span className="block text-[11px] text-fg-subtle">{fmt.date(n.created_at)}</span>
                  </span>
                  <Icon name="chevron" className="mt-1 size-3.5 shrink-0 text-fg-subtle" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
