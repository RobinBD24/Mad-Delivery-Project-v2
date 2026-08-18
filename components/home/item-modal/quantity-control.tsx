"use client";

import { useTranslation } from "@/lib/i18n/use-translation";

/** Demo-style quantity stepper: [ − ] [ qty ] [ + ], min 1. */
export function QuantityControl({
  qty,
  onChange,
  accent,
}: {
  qty: number;
  onChange: (qty: number) => void;
  accent: string;
}) {
  const { t, fmt } = useTranslation();
  return (
    <div
      className="flex shrink-0 items-center gap-1 rounded-[10px] border border-white/10 bg-surface-dark px-1"
      role="group"
      aria-label={t("home.modal.quantity")}
    >
      <button
        type="button"
        onClick={() => onChange(Math.max(1, qty - 1))}
        aria-label={t("home.modal.decreaseQty")}
        className="flex size-8.5 items-center justify-center text-lg font-bold text-white"
      >
        −
      </button>
      <span aria-live="polite" className="min-w-5 text-center text-base font-extrabold" style={{ color: accent }}>
        {fmt.num(qty)}
      </span>
      <button
        type="button"
        onClick={() => onChange(qty + 1)}
        aria-label={t("home.modal.increaseQty")}
        className="flex size-8.5 items-center justify-center text-lg font-bold text-white"
      >
        +
      </button>
    </div>
  );
}
