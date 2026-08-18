import { getT } from "@/lib/i18n/server";
import { cn } from "@/lib/utils";
import type { OrderStatus } from "@/types";

import { RIDER_STEPS, riderStepIndex } from "./order-progress";

/** Horizontal green step tracker: অ্যাসাইনড → পিকআপ → রাস্তায় → ডেলিভারড. */
export async function OrderStepTracker({ status }: { status: OrderStatus }) {
  const { t } = await getT();
  if (status === "cancelled") {
    return (
      <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700 ring-1 ring-red-200">
        {t("rider.orderCancelled")}
      </p>
    );
  }
  const current = riderStepIndex(status);

  return (
    <div>
      <div className="flex items-center">
        {RIDER_STEPS.map((step, i) => {
          const done = i <= current;
          return (
            <div key={step.key} className="flex flex-1 items-center last:flex-none">
              <span
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-extrabold transition-colors",
                  done ? "bg-rider-600 text-white" : "bg-surface-muted text-fg-subtle",
                )}
              >
                {done ? "✓" : i + 1}
              </span>
              {i < RIDER_STEPS.length - 1 ? (
                <span
                  className={cn(
                    "mx-1.5 h-1 flex-1 rounded-full transition-colors",
                    i < current ? "bg-rider-600" : "bg-slate-200",
                  )}
                />
              ) : null}
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex justify-between text-[10px] font-medium">
        {RIDER_STEPS.map((step, i) => (
          <span key={step.key} className={i <= current ? "text-rider-700" : "text-fg-subtle"}>
            {t(step.label)}
          </span>
        ))}
      </div>
    </div>
  );
}
