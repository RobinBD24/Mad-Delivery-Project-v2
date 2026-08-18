"use client";

import Link from "next/link";
import { useState } from "react";

import { useHomeCart } from "@/components/home/home-cart-context";
import { useTranslation } from "@/lib/i18n/use-translation";

/**
 * `signedIn` decides where the online-ordering CTA points. It matters because a
 * customer now LANDS here after logging in: sending an already-authenticated
 * customer to /login would be bounced straight back to "/" by the proxy, a dead
 * end at the exact step where they are trying to order. Signed in → continue
 * into the ordering flow; signed out → log in first, as before.
 */
export function CartDrawer({ signedIn = false }: { signedIn?: boolean }) {
  const { lines, count, total, isOpen, closeCart, setQty, remove, clear, cartBranchName } =
    useHomeCart();
  const { t, fmt } = useTranslation();
  const [confirmClear, setConfirmClear] = useState(false);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={closeCart} />
      <aside className="absolute inset-y-0 right-0 flex w-full max-w-100 flex-col border-l border-white/8 bg-[#111115] shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
          <h2 className="text-[1.1rem] font-bold text-white">
            {t("home.cart.title")}{" "}
            {count > 0 ? <span className="text-brand-500">({fmt.num(count)})</span> : null}
          </h2>
          <div className="flex items-center gap-2">
            {lines.length > 0 ? (
              confirmClear ? (
                <span className="flex items-center gap-1.5">
                  <span className="whitespace-nowrap text-[0.75rem] text-[#a0a0b0]">{t("home.cart.clearConfirm")}</span>
                  <button
                    onClick={() => {
                      clear();
                      setConfirmClear(false);
                    }}
                    className="h-7 rounded-md bg-brand-500 px-2.5 text-[0.72rem] font-bold text-white"
                  >
                    {t("home.cart.yes")}
                  </button>
                  <button
                    onClick={() => setConfirmClear(false)}
                    className="h-7 rounded-md border border-white/10 bg-surface-dark px-2.5 text-[0.72rem] font-bold text-white"
                  >
                    {t("home.cart.no")}
                  </button>
                </span>
              ) : (
                <button
                  onClick={() => setConfirmClear(true)}
                  className="flex h-8 items-center gap-1.5 rounded-lg border border-brand-500/30 bg-brand-500/10 px-2.5 text-[0.72rem] font-bold uppercase tracking-wide text-brand-500 hover:bg-brand-500/20"
                >
                  🗑 {t("home.cart.clearCart")}
                </button>
              )
            ) : null}
            <button
              onClick={closeCart}
              className="flex size-8 items-center justify-center rounded-lg border border-white/10 bg-surface-dark text-white hover:bg-[#23232e]"
              aria-label={t("home.cart.close")}
            >
              ✕
            </button>
          </div>
        </div>

        <div className="scrollbar-thin flex-1 space-y-2.5 overflow-y-auto p-4">
          {lines.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-[#606070]">
              <span className="text-4xl">🛒</span>
              <p>{t("home.cart.empty")}</p>
              <a href="#menu-section" onClick={closeCart} className="text-sm font-semibold text-brand-400 hover:underline">
                {t("home.cart.browseMenu")}
              </a>
            </div>
          ) : (
            lines.map((line) => (
              <div key={line.lineId} className="overflow-hidden rounded-[10px] border border-white/8 bg-surface-dark">
                <div className="flex items-start">
                  {line.image ? (
                    // PHASE C — the explicit intrinsic size reserves the box before
                    // the bytes arrive, so the drawer does not jump as each line
                    // image loads.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={line.image}
                      alt={line.name}
                      width={96}
                      height={96}
                      loading="lazy"
                      decoding="async"
                      className="size-24 shrink-0 bg-[#17171d] object-cover"
                    />
                  ) : (
                    <span className="flex size-24 shrink-0 items-center justify-center bg-[#17171d] text-3xl">
                      {line.emoji ?? "🍽️"}
                    </span>
                  )}
                  <div className="min-w-0 flex-1 px-3 py-2.5">
                    <p className="truncate text-[0.85rem] font-semibold text-white">{line.name}</p>
                    {line.variant ? <p className="mt-0.5 truncate text-[0.7rem] text-white/40">{line.variant}</p> : null}
                    <p className="mt-0.5 text-[0.75rem] text-[#a0a0b0]">
                      {t("home.cart.each", { price: fmt.money(line.unitPrice) })}
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-between border-t border-white/6 px-3 py-2.5">
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setQty(line.lineId, line.qty - 1)}
                      aria-label={t("home.modal.decreaseQty")}
                      className="flex size-9 items-center justify-center rounded-lg border border-white/10 bg-[#23232e] text-lg font-bold text-white"
                    >
                      −
                    </button>
                    <span className="min-w-5.5 text-center text-base font-extrabold text-brand-500">{fmt.num(line.qty)}</span>
                    <button
                      onClick={() => setQty(line.lineId, line.qty + 1)}
                      aria-label={t("home.modal.increaseQty")}
                      className="flex size-9 items-center justify-center rounded-lg border border-white/10 bg-[#23232e] text-lg font-bold text-white"
                    >
                      +
                    </button>
                  </div>
                  <div className="text-right">
                    <p className="text-[1.1rem] font-extrabold text-brand-500">{fmt.money(line.unitPrice * line.qty)}</p>
                    <button
                      onClick={() => remove(line.lineId)}
                      className="text-[0.65rem] text-[#606070] hover:text-red-400"
                    >
                      ✕ {t("home.cart.remove")}
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="border-t border-white/8 px-5 py-4">
          {/* The branch this order belongs to. One cart = one branch, so saying
              which one is the difference between a clear order and a surprise
              at checkout. */}
          {cartBranchName ? (
            <p className="mb-2.5 text-[0.78rem] text-[#a0a0b0]" data-testid="cart-branch">
              {t("cartBranch.orderingFrom")}{" "}
              <span className="font-semibold text-white">{cartBranchName}</span>
            </p>
          ) : null}
          <div className="mb-3.5 flex items-center justify-between">
            <span className="text-[0.88rem] text-[#a0a0b0]">{t("home.cart.total")}</span>
            <span className="font-display text-[1.6rem] font-extrabold text-brand-500">{fmt.money(total)}</span>
          </div>
          <a
            href="tel:09638050505"
            className="mb-2 flex w-full items-center justify-center gap-2 rounded-[10px] bg-brand-500 py-3.25 text-[0.92rem] font-bold text-white hover:bg-brand-600"
          >
            📞 {t("home.cart.callForOrder", { phone: "09638-050505" })}
          </a>
          <Link
            href={signedIn ? "/customer/branches" : "/login"}
            onClick={closeCart}
            className="flex w-full items-center justify-center rounded-[10px] border border-white/12 py-3 text-sm font-semibold text-white hover:border-brand-500"
            data-testid="cart-order-cta"
          >
            {t(signedIn ? "home.cart.continueToOrder" : "home.cart.loginToOrder")}
          </Link>
        </div>
      </aside>
    </div>
  );
}
