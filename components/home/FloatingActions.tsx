"use client";

import { useHomeCart } from "@/components/home/home-cart-context";
import { useTranslation } from "@/lib/i18n/use-translation";

/**
 * Mobile-only floating actions, matching the reference design: a red
 * "📞 Order Now" pill while the cart is empty, replaced by a full-width
 * "View Cart" bar once items are added. Hidden on desktop (cart lives in nav).
 */
export function FloatingActions() {
  const { count, total, openCart } = useHomeCart();
  const { t, fmt } = useTranslation();

  if (count === 0) {
    return (
      <a
        href="tel:09638050505"
        aria-label={t("home.floating.orderNow")}
        className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full bg-brand-500 px-6 py-3 text-sm font-bold text-white shadow-[0_8px_32px_rgba(232,25,44,0.4)] md:hidden"
        style={{ marginBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        📞 {t("home.floating.orderNow")}
      </a>
    );
  }

  return (
    <div
      className="fixed inset-x-3 bottom-3 z-40 md:hidden"
      style={{ marginBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <button
        onClick={openCart}
        aria-label={t("home.floating.openCart")}
        className="flex w-full items-center justify-between rounded-2xl bg-brand-500 px-4.5 py-3.25 text-white shadow-[0_8px_32px_rgba(232,25,44,0.45)]"
      >
        <span className="flex items-center gap-2.5">
          <span className="flex size-7 items-center justify-center rounded-full bg-white/25 text-[0.75rem] font-black">
            {fmt.num(count)}
          </span>
          <span className="text-[0.95rem] font-bold">{t("home.floating.viewCart")}</span>
        </span>
        <span className="font-display text-[1.2rem] font-black" style={{ letterSpacing: "0.5px" }}>
          {fmt.money(total)}
        </span>
      </button>
    </div>
  );
}
