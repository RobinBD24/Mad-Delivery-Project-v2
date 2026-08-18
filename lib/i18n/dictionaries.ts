import bn from "@/messages/bn.json";
import en from "@/messages/en.json";

import { DEFAULT_LOCALE, type Locale } from "./config";

export type Dictionary = Record<string, unknown>;

const DICTIONARIES: Record<Locale, Dictionary> = { bn, en };

export function getDictionary(locale: Locale): Dictionary {
  return DICTIONARIES[locale] ?? DICTIONARIES[DEFAULT_LOCALE];
}

/** Resolve a dotted key ("nav.dashboard") against a dictionary, with {var} interpolation. */
export function translate(
  dict: Dictionary,
  key: string,
  vars?: Record<string, string | number>,
): string {
  const raw = key.split(".").reduce<unknown>(
    (acc, part) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[part] : undefined),
    dict,
  );
  let str = typeof raw === "string" ? raw : key; // fall back to the key itself if missing
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      str = str.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
    }
  }
  return str;
}

export type TranslateFn = (key: string, vars?: Record<string, string | number>) => string;
