import "server-only";

import { cookies } from "next/headers";

import { LOCALE_COOKIE, resolveLocale, type Locale } from "./config";
import { getDictionary, translate, type Dictionary, type TranslateFn } from "./dictionaries";
import { makeFormatters, type Formatters } from "./format";

/** Read the active locale from the cookie (server components / actions). */
export async function getLocale(): Promise<Locale> {
  const store = await cookies();
  return resolveLocale(store.get(LOCALE_COOKIE)?.value);
}

export interface ServerI18n {
  locale: Locale;
  dict: Dictionary;
  t: TranslateFn;
  fmt: Formatters;
}

/** Translation bundle for server components: `const { t, fmt } = await getT();` */
export async function getT(): Promise<ServerI18n> {
  const locale = await getLocale();
  const dict = getDictionary(locale);
  return {
    locale,
    dict,
    t: (key, vars) => translate(dict, key, vars),
    fmt: makeFormatters(locale),
  };
}
