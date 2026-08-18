"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { clockInAction, clockOutAction } from "@/lib/api/actions";
import { useTranslation } from "@/lib/i18n/use-translation";
import { Icon } from "@/components/layout/icons";
import { cn } from "@/lib/utils";
import type { DutyLog } from "@/types";

export interface DutyBranch {
  id: number;
  name: string;
  address?: string;
  phone?: string;
}

/**
 * Rider duty panel — the old green "start your duty" experience:
 * pick an outlet card → confirm modal → clock-in. When on duty, an online
 * status card with a clock-out confirmation (modal only for the confirm action).
 */
export function DutyControls({
  todayDuty,
  assignedBranchId,
  branches,
}: {
  todayDuty: DutyLog | null;
  assignedBranchId: number | null;
  branches: DutyBranch[];
}) {
  const { t, fmt } = useTranslation();
  const [confirm, setConfirm] = useState<DutyBranch | null>(null);
  const [clockOutOpen, setClockOutOpen] = useState(false);
  const [feedback, setFeedback] = useState<{ error: string | null; success?: string }>({ error: null });
  const [pending, startTransition] = useTransition();

  function doClockIn(branchId: number) {
    startTransition(async () => {
      const res = await clockInAction(branchId);
      setFeedback(res);
      if (!res.error) setConfirm(null);
    });
  }

  function doClockOut() {
    startTransition(async () => {
      const res = await clockOutAction();
      setFeedback(res);
      if (!res.error) setClockOutOpen(false);
    });
  }

  // ── On duty ──────────────────────────────────────────────────────────
  if (todayDuty && todayDuty.is_on_duty) {
    return (
      <div className="space-y-3">
        <div
          className="rounded-2xl px-4 py-4 text-white"
          style={{ background: "linear-gradient(135deg,#166534,#14532d)" }}
        >
          <div className="flex items-center gap-2">
            <span className="size-2.5 animate-pulse rounded-full bg-rider-500" />
            <span className="text-sm font-bold text-rider-50">{t("rider.onlineOnDuty")}</span>
          </div>
          <p className="mt-2 text-lg font-extrabold text-amber-300">{todayDuty.branch_name}</p>
          <p className="text-[11px] text-rider-50/70">{t("rider.runningSince", { time: fmt.time(todayDuty.clock_in) })}</p>
        </div>
        <Button size="lg" variant="danger" className="w-full" onClick={() => setClockOutOpen(true)}>
          {t("rider.endDutyButton")}
        </Button>
        {feedback.error ? <p className="text-sm text-red-600">{feedback.error}</p> : null}

        {clockOutOpen ? (
          <ConfirmDialog
            title={t("rider.endDutyConfirmTitle")}
            description={t("rider.endDutyConfirmDesc", { branch: todayDuty.branch_name })}
            confirmLabel={t("rider.confirmClockOut")}
            danger
            pending={pending}
            error={feedback.error}
            onCancel={() => setClockOutOpen(false)}
            onConfirm={doClockOut}
          />
        ) : null}
      </div>
    );
  }

  // ── Duty completed for the day ───────────────────────────────────────
  if (todayDuty && !todayDuty.is_on_duty) {
    return (
      <p className="rounded-xl bg-rider-50 px-4 py-3 text-sm font-medium text-rider-700 ring-1 ring-rider-600/20 dark:bg-rider-500/10 dark:text-rider-500">
        {t("rider.dutyCompleted", {
          time:
            todayDuty.duration_minutes === null
              ? t("rider.onDutyNow")
              : t("rider.durationHm", {
                  h: fmt.num(Math.floor(todayDuty.duration_minutes / 60)),
                  m: fmt.num(todayDuty.duration_minutes % 60),
                }),
        })}
      </p>
    );
  }

  // ── Not on duty yet → outlet selection ───────────────────────────────
  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-extrabold text-fg-base">{t("rider.startDutyTitle")}</p>
        <p className="text-xs text-fg-muted">{t("rider.startDutyQuestion")}</p>
      </div>

      {branches.length === 0 ? (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700 ring-1 ring-amber-200">
          {t("rider.noActiveOutlets")}
        </p>
      ) : (
        <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
          {branches.map((b) => {
            const preferred = b.id === assignedBranchId;
            return (
              <button
                key={b.id}
                type="button"
                onClick={() => setConfirm(b)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl border-2 px-3 py-3 text-left transition-colors",
                  preferred
                    ? "border-rider-600 bg-rider-50 dark:bg-rider-500/10"
                    : "border-border-base hover:border-rider-600 hover:bg-rider-50 dark:hover:bg-rider-500/10",
                )}
              >
                <span
                  className="flex size-11 shrink-0 items-center justify-center rounded-xl text-white"
                  style={{ background: "linear-gradient(135deg,#166534,#14532d)" }}
                >
                  <Icon name="store" className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-fg-base">{b.name}</span>
                  {b.address ? (
                    <span className="block truncate text-[11px] text-fg-muted">{b.address}</span>
                  ) : null}
                </span>
                {preferred ? (
                  <span className="shrink-0 rounded-full bg-rider-50 px-2 py-0.5 text-[10px] font-bold text-rider-700 ring-1 ring-rider-600/20">
                    {t("rider.myOutlet")}
                  </span>
                ) : null}
                <span className="shrink-0 text-rider-600">›</span>
              </button>
            );
          })}
        </div>
      )}

      <p className="text-xs text-fg-subtle">
        {t("rider.clockInNote")}
      </p>
      {feedback.error ? <p className="text-sm text-red-600">{feedback.error}</p> : null}

      {confirm ? (
        <ConfirmDialog
          title={t("rider.startDutyConfirmTitle")}
          description={`${t("rider.outletColon", { name: confirm.name })}${confirm.address ? ` — ${confirm.address}` : ""}`}
          confirmLabel={t("rider.confirmClockIn")}
          pending={pending}
          error={feedback.error}
          onCancel={() => setConfirm(null)}
          onConfirm={() => doClockIn(confirm.id)}
        />
      ) : null}
    </div>
  );
}

/** Small confirm modal — used only for the clock-in / clock-out confirm step. */
function ConfirmDialog({
  title,
  description,
  confirmLabel,
  danger = false,
  pending,
  error,
  onCancel,
  onConfirm,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  danger?: boolean;
  pending: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      onClick={() => !pending && onCancel()}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-surface-card p-6 text-center shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div
          className="mx-auto mb-3 flex size-14 items-center justify-center rounded-full text-2xl text-white"
          style={{ background: danger ? "linear-gradient(135deg,#dc2626,#b91c1c)" : "linear-gradient(135deg,#166534,#15803d)" }}
        >
          {danger ? "🔴" : "🏍️"}
        </div>
        <h3 className="text-base font-bold text-fg-base">{title}</h3>
        <p className="mt-1 text-sm text-fg-muted">{description}</p>
        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
        <div className="mt-5 flex justify-center gap-3">
          <Button variant="outline" onClick={onCancel} disabled={pending}>
            {t("common.cancel")}
          </Button>
          <Button variant={danger ? "danger" : "success"} onClick={onConfirm} disabled={pending}>
            {pending ? <Spinner className="size-4 border-white/40 border-t-white" /> : null}
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
