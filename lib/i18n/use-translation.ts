"use client";

import { useI18nContext } from "@/components/providers/language-provider";
import type { Locale } from "@/lib/i18n/config";
import { translate, type TranslateFn } from "@/lib/i18n/dictionaries";
import { makeFormatters, type Formatters } from "@/lib/i18n/format";

/** Client-component translation hook: `const { t, fmt, locale } = useTranslation();` */
export function useTranslation(): { locale: Locale; t: TranslateFn; fmt: Formatters } {
  const { locale, dict } = useI18nContext();
  return {
    locale,
    t: (key, vars) => translate(dict, key, vars),
    fmt: makeFormatters(locale),
  };
}
