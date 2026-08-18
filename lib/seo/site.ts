import { headers } from "next/headers";

/**
 * PHASE B — the canonical origin for metadata.
 *
 * Resolution order, so a page never advertises a domain it is not served from:
 *   1. the request's own host (x-forwarded-host behind the proxy, else host) —
 *      this is the domain the visitor actually used, which is what a canonical
 *      is supposed to name;
 *   2. the current server host/port — only for work outside a request, such as
 *      static generation. No deployment URL is baked into the application.
 */
function normalize(raw: string | undefined | null): string | null {
  const value = (raw ?? "").trim().replace(/\/+$/, "");
  if (!value) return null;
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}

/** The site origin, resolved per request (no trailing slash). */
export async function siteOrigin(): Promise<string> {
  let requested: string | null = null;
  try {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    const isLoopback = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host ?? "");
    const proto = h.get("x-forwarded-proto") ?? (isLoopback ? "http" : "https");
    requested = normalize(host ? `${proto}://${host}` : null);
  } catch {
    // Called outside a request scope (e.g. static generation) — fall through.
  }
  if (requested) return requested;

  const host = process.env.HOSTNAME?.trim() || "localhost";
  const port = process.env.PORT?.trim();
  const isLoopback = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(host);
  const protocol = isLoopback ? "http" : "https";
  return `${protocol}://${host}${port ? `:${port}` : ""}`;
}

/** Absolute URL for a site-relative path. */
export async function absoluteUrl(path: string): Promise<string> {
  const origin = await siteOrigin();
  return `${origin}${path.startsWith("/") ? path : `/${path}`}`;
}
