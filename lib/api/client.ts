import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

export class ApiError extends Error {
  status: number;
  data: unknown;

  constructor(status: number, data: unknown) {
    super(`API error ${status}`);
    this.status = status;
    this.data = data;
  }
}

/**
 * Extract the first human-readable message from an API error payload
 * (standard shape: { detail } or field→messages).
 */
export function apiErrorMessage(
  data: unknown,
  fallback = "কিছু একটা ভুল হয়েছে। আবার চেষ্টা করুন।",
): string {
  if (typeof data === "string") return data;
  if (Array.isArray(data)) return apiErrorMessage(data[0], fallback);
  if (data && typeof data === "object") {
    const record = data as Record<string, unknown>;
    if (typeof record.detail === "string") return record.detail;
    for (const value of Object.values(record)) {
      const message = apiErrorMessage(value, "");
      if (message) return message;
    }
  }
  return fallback;
}

/** Absolute base URL of this app's own API, derived from the incoming request. */
async function internalApiBase(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}/api`;
}

/**
 * Server-side fetch to this app's own Route Handlers, forwarding the caller's
 * cookies so the NextAuth session is available to the handler.
 * Redirects to /login on 401.
 */
/** Strip a trailing slash from the path portion (the previous API used trailing
 * slashes; our Route Handlers are unslashed). Query string is preserved. */
function normalizePath(path: string): string {
  const [p, query] = path.split("?");
  const trimmed = p.length > 1 ? p.replace(/\/+$/, "") : p;
  return query ? `${trimmed}?${query}` : trimmed;
}

async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const cookieHeader = (await cookies()).toString();
  const base = await internalApiBase();
  path = normalizePath(path);
  const requestHeaders = new Headers(init.headers);
  requestHeaders.set("cookie", cookieHeader);
  if (init.body && !(init.body instanceof FormData) && !requestHeaders.has("Content-Type")) {
    requestHeaders.set("Content-Type", "application/json");
  }

  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: requestHeaders,
    cache: "no-store",
  });

  if (response.status === 401) {
    redirect("/login?expired=1");
  }
  return response;
}

export async function getJSON<T>(path: string): Promise<T> {
  const response = await apiFetch(path);
  if (!response.ok) {
    throw new ApiError(response.status, await response.json().catch(() => null));
  }
  return response.json();
}

export async function sendJSON<T>(
  path: string,
  method: "POST" | "PATCH" | "PUT" | "DELETE",
  body?: unknown,
): Promise<T> {
  const response = await apiFetch(path, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    throw new ApiError(response.status, await response.json().catch(() => null));
  }
  if (response.status === 204) return undefined as T;
  return response.json();
}

export async function sendForm<T>(
  path: string,
  method: "POST" | "PATCH" | "PUT",
  form: FormData,
): Promise<T> {
  const response = await apiFetch(path, { method, body: form });
  if (!response.ok) {
    throw new ApiError(response.status, await response.json().catch(() => null));
  }
  return response.json();
}
