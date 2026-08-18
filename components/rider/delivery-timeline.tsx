import { getT } from "@/lib/i18n/server";
import { cn } from "@/lib/utils";
import type { Order } from "@/types";

import { RIDER_STEPS, riderStepIndex } from "./order-progress";

/**
 * Vertical delivery timeline. The backend exposes `created_at` (assigned) and
 * `updated_at` (last transition), so the assigned step and the current step get
 * real timestamps; future steps are shown as pending.
 */
export async function DeliveryTimeline({ order }: { order: Order }) {
  const { t, fmt } = await getT();
  const current = riderStepIndex(order.status);

  if (order.status === "cancelled") {
    return (
      <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700 ring-1 ring-red-200">
        {t("rider.cancelledNoTimeline")}
      </p>
    );
  }

  return (
    <ol className="flex flex-col">
      {RIDER_STEPS.map((step, i) => {
        const done = i <= current;
        const isCurrent = i === current;
        const time = i === 0 ? order.created_at : isCurrent ? order.updated_at : null;
        return (
          <li key={step.key} className="flex items-start gap-3">
            <div className="flex flex-col items-center">
              <span
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
                  done ? "bg-rider-600 text-white ring-2 ring-rider-600" : "bg-surface-card text-fg-subtle ring-2 ring-slate-300",
                )}
              >
                {done ? "✓" : ""}
              </span>
              {i < RIDER_STEPS.length - 1 ? (
                <span className={cn("h-6 w-0.5", i < current ? "bg-rider-600" : "bg-slate-200")} />
              ) : null}
            </div>
            <div className="pb-4">
              <p className={cn("text-sm font-semibold", done ? "text-fg-base" : "text-fg-subtle")}>
                {step.icon} {t(step.label)}
              </p>
              <p className="text-[11px] text-fg-subtle">{time ? fmt.time(time) : "—"}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
