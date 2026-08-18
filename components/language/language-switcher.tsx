"use client";

import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE, type Locale } from "@/lib/i18n/config";
import { useTranslation } from "@/lib/i18n/use-translation";
import { cn } from "@/lib/utils";

const OPTIONS: { value: Locale; label: string }[] = [
  { value: "bn", label: "বাংলা" },
  { value: "en", label: "EN" },
];

/**
 * BN | EN toggle. Persists the choice in a cookie (survives refresh + login),
 * then refreshes so server components re-render in the new language.
 */
export function LanguageSwitcher({
  className,
  tone = "light",
}: {
  className?: string;
  tone?: "light" | "dark";
}) {
  const { locale } = useTranslation();

  function choose(next: Locale) {
    if (next === locale) return;
    // Persist the choice, then hard-reload so BOTH the server render (cookie via
    // next/headers) and the client provider pick up the new locale — guaranteed,
    // unlike router.refresh() which can leave client context stale.
    // eslint-disable-next-line react-hooks/immutability
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE}; samesite=lax`;
    window.location.reload();
  }

  const base = tone === "dark" ? "bg-white/10 text-slate-200" : "bg-surface-muted text-fg-muted";

  return (
    <div
      className={cn("inline-flex min-h-11 items-center rounded-full p-0.5 text-xs font-semibold", base, className)}
      role="group"
      aria-label="Language"
    >
      {OPTIONS.map((opt) => {
        const activeCls =
          tone === "dark" ? "bg-surface-card text-fg-base" : "bg-surface-card text-brand-600 shadow-sm";
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => choose(opt.value)}
            aria-pressed={locale === opt.value}
            className={cn(
              // PHASE A — a real finger target on mobile: the label alone was
              // under 32px tall, which is below any sane touch minimum.
              "flex min-h-10 items-center rounded-full px-2.5 py-1 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 sm:px-3",
              locale === opt.value ? activeCls : "hover:opacity-80",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
