import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { getDictionary, translate } from "@/lib/i18n/dictionaries";
import { resolveLocale, LOCALE_COOKIE } from "@/lib/i18n/config";

/**
 * API error carrying a a standard payload. `payload` is either { detail } or a
 * field→messages map, matching the standard error payload so the
 * frontend's `apiErrorMessage` parser keeps working unchanged.
 *
 * Message strings may be i18n MARKERS built with `sk(key, params)` — the
 * `handle()` wrapper translates them to the caller's locale (from the
 * `mad_locale` cookie) before responding, so error/validation text follows the
 * selected UI language instead of being hardcoded to one language.
 */
export class ApiError extends Error {
  status: number;
  payload: unknown;
  constructor(status: number, payload: unknown) {
    super(typeof payload === "string" ? payload : "API error");
    this.status = status;
    this.payload = payload;
  }
}

const I18N_MARKER = "i18n:";

/** Build a translatable server-message marker, e.g. sk("errors.server.notFound"). */
export function sk(key: string, params?: Record<string, string | number>): string {
  return params ? `${I18N_MARKER}${key}|${JSON.stringify(params)}` : `${I18N_MARKER}${key}`;
}

function localizeString(s: string, locale: string): string {
  if (!s.startsWith(I18N_MARKER)) return s;
  const spec = s.slice(I18N_MARKER.length);
  const bar = spec.indexOf("|");
  const key = bar === -1 ? spec : spec.slice(0, bar);
  const dict = getDictionary(resolveLocale(locale));
  let vars: Record<string, string | number> | undefined;
  if (bar !== -1) {
    try {
      const parsed = JSON.parse(spec.slice(bar + 1)) as Record<string, string | number>;
      // Resolve any "@:<key>" param values (e.g. an enum label) to this locale.
      vars = {};
      for (const [k, v] of Object.entries(parsed)) {
        vars[k] = typeof v === "string" && v.startsWith("@:") ? translate(dict, v.slice(2)) : v;
      }
    } catch {
      vars = undefined;
    }
  }
  return translate(dict, key, vars);
}

/** Recursively translate any i18n markers inside an error payload. */
function localizePayload(payload: unknown, locale: string): unknown {
  if (typeof payload === "string") return localizeString(payload, locale);
  if (Array.isArray(payload)) return payload.map((v) => localizePayload(v, locale));
  if (payload && typeof payload === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(payload)) out[k] = localizePayload(v, locale);
    return out;
  }
  return payload;
}

export function badRequest(payload: Record<string, unknown> | string): ApiError {
  return new ApiError(400, typeof payload === "string" ? { detail: payload } : payload);
}
export function unauthorized(detail = "Authentication required."): ApiError {
  return new ApiError(401, { detail });
}
export function forbidden(detail = sk("errors.server.forbidden")): ApiError {
  return new ApiError(403, { detail });
}
export function notFound(detail = sk("errors.server.notFound")): ApiError {
  return new ApiError(404, { detail });
}
export function conflict(detail = sk("errors.server.conflict")): ApiError {
  return new ApiError(409, { detail });
}
export function validationError(fields: Record<string, string | string[]>): ApiError {
  return new ApiError(400, fields);
}

/** Read the active locale from the request's cookie header (defaults applied). */
function localeFromArgs(args: unknown[]): string {
  const req = args[0];
  const cookie =
    req instanceof Request ? req.headers.get("cookie") ?? "" : "";
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${LOCALE_COOKIE}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : "";
}

/** Wrap a route handler so thrown ApiError/ZodError become JSON responses. */
export function handle<Args extends unknown[]>(
  fn: (...args: Args) => Promise<NextResponse> | Promise<Response>,
) {
  return async (...args: Args): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (err) {
      const locale = localeFromArgs(args);
      if (err instanceof ApiError) {
        return NextResponse.json(localizePayload(err.payload, locale) as object, {
          status: err.status,
        });
      }
      if (err instanceof ZodError) {
        const fields: Record<string, string[]> = {};
        for (const issue of err.issues) {
          const key = issue.path.join(".") || "non_field_errors";
          (fields[key] ??= []).push(localizeString(issue.message, locale));
        }
        return NextResponse.json(fields, { status: 400 });
      }
      console.error("[api] unhandled error:", err);
      return NextResponse.json(
        { detail: localizeString(sk("errors.server.internal"), locale) },
        { status: 500 },
      );
    }
  };
}
