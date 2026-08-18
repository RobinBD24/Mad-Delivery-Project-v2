"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { useHomeCart } from "@/components/home/home-cart-context";
import { ModalActionBar } from "@/components/home/item-modal/modal-action-bar";
import { OptionGroup } from "@/components/home/item-modal/option-group";
import { ProductImagePanel } from "@/components/home/item-modal/product-image-panel";
import { SizeOptionCard } from "@/components/home/item-modal/size-option-card";
import type { MenuItem } from "@/lib/home/types";
import { useTranslation } from "@/lib/i18n/use-translation";

/** Badge tint per menu group (mirrors ProductCard / reference design). */
/** Badge tint. Keyed by the product's DATABASE flags, so there are exactly two. */
const CLASS_TONE: Record<string, { bg: string; color: string; border: string }> = {
  popular: { bg: "rgba(245,166,35,0.15)", color: "#F5A623", border: "rgba(245,166,35,0.3)" },
  recommended: { bg: "rgba(74,222,128,0.12)", color: "#4ade80", border: "rgba(74,222,128,0.25)" },
};

const FOCUSABLE = 'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * Product customization modal, rebuilt 1:1 from the reference design
 * (static_design/landing): desktop two-panel dialog (photo left / options
 * right, sticky action bar), mobile bottom sheet. Pizza: about + ingredient
 * chips + size cards; burgers: bun / sauce / add-ons; wings: size + flavour.
 */
export function ItemModal({ item, onClose }: { item: MenuItem; onClose: () => void }) {
  const { add } = useHomeCart();
  const { t, fmt } = useTranslation();
  const isMad = item.brand === "madchef";
  const accent = isMad ? "#e8192c" : "#F5A623";

  const defaultSize = item.sizes?.some((s) => s.key === "14in") ? "14in" : (item.sizes?.[0]?.key ?? "");
  const [sizeKey, setSizeKey] = useState(defaultSize);
  const [option, setOption] = useState(item.options?.[0] ?? "");
  const [choices, setChoices] = useState<Record<string, string>>(
    Object.fromEntries((item.choiceGroups ?? []).map((g) => [g.key, g.options[0]])),
  );
  const [addOns, setAddOns] = useState<Set<string>>(new Set());
  const [qty, setQty] = useState(1);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const dialogRef = useRef<HTMLDivElement>(null);
  const sizeGroupRef = useRef<HTMLDivElement>(null);
  const titleId = `item-modal-title-${item.id}`;

  // Focus management: remember the trigger, trap Tab inside, restore on close.
  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    dialog?.querySelector<HTMLElement>(FOCUSABLE)?.focus();

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab" || !dialog) return;
      const nodes = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (el) => el.offsetParent !== null,
      );
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !dialog.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      trigger?.focus?.();
    };
  }, [onClose]);

  const size = item.sizes?.find((s) => s.key === sizeKey);

  const unitPrice = useMemo(() => {
    const base = size?.price ?? item.price;
    const extras = (item.addOns ?? [])
      .filter((a) => addOns.has(a.name))
      .reduce((s, a) => s + a.price, 0);
    return base + extras;
  }, [size, item.price, item.addOns, addOns]);

  const handleAdd = () => {
    // Validate required selections (defaults normally cover these).
    const nextErrors: Record<string, string> = {};
    if (item.sizes?.length && !size) nextErrors.size = t("home.modal.selectSize");
    for (const group of item.choiceGroups ?? []) {
      if (!choices[group.key]) nextErrors[group.key] = t("home.modal.selectionRequired");
    }
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      sizeGroupRef.current?.scrollIntoView({ block: "center" });
      return;
    }

    const parts: string[] = [];
    if (size) parts.push(size.label.split(" –")[0]);
    for (const group of item.choiceGroups ?? []) {
      const picked = choices[group.key];
      // Skip defaults so simple picks don't bloat the variant label.
      if (picked && picked !== group.options[0]) parts.push(picked);
    }
    if (option) parts.push(option);
    const selectedAddOns = (item.addOns ?? []).filter((a) => addOns.has(a.name)).map((a) => a.name);
    if (selectedAddOns.length) parts.push(`+ ${selectedAddOns.join(", ")}`);

    add({
      id: item.id,
      name: item.name,
      brand: item.brand,
      branchId: item.branchId,
      branchName: item.branchName,
      unitPrice,
      qty,
      image: item.image,
      variant: parts.join(" · ") || undefined,
    });
    onClose();
  };

  // The category's own name from the database (`item.group`), not a lookup
  // against a fixed key set — an admin-created category has no translation key.
  const categoryLabel = (item.group ?? "").toUpperCase();
  const eyebrow = `${item.emoji ?? "🍽️"} ${isMad ? "MADCHEF" : "CHEEZ!"} ${categoryLabel}`.trim();
  const badgeLabel = item.badgeKey ? t(`home.product.badge.${item.badgeKey}`) : null;
  const tone = item.badgeKey ? CLASS_TONE[item.badgeKey] : undefined;
  // Reference design: ingredient chips = about parts + the class chip.
  const ingredientChips = item.about
    ? [...item.about.split("+").map((p) => p.trim()).filter(Boolean), ...(badgeLabel ? [badgeLabel] : [])]
    : [];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-black/85 backdrop-blur-md" onClick={onClose} aria-hidden />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="animate-modal-in relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-[20px] bg-[#16161E] shadow-2xl sm:m-4 sm:max-w-4xl sm:flex-row sm:rounded-[20px] sm:border sm:border-white/10"
      >
        {/* Drag handle (mobile) */}
        <div className="flex justify-center pb-1 pt-2.5 sm:hidden">
          <span className="h-1 w-10 rounded-full bg-white/20" />
        </div>

        <ProductImagePanel image={item.image} name={item.name} description={item.description} />

        {/* Content panel */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="scrollbar-thin flex-1 overflow-y-auto p-4.5 sm:p-6">
            <div className="mb-2.5 flex items-center justify-between gap-3">
              <p className="text-[0.68rem] font-bold uppercase tracking-widest" style={{ color: accent }}>
                {eyebrow}
              </p>
              <button
                type="button"
                onClick={onClose}
                aria-label={t("home.modal.close")}
                className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-surface-dark text-white hover:bg-[#23232e]"
              >
                ✕
              </button>
            </div>

            <h2 id={titleId} className="font-display text-[1.7rem] font-black leading-tight text-white">
              {item.name}
            </h2>
            <p className="mt-1 font-display text-[1.3rem] font-extrabold" style={{ color: accent }}>
              {item.fromPrice || item.sizes?.length ? `${t("home.product.from")} ` : ""}
              {fmt.money(item.sizes?.length ? Math.min(...item.sizes.map((s) => s.price)) : item.price)}
            </p>

            {(badgeLabel && tone) || item.spicy ? (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {badgeLabel && tone ? (
                  <span
                    className="rounded-full border px-2.5 py-0.75 text-[0.68rem] font-bold uppercase tracking-wide"
                    style={{ background: tone.bg, color: tone.color, borderColor: tone.border }}
                  >
                    {badgeLabel}
                  </span>
                ) : null}
                {item.spicy ? (
                  <span className="rounded-[5px] bg-[#E8192C] px-2.5 py-0.75 text-[0.65rem] font-extrabold uppercase tracking-wide text-white">
                    {t("home.product.spicy")}
                  </span>
                ) : null}
              </div>
            ) : null}

            <p className="mt-3 text-[0.82rem] italic leading-6 text-[#a0a0b0] sm:hidden">{item.description}</p>

            {item.about ? (
              <div className="mt-4">
                <p className="mb-1.5 text-[0.68rem] font-bold uppercase tracking-widest text-[#606070]">
                  {t("home.modal.about")}
                </p>
                <p className="text-[0.82rem] leading-6 text-[#a0a0b0]">{item.about}</p>
              </div>
            ) : null}

            {ingredientChips.length > 0 ? (
              <div className="mt-4">
                <p className="mb-2 text-[0.68rem] font-bold uppercase tracking-widest text-[#606070]">
                  🏷️ {t("home.modal.ingredients")}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {ingredientChips.map((part) => (
                    <span
                      key={part}
                      className="rounded-full border border-white/10 bg-surface-dark px-2.5 py-1 text-[0.72rem] text-[#a0a0b0]"
                    >
                      {part}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            {item.sizes && item.sizes.length > 0 ? (
              <OptionGroup ref={sizeGroupRef} title={t("home.modal.sizesPrices")} emoji="📐" error={errors.size}>
                {item.sizes.map((s) => (
                  <SizeOptionCard
                    key={s.key}
                    label={s.label}
                    sub={s.sub}
                    price={fmt.money(s.price)}
                    active={s.key === sizeKey}
                    accent={accent}
                    onSelect={() => {
                      setSizeKey(s.key);
                      setErrors((prev) => ({ ...prev, size: "" }));
                    }}
                  />
                ))}
              </OptionGroup>
            ) : null}

            {(item.choiceGroups ?? []).map((group) => (
              <OptionGroup
                key={group.key}
                title={t(`home.modal.groups.${group.label}`)}
                emoji={group.emoji}
                error={errors[group.key]}
              >
                {group.options.map((opt) => (
                  <SizeOptionCard
                    key={opt}
                    label={opt}
                    active={choices[group.key] === opt}
                    accent={accent}
                    onSelect={() => {
                      setChoices((prev) => ({ ...prev, [group.key]: opt }));
                      setErrors((prev) => ({ ...prev, [group.key]: "" }));
                    }}
                  />
                ))}
              </OptionGroup>
            ))}

            {item.options && item.options.length > 0 ? (
              <OptionGroup title={t("home.modal.chooseFlavour")}>
                {item.options.map((opt) => (
                  <SizeOptionCard
                    key={opt}
                    label={opt}
                    active={opt === option}
                    accent={accent}
                    onSelect={() => setOption(opt)}
                  />
                ))}
              </OptionGroup>
            ) : null}

            {item.addOns && item.addOns.length > 0 ? (
              <div className="mt-4.5">
                <p className="mb-2 text-[0.68rem] font-bold uppercase tracking-widest text-[#606070]">
                  ＋ {t("home.modal.addOns")}
                </p>
                <div className="flex flex-col gap-1.75">
                  {item.addOns.map((a) => {
                    const active = addOns.has(a.name);
                    return (
                      <button
                        key={a.name}
                        type="button"
                        role="checkbox"
                        aria-checked={active}
                        onClick={() =>
                          setAddOns((prev) => {
                            const next = new Set(prev);
                            if (next.has(a.name)) next.delete(a.name);
                            else next.add(a.name);
                            return next;
                          })
                        }
                        className="flex w-full items-center justify-between gap-3 rounded-[10px] border px-3 py-2.75 text-left transition-colors"
                        style={{
                          borderColor: active ? accent : "rgba(255,255,255,0.07)",
                          background: active ? `${accent}14` : "#1c1c24",
                        }}
                      >
                        <span className="flex items-center gap-2.5">
                          <span
                            aria-hidden
                            className="flex size-4 shrink-0 items-center justify-center rounded border text-[0.6rem] font-bold"
                            style={{
                              borderColor: active ? accent : "#606070",
                              background: active ? accent : "transparent",
                              color: active ? "#fff" : "transparent",
                            }}
                          >
                            ✓
                          </span>
                          <span className="text-[0.82rem] font-semibold text-white">{a.name}</span>
                        </span>
                        <span className="text-[0.8rem] font-semibold text-[#a0a0b0]">+{fmt.money(a.price)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>

          <ModalActionBar qty={qty} onQtyChange={setQty} total={unitPrice * qty} accent={accent} onAdd={handleAdd} />
        </div>
      </div>
    </div>
  );
}
