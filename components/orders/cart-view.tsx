"use client";

import Image from "next/image";
import Link from "next/link";

import { Button, ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { cartLineKey, useCart } from "@/lib/hooks/use-cart";
import { useTranslation } from "@/lib/i18n/use-translation";
import { mediaUrl } from "@/lib/utils";

/** Cart page body: items, quantities, per-item notes, total, checkout link. */
export function CartView() {
  const { t, fmt } = useTranslation();
  const { cart, total, updateQuantity, updateNote, removeItem, clearCart } = useCart();

  if (cart.items.length === 0) {
    return (
      <EmptyState
        title={t("orders.cartEmpty")}
        description={t("orders.cartEmptyDesc")}
        action={<ButtonLink href="/customer/branches">{t("orders.viewRestaurants")}</ButtonLink>}
      />
    );
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-fg-muted">
        {t("orders.branch")}: <span className="font-semibold text-fg-base">{cart.branchName}</span>
      </p>

      <div className="divide-y divide-border-base rounded-2xl border border-border-base/80 bg-surface-card shadow-card">
        {cart.items.map((item) => {
          const image = mediaUrl(item.image);
          const key = cartLineKey(item);
          return (
            <div key={key} className="flex flex-wrap items-center gap-4 p-4">
              {image ? (
                <Image src={image} alt={item.name} width={56} height={56} className="size-14 rounded-xl object-cover" />
              ) : (
                <span className="flex size-14 items-center justify-center rounded-xl bg-surface-muted text-2xl">🍛</span>
              )}
              <div className="min-w-40 flex-1">
                <p className="font-semibold text-fg-base">
                  {item.name}
                  {item.variationName ? <span className="text-fg-muted"> · {item.variationName}</span> : null}
                </p>
                <p className="text-sm text-fg-muted">{fmt.money(item.unitPrice)}</p>
              </div>
              <div className="flex items-center rounded-xl border border-border-base">
                <button
                  className="px-3 py-1.5 text-fg-muted hover:text-brand-600"
                  onClick={() => updateQuantity(key, item.quantity - 1)}
                >
                  −
                </button>
                <span className="min-w-8 text-center text-sm font-semibold">{fmt.num(item.quantity)}</span>
                <button
                  className="px-3 py-1.5 text-fg-muted hover:text-brand-600"
                  onClick={() => updateQuantity(key, item.quantity + 1)}
                >
                  +
                </button>
              </div>
              <p className="w-24 text-right font-semibold text-fg-base">
                {fmt.money(item.unitPrice * item.quantity)}
              </p>
              <button className="text-sm text-red-500 hover:underline" onClick={() => removeItem(key)}>
                {t("common.delete")}
              </button>
              <Input
                className="w-full"
                placeholder={t("orders.itemNotePlaceholder")}
                value={item.foodNote}
                onChange={(e) => updateNote(key, e.target.value)}
              />
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border-base/80 bg-surface-card p-5 shadow-card">
        <div>
          <p className="text-sm text-fg-muted">{t("orders.grandTotal")}</p>
          <p className="text-2xl font-bold text-brand-600">{fmt.money(total)}</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={clearCart}>
            {t("orders.clearCart")}
          </Button>
          <ButtonLink href="/customer/checkout" size="lg">
            {t("orders.proceedCheckout")}
          </ButtonLink>
        </div>
      </div>

      <p className="text-center text-sm text-fg-muted">
        {t("orders.wantMore")}{" "}
        <Link href={`/customer/branches/${cart.branchId}/menu`} className="font-medium text-brand-600 hover:underline">
          {t("orders.backToMenu")}
        </Link>
      </p>
    </div>
  );
}
