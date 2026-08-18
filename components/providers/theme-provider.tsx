"use client";

import { createContext, useCallback, useContext, useEffect, useSyncExternalStore, type ReactNode } from "react";

import {
  THEME_COOKIE,
  THEME_COOKIE_MAX_AGE,
  resolveThemePreference,
  type ResolvedTheme,
  type ThemePreference,
} from "@/lib/theme/config";

interface ThemeValue {
  /** What the user picked — may be "system". */
  preference: ThemePreference;
  /** What is actually painted right now. */
  resolvedTheme: ResolvedTheme;
  setPreference: (next: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeValue | null>(null);

const DARK_QUERY = "(prefers-color-scheme: dark)";

function systemTheme(): ResolvedTheme {
  return window.matchMedia(DARK_QUERY).matches ? "dark" : "light";
}

/**
 * The theme lives on <html data-theme> / <html data-theme-pref>, written
 * pre-paint by the inline script in the root layout. That makes the DOM the
 * single source of truth, so we read it through useSyncExternalStore instead of
 * mirroring it into React state — no second copy to drift, and no hydration
 * mismatch (React renders the server snapshot first, then re-renders).
 */
function subscribeToAttribute(attribute: string) {
  return (onChange: () => void): (() => void) => {
    const observer = new MutationObserver(onChange);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: [attribute] });
    return () => observer.disconnect();
  };
}

const subscribeTheme = subscribeToAttribute("data-theme");
const subscribePreference = subscribeToAttribute("data-theme-pref");

const getThemeSnapshot = (): ResolvedTheme =>
  document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";

const getPreferenceSnapshot = (): ThemePreference =>
  resolveThemePreference(document.documentElement.getAttribute("data-theme-pref"));

/** Writes the resolved theme + preference onto <html>. */
function applyTheme(preference: ThemePreference): void {
  const root = document.documentElement;
  root.setAttribute("data-theme-pref", preference);
  root.setAttribute("data-theme", preference === "system" ? systemTheme() : preference);
}

/**
 * Global appearance provider. Wrapped around the whole app in the root layout,
 * so the login screen, the dashboards and every role share one setting.
 *
 * Persistence is a cookie (not localStorage) so the *server* render can set
 * data-theme on <html> — that is what keeps the page from flashing the wrong
 * theme and what carries the choice across login, logout and route changes.
 */
export function ThemeProvider({
  initialPreference,
  children,
}: {
  initialPreference: ThemePreference;
  children: ReactNode;
}) {
  // The server cannot read the OS preference, so it renders "light" for
  // "system"; these server snapshots match the server-rendered HTML exactly.
  const resolvedTheme = useSyncExternalStore(subscribeTheme, getThemeSnapshot, () =>
    initialPreference === "dark" ? "dark" : "light",
  );
  const preference = useSyncExternalStore(
    subscribePreference,
    getPreferenceSnapshot,
    () => initialPreference,
  );

  const setPreference = useCallback((next: ThemePreference) => {
    // Cookie, so the next server render already knows the answer.
    document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=${THEME_COOKIE_MAX_AGE}; samesite=lax`;
    applyTheme(next);
  }, []);

  // Follow the OS while the preference is "system".
  useEffect(() => {
    if (preference !== "system") return;
    const query = window.matchMedia(DARK_QUERY);
    const onChange = () => applyTheme("system");
    onChange();
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [preference]);

  return (
    <ThemeContext.Provider value={{ preference, resolvedTheme, setPreference }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within <ThemeProvider>");
  return ctx;
}
