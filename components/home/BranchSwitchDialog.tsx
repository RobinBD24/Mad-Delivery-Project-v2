"use client";

import { useHomeCart } from "@/components/home/home-cart-context";
import { useTranslation } from "@/lib/i18n/use-translation";

/**
 * Confirmation shown when an add is refused because the cart already belongs to
 * a different branch.
 *
 * One order belongs to one branch, so the first item added locks the cart. The
 * alternative — silently dropping the item, or silently mixing branches — either
 * loses the customer's action or builds a cart the server will reject at
 * checkout. This asks, names both branches, and offers the only two outcomes
 * that make sense: clear and switch, or cancel.
 *
 * Styled for the storefront's dark palette; the dashboard `ConfirmModal` is a
 * light-theme component and would look foreign here.
 */
export function BranchSwitchDialog() {
  const { pendingBranchSwitch, confirmBranchSwitch, cancelBranchSwitch } = useHomeCart();
  const { t } = useTranslation();

  if (!pendingBranchSwitch) return null;
  const { currentBranchName, nextBranchName, input } = pendingBranchSwitch;

  return (
    <div
      className="fixed inset-0 z-60 flex items-center justify-center p-4"
      data-testid="branch-switch-dialog"
    >
      <div className="absolute inset-0 bg-black/85 backdrop-blur-md" onClick={cancelBranchSwitch} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="branch-switch-title"
        className="relative w-full max-w-md rounded-[16px] border border-white/10 bg-[#16161E] p-5 shadow-2xl"
      >
        <h2 id="branch-switch-title" className="font-display text-[1.15rem] font-extrabold text-white">
          {t("cartBranch.switchTitle")}
        </h2>
        <p className="mt-2 text-[0.88rem] leading-6 text-[#a0a0b0]">
          {t("cartBranch.switchBody", {
            current: currentBranchName,
            next: nextBranchName,
            product: input.name,
          })}
        </p>
        <div className="mt-5 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={cancelBranchSwitch}
            data-testid="branch-switch-cancel"
            className="rounded-[10px] border border-white/12 px-4 py-2.5 text-sm font-semibold text-white hover:border-white/30"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            onClick={confirmBranchSwitch}
            data-testid="branch-switch-confirm"
            className="rounded-[10px] bg-brand-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-600"
          >
            {t("cartBranch.clearAndSwitch")}
          </button>
        </div>
      </div>
    </div>
  );
}
