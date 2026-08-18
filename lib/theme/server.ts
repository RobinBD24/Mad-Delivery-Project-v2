import "server-only";

import { cookies } from "next/headers";

import { THEME_COOKIE, resolveThemePreference, type ThemePreference } from "./config";

/** Read the stored appearance preference from the cookie (server components). */
export async function getThemePreference(): Promise<ThemePreference> {
  const store = await cookies();
  return resolveThemePreference(store.get(THEME_COOKIE)?.value);
}
