"use client";

import { useEffect, useRef, useState } from "react";

import { useHomeCart } from "@/components/home/home-cart-context";
import type { SearchEntry } from "@/lib/home/types";
import { useTranslation } from "@/lib/i18n/use-translation";
import { cn } from "@/lib/utils";

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
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
  );
}

function useSearch(index: SearchEntry[]) {
  const [query, setQuery] = useState("");
  const term = query.trim().toLowerCase();
  const results: SearchEntry[] = term
    ? index.filter((e) => e.name.toLowerCase().includes(term)).slice(0, 8)
    : [];
  return { query, setQuery, results };
}

function ResultRow({ entry, onPick }: { entry: SearchEntry; onPick: (entry: SearchEntry) => void }) {
  const { t, fmt } = useTranslation();
  return (
    <button
      onClick={() => onPick(entry)}
      className="flex w-full items-center gap-3 border-b border-white/8 px-3.5 py-2.5 text-left last:border-b-0 hover:bg-[#23232e]"
    >
      <span className="text-xl">{entry.emoji}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-white">{entry.name}</span>
        <span className="block text-xs text-[#a0a0b0]">
          {entry.brand === "cheez" ? "Cheez! Pizza" : "Madchef"}
        </span>
      </span>
      <span className="whitespace-nowrap font-display text-base font-bold text-brand-500">
        {entry.fromPrice ? (
          <span className="mr-1 font-sans text-[0.72rem] font-normal text-[#606070]">
            {t("home.product.from")}
          </span>
        ) : null}
        {fmt.money(entry.price)}
      </span>
    </button>
  );
}

/**
 * Navbar "search all menus" — desktop inline input with dropdown, plus a
 * mobile full-screen overlay opened from the search icon button.
 * Picking a result switches the active brand tab and scrolls to the menu.
 */
/**
 * Navbar search. The index is built from the DATABASE by
 * lib/services/public-catalog and passed down from the server component; it was
 * previously a hardcoded SEARCH_INDEX derived from the hardcoded menu, so it
 * could return products that did not exist and never returned ones that did.
 */
export function NavSearch({ index }: { index: SearchEntry[] }) {
  const { setBrand } = useHomeCart();
  const { t } = useTranslation();
  const { query, setQuery, results } = useSearch(index);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) setDropdownOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setDropdownOpen(false);
        setOverlayOpen(false);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const pick = (entry: SearchEntry) => {
    setBrand(entry.brand);
    setQuery("");
    setDropdownOpen(false);
    setOverlayOpen(false);
    setTimeout(() => {
      document.getElementById("menu-section")?.scrollIntoView({ behavior: "smooth" });
    }, 50);
  };

  return (
    <>
      {/* Desktop inline search */}
      <div ref={boxRef} className="relative hidden min-w-0 max-w-[420px] flex-1 md:block">
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setDropdownOpen(Boolean(e.target.value.trim()));
          }}
          onFocus={() => query && setDropdownOpen(true)}
          aria-label={t("home.header.searchPlaceholder")}
          placeholder={t("home.header.searchPlaceholder")}
          className="w-full rounded-[10px] border border-white/8 bg-surface-dark py-2.25 pl-4 pr-10 text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-white/20"
        />
        <SearchIcon className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-[#606070]" />
        {dropdownOpen && results.length > 0 ? (
          <div className="absolute inset-x-0 top-[calc(100%+6px)] z-50 max-h-90 overflow-y-auto rounded-xl border border-white/12 bg-surface-dark shadow-2xl">
            <p className="border-b border-white/8 px-3.5 pb-1.5 pt-2 text-[0.72rem] font-bold uppercase tracking-widest text-[#606070]">
              {t("home.header.searchResults")}
            </p>
            {results.map((entry) => (
              <ResultRow key={`${entry.brand}-${entry.id}`} entry={entry} onPick={pick} />
            ))}
          </div>
        ) : null}
      </div>

      {/* Mobile search icon */}
      <button
        onClick={() => setOverlayOpen(true)}
        aria-label={t("home.header.searchOpen")}
        className="flex size-9 items-center justify-center rounded-[10px] border border-white/8 bg-surface-dark text-white md:hidden"
      >
        <SearchIcon className="size-5" />
      </button>

      {/* Mobile overlay */}
      {overlayOpen ? (
        <div className="fixed inset-0 z-60 flex flex-col bg-[#0c0c0e]/98 backdrop-blur md:hidden" role="dialog" aria-modal="true">
          <div className="flex items-center gap-2.5 border-b border-white/8 p-4">
            <div className="relative flex-1">
              <input
                autoFocus
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label={t("home.header.searchPlaceholder")}
                placeholder={t("home.header.searchPlaceholder")}
                className="w-full rounded-[10px] border border-white/8 bg-surface-dark py-3 pl-4 pr-10 text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-white/20"
              />
              <SearchIcon className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-[#606070]" />
            </div>
            <button
              onClick={() => {
                setOverlayOpen(false);
                setQuery("");
              }}
              aria-label={t("home.header.searchClose")}
              className={cn(
                "flex size-11 items-center justify-center rounded-[10px] border border-white/8 bg-surface-dark text-white",
              )}
            >
              ✕
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {query.trim() && results.length === 0 ? (
              <p className="p-6 text-center text-sm text-white/50">{t("home.menu.noItems")}</p>
            ) : (
              results.map((entry) => <ResultRow key={`${entry.brand}-${entry.id}`} entry={entry} onPick={pick} />)
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
