"use client";

import { useEffect, useRef, useState } from "react";

import { Icon } from "@/components/layout/icons";
import { useTheme } from "@/components/providers/theme-provider";
import { useTranslation } from "@/lib/i18n/use-translation";
import { THEME_PREFERENCES, type ThemePreference } from "@/lib/theme/config";
import { cn } from "@/lib/utils";

const ICONS: Record<ThemePreference, string> = {
  light: "sun",
  dark: "moon",
  system: "monitor",
};

/**
 * Appearance menu for the dashboard topbar — Light / Dark / System.
 *
 * Same global setting as the login screen's toggle (see ThemeProvider), so the
 * choice carries across login, logout and every role.
 */
export function ThemeSwitcher({
  className,
  /** Both switchers (mobile strip + desktop topbar) are in the DOM at once, one
   *  hidden by CSS — distinct ids keep test selectors unambiguous. */
  testId = "theme-switcher",
}: {
  className?: string;
  testId?: string;
}) {
  const { t } = useTranslation();
  const { preference, resolvedTheme, setPreference } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className={cn("relative", className)} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        data-testid={testId}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("theme.appearance")}
        className="flex size-11 items-center justify-center rounded-full text-fg-muted transition hover:bg-surface-hover hover:text-fg-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
      >
        {/* The trigger shows what is painted, not the preference: with "system"
            selected the useful information is which theme you are looking at. */}
        <Icon name={resolvedTheme === "dark" ? "moon" : "sun"} className="size-4" />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-40 overflow-hidden rounded-xl border border-border-base bg-surface-card py-1.5 shadow-lg"
        >
          <p className="px-3 pb-1 pt-0.5 text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">
            {t("theme.appearance")}
          </p>
          {THEME_PREFERENCES.map((option) => (
            <button
              key={option}
              type="button"
              role="menuitemradio"
              aria-checked={preference === option}
              data-testid={`${testId}-option-${option}`}
              onClick={() => {
                setPreference(option);
                setOpen(false);
              }}
              className={cn(
                "flex min-h-11 w-full items-center gap-2.5 px-3 py-2 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-inset",
                preference === option
                  ? "bg-surface-hover font-semibold text-brand-600"
                  : "text-fg-base hover:bg-surface-hover",
              )}
            >
              <Icon name={ICONS[option]} className="size-4" />
              {t(`theme.${option}`)}
              {preference === option ? <Icon name="check" className="ml-auto size-3.5" /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
