"use client";

import { Icon } from "@/components/layout/icons";
import { useTheme } from "@/components/providers/theme-provider";
import { useTranslation } from "@/lib/i18n/use-translation";

/**
 * Light/dark toggle styled for the auth screens.
 *
 * Same global setting as the dashboard switcher (see ThemeProvider) — a theme
 * picked here survives login. This one stays a single icon button to match the
 * approved login design; the dashboard uses the three-option menu.
 */
export function AuthThemeToggle() {
  const { t } = useTranslation();
  const { resolvedTheme, setPreference } = useTheme();

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={() => setPreference(resolvedTheme === "dark" ? "light" : "dark")}
      data-testid="auth-theme-toggle"
      aria-label={resolvedTheme === "dark" ? t("auth.themeToLight") : t("auth.themeToDark")}
    >
      <Icon name={resolvedTheme === "dark" ? "sun" : "moon"} className="size-4" />
    </button>
  );
}
