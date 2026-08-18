"use client";

import { useSyncExternalStore } from "react";

import { useTranslation } from "@/lib/i18n/use-translation";
import { APP_TIME_ZONE } from "@/lib/i18n/format";

/**
 * Live status / date bar — .route-bar from
 * static_design/Branch-manager_dashboard.html: pulsing live dot, a dashed
 * "route" separator, and a running Asia/Dhaka clock in the app locale.
 *
 * The clock is an external system (a timer), so it's read through
 * useSyncExternalStore rather than setState-in-an-effect: one shared interval
 * for every subscriber, and a cached snapshot so re-renders stay stable.
 * The server snapshot is 0 → the stamp renders empty and fills in after
 * hydration, so there's no mismatch and no layout shift.
 */
const listeners = new Set<() => void>();
let currentMs = 0;
let timer: ReturnType<typeof setInterval> | null = null;

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  if (!timer) {
    currentMs = Date.now();
    timer = setInterval(() => {
      currentMs = Date.now();
      for (const listener of listeners) listener();
    }, 1000);
  }
  onChange();
  return () => {
    listeners.delete(onChange);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

const getSnapshot = () => currentMs;
const getServerSnapshot = () => 0;

export function DashboardStatusBar({ locale }: { locale: "bn" | "en" }) {
  const { t } = useTranslation();
  const ms = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // PHASE 8 — always Asia/Dhaka, and always the APPLICATION locale (never the
  // browser's). bn-BD renders Bengali weekday/month names + Bengali digits;
  // en-GB renders English. Pinning the zone keeps SSR and client identical.
  const bcp = locale === "bn" ? "bn-BD" : "en-GB";
  const now = ms ? new Date(ms) : null;
  const stamp = now
    ? `${now.toLocaleDateString(bcp, {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
        timeZone: APP_TIME_ZONE,
      })} · ${now.toLocaleTimeString(bcp, {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
        timeZone: APP_TIME_ZONE,
      })}`
    : "";

  return (
    <div
      data-testid="dashboard-status-bar"
      className="mx-3.5 mt-3.5 flex items-center gap-3.5 overflow-hidden rounded-xl border border-border-base bg-surface-card px-4.5 py-2.5 sm:mx-6.5"
    >
      <span className="flex shrink-0 items-center gap-2 text-xs text-fg-muted">
        {/* .pulse-dot */}
        <span className="relative flex size-1.75">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60 motion-reduce:hidden" />
          <span className="relative inline-flex size-1.75 rounded-full bg-emerald-400" />
        </span>
        {t("dashboard.liveLabel")}
      </span>

      {/* PHASE 8 — the animated rider that glided across this rail was reported as
          a distracting "moving icon" in the dashboard header and has been removed.
          The dashed rail remains as a plain, static separator; the live-status dot
          above is kept deliberately (Phase 5 asks for a subtle live indicator). */}
      <div
        aria-hidden="true"
        className="hidden h-0.5 flex-1 rounded-sm bg-[repeating-linear-gradient(90deg,var(--border-base)_0_6px,transparent_6px_12px)] sm:block"
      />

      <span
        className="ml-auto shrink-0 font-mono text-xs tabular-nums text-fg-muted sm:ml-0"
        suppressHydrationWarning
      >
        {stamp}
      </span>
    </div>
  );
}
