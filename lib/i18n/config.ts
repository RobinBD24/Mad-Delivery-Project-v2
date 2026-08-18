// Two-language support: Bangla (default) + English.
export const LOCALES = ["bn", "en"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "bn";
export const LOCALE_COOKIE = "mad_locale";
export const LOCALE_COOKIE_MAX_AGE = 365 * 24 * 60 * 60; // 1 year

function isLocale(value: string | null | undefined): value is Locale {
  return value === "bn" || value === "en";
}

export function resolveLocale(value: string | null | undefined): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}
