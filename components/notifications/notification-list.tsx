"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Icon } from "@/components/layout/icons";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "@/lib/api/actions";
import { useTranslation } from "@/lib/i18n/use-translation";
import type { TranslateFn } from "@/lib/i18n/dictionaries";
import { cn } from "@/lib/utils";
import type { Notification, NotificationType } from "@/types";

/**
 * Resolve interpolation vars, translating any value tagged "@:<key>" (e.g. an
 * enum label like "@:orderStatus.preparing") to the viewer's locale first.
 */
function resolveParams(
  t: TranslateFn,
  params: Notification["params"],
): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(params ?? {})) {
    out[k] = typeof v === "string" && v.startsWith("@:") ? t(v.slice(2)) : v;
  }
  return out;
}

/** Title/body: prefer the translated i18n key, fall back to stored raw text. */
export function notificationText(t: TranslateFn, n: Notification): { title: string; body: string } {
  const vars = resolveParams(t, n.params);
  return {
    title: n.title_key ? t(n.title_key, vars) : n.title,
    body: n.body_key ? t(n.body_key, vars) : n.body,
  };
}

const TYPE_ICON: Record<NotificationType, string> = {
  system: "bell",
  order: "bag",
  delivery: "bike",
  payment: "money",
  withdrawal: "money",
  commission: "money",
  complaint: "inbox",
  reward: "money",
  review: "user",
  marketing: "megaphone",
  reservation: "clock",
  ramadan: "clock",
  notice: "megaphone",
  security: "lock",
  account: "user",
  branch: "store",
  catalog: "grid",
};

type Filter = "all" | "unread" | "read";

export function NotificationList({ items }: { items: Notification[] }) {
  const { t, fmt } = useTranslation();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [read, setRead] = useState<Set<number>>(new Set());
  const [filter, setFilter] = useState<Filter>("all");

  const isUnread = (n: Notification) => !n.is_read && !read.has(n.id);
  const hasUnread = items.some(isUnread);
  const visible = items.filter((n) =>
    filter === "all" ? true : filter === "unread" ? isUnread(n) : !isUnread(n),
  );

  const FILTERS: { key: Filter; label: string }[] = [
    { key: "all", label: t("notifications.filterAll") },
    { key: "unread", label: t("notifications.filterUnread") },
    { key: "read", label: t("notifications.filterRead") },
  ];

  function open(n: Notification) {
    if (!n.is_read) {
      setRead((s) => new Set(s).add(n.id));
      start(() => {
        void markNotificationReadAction(n.id);
      });
    }
    if (n.link) router.push(n.link);
  }

  function markAll() {
    setRead(new Set(items.map((n) => n.id)));
    start(() => {
      void markAllNotificationsReadAction();
    });
  }

  if (items.length === 0) {
    return <EmptyState title={t("notifications.emptyTitle")} description={t("notifications.emptyDesc")} />;
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 px-1 pb-3">
        <div className="inline-flex rounded-lg border border-border-base bg-surface-muted p-0.5">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              aria-pressed={filter === f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                "rounded-md px-3 py-1 text-sm font-medium transition-colors",
                filter === f.key ? "bg-surface-card text-fg-base shadow-sm" : "text-fg-muted hover:text-fg-base",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        {hasUnread ? (
          <Button size="sm" variant="outline" onClick={markAll} disabled={pending}>
            <Icon name="check" className="size-4" /> {t("notifications.markAllRead")}
          </Button>
        ) : null}
      </div>
      {visible.length === 0 ? (
        <EmptyState title={t("notifications.emptyTitle")} description={t("notifications.emptyDesc")} />
      ) : null}
      <ul className="space-y-2">
        {visible.map((n) => {
          const unread = !n.is_read && !read.has(n.id);
          const { title, body } = notificationText(t, n);
          return (
            <li key={n.id}>
              <button
                type="button"
                onClick={() => open(n)}
                className={cn(
                  "flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left transition-colors",
                  unread
                    ? "border-brand-200 bg-brand-50/60 hover:bg-brand-50"
                    : "border-border-base bg-surface-card hover:bg-surface-hover",
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 flex size-9 items-center justify-center rounded-lg",
                    unread ? "bg-brand-100 text-brand-600" : "bg-surface-muted text-fg-muted",
                  )}
                >
                  <Icon name={TYPE_ICON[n.type] ?? "bell"} className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className={cn("truncate text-sm", unread ? "font-semibold text-fg-base" : "font-medium text-fg-muted")}>
                      {title}
                    </span>
                    {unread ? <span className="size-2 shrink-0 rounded-full bg-brand-500" /> : null}
                  </span>
                  {body ? <span className="mt-0.5 block text-sm text-fg-muted">{body}</span> : null}
                  <span className="mt-1 block text-xs text-fg-subtle">{fmt.dateTime(n.created_at)}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
