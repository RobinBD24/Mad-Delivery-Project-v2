"use client";

import { useEffect, useState } from "react";

import { useHomeCart, type LastAdded } from "@/components/home/home-cart-context";
import { useTranslation } from "@/lib/i18n/use-translation";
import { cn } from "@/lib/utils";

function ToastBody({ added, onDone }: { added: LastAdded; onDone: () => void }) {
  const { t, fmt } = useTranslation();
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const hide = setTimeout(() => setLeaving(true), 2200);
    const done = setTimeout(() => onDone(), 2550);
    return () => {
      clearTimeout(hide);
      clearTimeout(done);
    };
  }, [onDone]);

  return (
    <div
      className={cn("pointer-events-none fixed bottom-22 left-1/2 z-70", leaving ? "home-toast-leaving" : "home-toast")}
      role="status"
      aria-live="polite"
    >
      <div
        className="flex max-w-80 items-center gap-2.5 rounded-[14px] border px-4 py-2.75 backdrop-blur-lg"
        style={{
          background: "rgba(22,22,30,0.97)",
          borderColor: "rgba(74,222,128,0.25)",
          boxShadow: "0 8px 36px rgba(0,0,0,0.65), 0 0 0 1px rgba(74,222,128,0.08)",
        }}
      >
        <span
          className="flex size-7 shrink-0 items-center justify-center rounded-full text-[0.8rem] font-extrabold text-[#4ade80]"
          style={{ background: "rgba(74,222,128,0.15)", border: "1.5px solid #4ade80" }}
        >
          ✓
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[0.72rem] font-bold uppercase tracking-wide text-[#4ade80]">
            {t("home.toast.addedToCart")}
          </span>
          <span className="block truncate text-[0.82rem] font-semibold text-white">
            {added.qty > 1 ? <span className="mr-1 text-[#4ade80]">{fmt.num(added.qty)}×</span> : null}
            {added.name}
          </span>
        </span>
        <span className="shrink-0 font-display text-[1.05rem] font-extrabold text-[#4ade80]">
          {fmt.money(added.unitPrice * added.qty)}
        </span>
      </div>
    </div>
  );
}

/** Green "Added to cart" toast (bottom-center), auto-dismisses after ~2.5s. */
export function CartToast() {
  const { lastAdded, dismissToast } = useHomeCart();
  if (!lastAdded) return null;
  // Keyed by seq so repeated adds restart the enter/leave cycle cleanly.
  return <ToastBody key={lastAdded.seq} added={lastAdded} onDone={dismissToast} />;
}
