import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/dictionaries";

const loaders: Record<Locale, () => Promise<Dictionary>> = {
  en: () => import("@/messages/en.json").then((module) => module.default as Dictionary),
  bn: () => import("@/messages/bn.json").then((module) => module.default as Dictionary),
};

const pending = new Map<Locale, Promise<Dictionary>>();

/**
 * Load only the active locale as a cacheable JavaScript chunk.
 *
 * Keeping the promise stable lets React suspend once per locale. More
 * importantly, the server no longer serializes the full dictionary into every
 * HTML and RSC response.
 */
export function loadClientDictionary(locale: Locale): Promise<Dictionary> {
  let promise = pending.get(locale);
  if (!promise) {
    promise = loaders[locale]();
    pending.set(locale, promise);
  }
  return promise;
}
