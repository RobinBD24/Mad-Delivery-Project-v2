"use client";

import { useState } from "react";
import Image from "next/image";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useCart } from "@/lib/hooks/use-cart";
import { useTranslation } from "@/lib/i18n/use-translation";
import { mediaUrl } from "@/lib/utils";
import type { Product } from "@/types";

/** Customer menu card with quantity picker + add-to-cart. */
export function MenuProductCard({
  product,
  branchId,
  branchName,
}: {
  product: Product;
  branchId: number;
  branchName: string;
}) {
  const { t, fmt } = useTranslation();
  const { addItem, clearCart } = useCart();
  const [quantity, setQuantity] = useState(1);
  const [conflict, setConflict] = useState(false);
  const [added, setAdded] = useState(false);

  // Only enabled variations are purchasable.
  const variations = product.variations.filter((v) => v.is_enabled);
  const defaultVariationId =
    product.default_variation_id && variations.some((v) => v.id === product.default_variation_id)
      ? product.default_variation_id
      : variations[0]?.id ?? null;
  const [variationId, setVariationId] = useState<number | null>(defaultVariationId);
  const selected = variations.find((v) => v.id === variationId) ?? variations[0];

  // req #4 — crust policy. THICK/THIN products have a single fixed crust (no
  // choice to make); BOTH requires the customer to pick before adding to cart.
  const policy = product.variation_type ?? "THICK";
  const mustChoose = policy === "BOTH";
  const [crust, setCrust] = useState<string>(mustChoose ? "" : policy);
  const [crustError, setCrustError] = useState(false);

  const discountPct = Number(product.discount);
  const hasDiscount = discountPct > 0;
  const image = mediaUrl(product.image);

  // Effective unit price = selected variation price minus product discount %.
  const baseUnit = selected ? Number(selected.price) : Number(product.price);
  const unitPrice = hasDiscount ? baseUnit - (baseUnit * discountPct) / 100 : baseUnit;

  function add() {
    if (mustChoose && !crust) {
      setCrustError(true);
      return;
    }
    setCrustError(false);
    const result = addItem(branchId, branchName, {
      productId: product.id,
      variationId: selected?.id ?? null,
      variationType: crust,
      variationName: selected?.name ?? "",
      name: product.name,
      unitPrice: Number(unitPrice.toFixed(2)),
      quantity,
      foodNote: "",
      image: product.image,
    });
    if (result === "branch-conflict") {
      setConflict(true);
      return;
    }
    setAdded(true);
    setTimeout(() => setAdded(false), 1500);
  }

  return (
    <div
      data-testid={`product-card-${product.id}`}
      className="flex flex-col overflow-hidden rounded-2xl border border-border-base/80 bg-surface-card shadow-card transition-shadow hover:shadow-card-hover"
    >
      <div className="relative h-36 bg-surface-muted">
        {image ? (
          <Image src={image} alt={product.name} fill className="object-cover" sizes="(max-width: 640px) 100vw, 300px" />
        ) : (
          <div className="flex h-full items-center justify-center text-4xl">🍛</div>
        )}
        <div className="absolute left-3 top-3 flex gap-1.5">
          {product.is_popular ? <Badge tone="brand">{t("catalog.popular")}</Badge> : null}
          {hasDiscount ? <Badge tone="green">-{fmt.num(Math.round(Number(product.discount)))}%</Badge> : null}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <div>
          <h3 className="font-semibold text-fg-base">{product.name}</h3>
          {product.description ? (
            <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-fg-muted">{product.description}</p>
          ) : null}
        </div>
        {variations.length > 1 ? (
          <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("catalog.variations")}>
            {variations.map((v) => (
              <button
                key={v.id}
                type="button"
                data-testid="menu-variation"
                onClick={() => setVariationId(v.id)}
                className={
                  "rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors " +
                  (v.id === selected?.id
                    ? "border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300"
                    : "border-border-base text-fg-muted hover:border-brand-300")
                }
              >
                {v.name} · {fmt.money(v.price)}
              </button>
            ))}
          </div>
        ) : null}

        {/* req #4 — crust. BOTH lets the customer choose (required before adding);
            a fixed THICK/THIN product shows its single crust, and the server
            rejects any other value regardless of what the client sends. */}
        {mustChoose ? (
          <div data-testid="crust-choice">
            <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("variationType.chooseCrust")}>
              {(["THICK", "THIN"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  data-testid={`crust-${option}`}
                  aria-pressed={crust === option}
                  onClick={() => {
                    setCrust(option);
                    setCrustError(false);
                  }}
                  className={
                    "rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors " +
                    (crust === option
                      ? "border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300"
                      : "border-border-base text-fg-muted hover:border-brand-300")
                  }
                >
                  {t(`variationType.${option}`)}
                </button>
              ))}
            </div>
            {crustError ? (
              <p className="mt-1 text-xs font-medium text-red-600" data-testid="crust-error">
                {t("variationType.required")}
              </p>
            ) : null}
          </div>
        ) : (
          <p className="text-xs text-fg-subtle" data-testid="crust-fixed">
            {t(`variationType.${policy}`)}
          </p>
        )}

        <div className="mt-auto flex items-center justify-between">
          <div>
            <p className="text-lg font-bold text-brand-600" data-testid="menu-price">
              {fmt.money(unitPrice.toFixed(2))}
            </p>
            {hasDiscount ? (
              <p className="text-xs text-fg-subtle line-through">{fmt.money(baseUnit.toFixed(2))}</p>
            ) : null}
          </div>
          <p className="text-xs text-fg-subtle">⏱ {fmt.num(product.preparation_time)} {t("catalog.minutes")}</p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-xl border border-border-base">
            <button
              className="px-3 py-1.5 text-fg-muted hover:text-brand-600"
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              aria-label={t("catalog.decrease")}
            >
              −
            </button>
            <span className="min-w-8 text-center text-sm font-semibold">{fmt.num(quantity)}</span>
            <button
              className="px-3 py-1.5 text-fg-muted hover:text-brand-600"
              onClick={() => setQuantity((q) => Math.min(50, q + 1))}
              aria-label={t("catalog.increase")}
            >
              +
            </button>
          </div>
          <Button size="sm" className="flex-1" onClick={add} data-testid="menu-add">
            {added ? `✓ ${t("catalog.added")}` : t("catalog.addToCart")}
          </Button>
        </div>
      </div>

      {conflict ? (
        <div className="border-t border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          {t("catalog.branchConflict")}
          <button
            className="ml-1 font-semibold text-brand-600 hover:underline"
            onClick={() => {
              clearCart();
              setConflict(false);
            }}
          >
            {t("catalog.clearCart")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
