"use client";

import { createContext, use, useContext, type ReactNode } from "react";

import { loadClientDictionary } from "@/lib/i18n/client-dictionary";
import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/dictionaries";

interface I18nValue {
  locale: Locale;
  dict: Dictionary;
}

const I18nContext = createContext<I18nValue | null>(null);

/**
 * Seeds the client-side translation context from the server-read locale.
 * Wrapped around the whole app in the root layout, so every client component
 * (via useTranslation) shares the same language as the server render.
 */
export function LanguageProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: ReactNode;
}) {
  const dict = use(loadClientDictionary(locale));
  return <I18nContext.Provider value={{ locale, dict }}>{children}</I18nContext.Provider>;
}

export function useI18nContext(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useTranslation must be used within <LanguageProvider>");
  return ctx;
}
