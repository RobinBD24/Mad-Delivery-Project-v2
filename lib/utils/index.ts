/** Join class names, skipping falsy values. */
export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

/**
 * Turn a stored image reference into a browser-usable URL. Handles both the
 * current runtime-storage keys and legacy values:
 *   - absolute URL         "https://cdn/x.webp"          → unchanged
 *   - new storage key       "profile_photos/x.webp"      → "/api/uploads/profile_photos/x.webp"
 *                              (or NEXT_PUBLIC_UPLOAD_BASE_URL + key if set)
 *   - legacy rooted path    "/uploads/x.webp"            → unchanged (served from public/)
 *   - empty / null                                       → null (caller shows a fallback)
 *
 * New uploads are served by the /api/uploads route handler from the runtime
 * UPLOAD_DIR, so they work in production (`next start`) and after a restart —
 * unlike files under public/, which 404 when added after the build.
 *
 * Pass `version` (e.g. the owner's `updated_at`) to append a cache-busting query
 * so a replaced photo never shows the browser's stale copy.
 */
function getUploadUrl(
  key: string | null | undefined,
  version?: string | null,
): string | null {
  if (!key || typeof key !== "string") return null;
  const trimmed = key.trim();
  if (!trimmed || trimmed === "null" || trimmed === "undefined") return null;

  let url: string;
  if (/^https?:\/\//i.test(trimmed)) {
    url = trimmed; // already absolute
  } else if (trimmed.startsWith("/")) {
    url = trimmed; // legacy rooted path (/uploads/… from public, or /api/uploads/…)
  } else {
    // Bare runtime storage key, e.g. "profile_photos/<uuid>.webp".
    const normalized = trimmed.replace(/^uploads\//, "");
    const base = process.env.NEXT_PUBLIC_UPLOAD_BASE_URL?.trim().replace(/\/+$/, "");
    url = base ? `${base}/${normalized}` : `/api/uploads/${normalized}`;
  }

  if (!version) return url;
  return `${url}${url.includes("?") ? "&" : "?"}v=${encodeURIComponent(version)}`;
}

/** URL builder used across the app for stored media references. */
export const mediaUrl = getUploadUrl;
