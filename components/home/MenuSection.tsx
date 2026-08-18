"use client";

import { useMemo, useState } from "react";
import Image from "next/image";

import { CategoryTabs } from "@/components/home/CategoryTabs";
import { useHomeCart } from "@/components/home/home-cart-context";
import { ItemModal } from "@/components/home/ItemModal";
import { ProductCard } from "@/components/home/ProductCard";
import type { Brand, CategoryKey, MenuItem, PublicCategory } from "@/lib/home/types";
import { useTranslation } from "@/lib/i18n/use-translation";
import { cn } from "@/lib/utils";

function BrandTab({
  label,
  logo,
  count,
  active,
  activeColor,
  onClick,
}: {
  label: string;
  logo: string;
  count: string;
  active: boolean;
  activeColor: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="-mb-px flex items-center gap-2 whitespace-nowrap px-5 py-3.5 text-[0.9rem] font-semibold transition-colors"
      style={{
        color: active ? "#f0f0f2" : "#a0a0b0",
        borderBottom: `3px solid ${active ? activeColor : "transparent"}`,
      }}
    >
      <Image
        src={logo}
        alt={label}
        width={26}
        height={26}
        className="size-6.5 shrink-0 rounded object-contain"
      />
      {label}
      <span
        className="rounded-full border border-white/10 px-1.75 py-0.5 text-[0.7rem] font-bold"
        style={{
          background: active ? "rgba(232,25,44,0.12)" : "#1c1c24",
          color: active ? activeColor : "#606070",
        }}
      >
        {count}
      </span>
    </button>
  );
}

/**
 * The storefront menu. Data comes from the DATABASE via lib/services/public-catalog
 * and is handed in as props by the server component — this file used to import a
 * hardcoded `MENU_ITEMS` array, so nothing it rendered could be managed in the
 * admin panel. Only the data source changed; the markup and styling below are
 * exactly as they were.
 */
export function MenuSection({
  branchCount,
  categories: allCategories,
  items,
  emptyMessage,
}: {
  branchCount: number;
  categories: PublicCategory[];
  items: MenuItem[];
  /**
   * Overrides the "no items matched" copy. A signed-in customer sees ONE
   * branch's catalogue, so an empty grid means "this branch has nothing right
   * now" — a different fact from "your search matched nothing", and it must not
   * read as an invitation to search harder.
   */
  emptyMessage?: string;
}) {
  const { t, fmt } = useTranslation();
  const { brand, setBrand: setBrandState } = useHomeCart();
  const [active, setActive] = useState<CategoryKey | "all">("all");
  const [query, setQuery] = useState("");
  const [configItem, setConfigItem] = useState<MenuItem | null>(null);

  const CRUST_GUIDE = [
    { size: '8" THICK / THIN', desc: t("home.menu.crust1Desc"), tag: t("home.menu.crust1Tag"), color: "#a78bfa" },
    { size: '14" THICK CRUST', desc: t("home.menu.crust2Desc"), tag: t("home.menu.availableForDelivery"), color: "#f5a623" },
    { size: '12" & 16" THIN CRUST', desc: t("home.menu.crust3Desc"), tag: t("home.menu.availableForDelivery"), color: "#60a5fa" },
  ];

  const branchesChip = t("home.menu.branchesCount", { n: fmt.num(branchCount) });
  const BRAND_META: Record<Brand, {
    logo: string;
    name: string;
    tagline: string;
    chips: string[];
    placeholder: string;
  }> = {
    cheez: {
      logo: "/images/brand/cheez-logo.webp",
      name: "Cheez! Pizza",
      tagline: t("home.menu.cheezTagline"),
      chips: [`🍕 ${t("home.menu.pizzaSpecialist")}`, `🏪 ${branchesChip}`, "📞 09638-050505", `⏰ ${t("home.menu.openDaily")}`],
      placeholder: t("home.menu.cheezPlaceholder"),
    },
    madchef: {
      logo: "/images/brand/madchef-logo.webp",
      name: "Madchef",
      tagline: t("home.menu.madchefTagline"),
      chips: [`🔥 ${t("home.menu.gourmetKitchen")}`, `🏪 ${branchesChip}`, "📞 09638-050505", `⏰ ${t("home.menu.openDaily")}`],
      placeholder: t("home.menu.madchefPlaceholder"),
    },
  };

  const isMad = brand === "madchef";
  const accent = isMad ? "#e8192c" : "#f5a623";
  const accentText = isMad ? "text-brand-500" : "text-cheez-gold";
  const meta = BRAND_META[brand];
  const categories = useMemo(
    () => allCategories.filter((c) => c.brand === brand),
    [allCategories, brand],
  );
  // The tab chip used to show the BRANCH count, identical on both tabs, so a
  // customer could not tell that the other brand was the one holding products.
  // Counted from the same `items` the grid renders, so the number can never
  // disagree with what a click reveals.
  const brandCounts = useMemo(() => {
    const counts: Record<Brand, number> = { cheez: 0, madchef: 0 };
    for (const item of items) counts[item.brand] += 1;
    return counts;
  }, [items]);

  // True when the catalogue spans more than one branch — i.e. a super admin
  // browsing every branch. A customer's catalogue is always one branch.
  const multiBranch = useMemo(
    () => new Set(items.map((i) => i.branchId).filter((v) => v != null)).size > 1,
    [items],
  );

  const activeIsPizza = useMemo(
    () => categories.some((c) => c.key === active && /pizza/i.test(c.label)),
    [categories, active],
  );

  const setBrand = (b: Brand) => {
    setBrandState(b);
    setActive("all");
    setQuery("");
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      if (item.brand !== brand) return false;
      const matchCat = active === "all" || item.category === active;
      const matchQ = !q || item.name.toLowerCase().includes(q) || item.description.toLowerCase().includes(q);
      return matchCat && matchQ;
    });
  }, [items, brand, active, query]);

  // Group results by category → optional sub-group, preserving menu order.
  const grouped = useMemo(() => {
    const out: { key: string; label: string; items: MenuItem[] }[] = [];
    for (const cat of categories) {
      const catItems = filtered.filter((i) => i.category === cat.key);
      if (catItems.length === 0) continue;
      const groups = new Map<string, MenuItem[]>();
      for (const item of catItems) {
        const g = item.group ?? cat.label;
        if (!groups.has(g)) groups.set(g, []);
        groups.get(g)!.push(item);
      }
      for (const [label, items] of groups) {
        out.push({ key: `${cat.key}-${label}`, label, items });
      }
    }
    return out;
  }, [filtered, categories]);

  return (
    <section id="menu-section" className="scroll-mt-14 bg-[#0c0c0e] md:scroll-mt-18">
      {/* Brand toggle — sticky full-width underline tab bar (below the sticky nav) */}
      <div className="sticky top-14 z-30 border-y border-white/10 bg-[#111115] md:top-18">
        <div className="scrollbar-thin mx-auto flex max-w-300 items-center overflow-x-auto px-4">
          <BrandTab
            label="Cheez! Pizza"
            logo="/images/brand/cheez-logo.webp"
            count={t("home.menu.itemsCount", { n: fmt.num(brandCounts.cheez) })}
            active={brand === "cheez"}
            activeColor="#f5a623"
            onClick={() => setBrand("cheez")}
          />
          <span className="mx-1 h-5 w-px shrink-0 bg-white/10" />
          <BrandTab
            label="Madchef"
            logo="/images/brand/madchef-logo.webp"
            count={t("home.menu.itemsCount", { n: fmt.num(brandCounts.madchef) })}
            active={brand === "madchef"}
            activeColor="#e8192c"
            onClick={() => setBrand("madchef")}
          />
        </div>
      </div>

      {/* Brand header band */}
      <div className="border-b border-white/8 bg-[#111115] px-4 pt-8">
        <div className="mx-auto flex max-w-300 flex-wrap items-end gap-3 sm:gap-6 sm:px-2">
          <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-2 border-white/12 bg-[#23232e] sm:size-20">
            <Image src={meta.logo} alt={meta.name} width={80} height={80} className="size-full object-cover" />
          </div>
          <div className="min-w-0 flex-1 pb-5">
            {/* PHASE B — this brand name IS the menu section's heading, so it
                is marked up as one. Without it the page jumped h1 → h3 and the
                category headings below had no parent level. Styling unchanged. */}
            <h2
              className="font-display text-[1.6rem] font-black text-white sm:text-[2.2rem]"
              style={{ letterSpacing: "1px", lineHeight: 1 }}
            >
              {meta.name}
            </h2>
            <p className="mb-2.5 mt-1.5 text-[0.9rem] text-[#a0a0b0]">{meta.tagline}</p>
            <div className="flex flex-wrap gap-2">
              {meta.chips.map((c, i) => (
                <span
                  key={c}
                  className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.25 text-[0.78rem] font-medium"
                  style={{
                    background: "#1c1c24",
                    borderColor: i === 2 ? "rgba(232,25,44,0.3)" : "rgba(255,255,255,0.1)",
                    color: i === 2 ? "#e8192c" : "#a0a0b0",
                  }}
                >
                  {c}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="home-container pb-15 pt-7">
        {/* Search */}
        <div
          className="flex items-center gap-3 rounded-[14px] border bg-surface-dark px-4.5 py-3 transition-colors"
          style={{
            borderColor: query ? accent : "rgba(255,255,255,0.07)",
            boxShadow: query ? `0 0 0 3px ${accent}22` : "none",
          }}
        >
          <svg
            className="size-4.5 shrink-0"
            style={{ color: query ? accent : "#606070" }}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label={meta.placeholder}
            placeholder={meta.placeholder}
            className="min-w-0 flex-1 bg-transparent text-[0.95rem] text-white placeholder:text-white/40 focus:outline-none"
            style={{ caretColor: accent }}
          />
          {query ? (
            <button
              onClick={() => setQuery("")}
              aria-label={t("home.menu.clearSearch")}
              className="flex size-6 shrink-0 items-center justify-center rounded-full border border-white/10 bg-[#23232e] text-[0.85rem] text-[#a0a0b0]"
            >
              ✕
            </button>
          ) : null}
        </div>

        {/* Category tabs */}
        <div className="mt-4">
          <CategoryTabs categories={categories} brand={brand} active={active} onChange={setActive} />
        </div>

        {/* Crust guide (Cheez pizza only). Category keys are database ids now,
            so "is this the pizza tab?" is answered from the selected category's
            NAME rather than a hardcoded key. */}
        {brand === "cheez" && (active === "all" || activeIsPizza) && !query ? (
          <div className="mt-6 rounded-xl border border-white/8 bg-surface-dark p-5">
            <p className="mb-3 text-xs font-bold uppercase tracking-widest text-white/50">
              ◺ {t("home.menu.crustGuideTitle")}
            </p>
            <div className="flex flex-wrap gap-2.5">
              {CRUST_GUIDE.map((c) => (
                <div
                  key={c.size}
                  className="flex-1 basis-45 rounded-[10px] border px-3.5 py-2.5"
                  style={{ background: `${c.color}12`, borderColor: `${c.color}44` }}
                >
                  <p
                    className="text-[0.78rem] font-extrabold"
                    style={{ color: c.color, letterSpacing: "0.3px" }}
                  >
                    {c.size}
                  </p>
                  <p className="mt-0.5 text-[0.72rem] text-[#a0a0b0]">{c.desc}</p>
                  <p className="mt-0.5 text-[0.68rem] italic text-[#606070]">{c.tag}</p>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {/* Grouped product grid */}
        {grouped.length === 0 ? (
          <p className="py-16 text-center text-white/50" data-testid="home-menu-empty">
            {query
              ? t("home.menu.noItems")
              : brandCounts[isMad ? "cheez" : "madchef"] > 0
                ? // This brand is empty but the other one is not — point at it
                  // instead of implying the catalogue is empty.
                  t("home.menu.emptyBrandOtherHasItems", {
                    brand: isMad ? "Cheez! Pizza" : "Madchef",
                  })
                : (emptyMessage ?? t("home.menu.noItems"))}
          </p>
        ) : (
          grouped.map((group) => (
            <div key={group.key} className="mt-7">
              <div className="mb-4 flex items-center gap-2.5 border-b border-white/8 pb-2.5">
                <span className={cn("text-base", accentText)}>★</span>
                {/* The category's own name from the database, rendered as-is.
                    It was a translation lookup while the group names were a
                    fixed hardcoded set; an admin-created category has no key,
                    and t() would print the raw key. */}
                <h3 className="font-display text-[1.4rem] font-extrabold text-white" style={{ letterSpacing: "1px" }}>
                  {group.label}
                </h3>
                <span className="text-[0.78rem] font-medium text-[#606070]">
                  {t("home.menu.itemsCount", { n: fmt.num(group.items.length) })}
                </span>
              </div>
              <div className="item-cards-grid">
                {group.items.map((item) => (
                  <ProductCard
                    key={item.id}
                    item={item}
                    onConfigure={setConfigItem}
                    showBranch={multiBranch}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {configItem ? <ItemModal item={configItem} onClose={() => setConfigItem(null)} /> : null}
    </section>
  );
}
