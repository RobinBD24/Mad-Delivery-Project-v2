"use client";

import type { Brand, Category, CategoryKey } from "@/lib/home/types";
import { useTranslation } from "@/lib/i18n/use-translation";
import { cn } from "@/lib/utils";

export function CategoryTabs({
  categories,
  brand,
  active,
  onChange,
}: {
  categories: Category[];
  brand: Brand;
  active: CategoryKey | "all";
  onChange: (key: CategoryKey | "all") => void;
}) {
  const { t } = useTranslation();
  const isMad = brand === "madchef";
  const activeCls = isMad
    ? "border-brand-500 bg-brand-500 text-white"
    : "border-cheez-gold bg-cheez-gold text-black";

  const tabs: { key: CategoryKey | "all"; label: string; emoji: string }[] = [
    { key: "all", label: t("home.categoryTabs.all"), emoji: "🍽️" },
    // `c.label` is the category's name straight from the database. It used to be
    // a t() lookup against a fixed key set, which would print a raw key for any
    // category an admin creates.
    ...categories.map((c) => ({ key: c.key, label: c.label, emoji: c.emoji })),
  ];

  return (
    <div className="scrollbar-thin -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          onClick={() => onChange(tab.key)}
          className={cn(
            "flex shrink-0 items-center gap-1.5 rounded-full border px-4 py-2 text-[0.82rem] font-semibold transition-colors",
            active === tab.key
              ? activeCls
              : "border-white/10 bg-transparent text-white/60 hover:border-white/25 hover:text-white",
          )}
        >
          <span>{tab.emoji}</span>
          {tab.label}
        </button>
      ))}
    </div>
  );
}
