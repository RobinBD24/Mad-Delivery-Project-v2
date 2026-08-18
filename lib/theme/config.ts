// Global appearance setting. Mirrors the locale cookie pattern in lib/i18n/config.ts
// so the server render and the client agree on the very first paint.

/** What the user picked. "system" defers to the OS preference. */
export const THEME_PREFERENCES = ["light", "dark", "system"] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];

/** What actually gets painted — "system" is resolved to one of these. */
export type ResolvedTheme = "light" | "dark";

export const DEFAULT_THEME_PREFERENCE: ThemePreference = "system";

export const THEME_COOKIE = "mad_theme";
export const THEME_COOKIE_MAX_AGE = 365 * 24 * 60 * 60; // 1 year

/**
 * Legacy key from the login-only toggle. The pre-paint script still reads it
 * once so visitors who set a theme before this went global keep their choice.
 */
export const LEGACY_THEME_STORAGE_KEY = "mad_auth_theme";

function isThemePreference(value: string | null | undefined): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}

export function resolveThemePreference(value: string | null | undefined): ThemePreference {
  return isThemePreference(value) ? value : DEFAULT_THEME_PREFERENCE;
}

/**
 * Best-effort resolution for the server render, which cannot know the OS
 * preference. "system" falls back to light; the pre-paint script corrects it
 * before the first paint if the OS actually prefers dark.
 */
export function resolveThemeForServer(preference: ThemePreference): ResolvedTheme {
  return preference === "dark" ? "dark" : "light";
}
