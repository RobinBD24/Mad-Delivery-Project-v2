// Server-side field validators.
//
// Every constraint below comes from `lib/validation/limits.ts` — the SAME module
// the client rules import — so the two sides can never disagree about what is
// acceptable. Frontend validation is UX only; these checks are the security
// boundary and always run, whatever the client sent.
import { sk, validationError } from "@/lib/http/errors";
import {
  BD_PHONE_RE,
  DATE_RE,
  DECIMAL_RE,
  EMAIL_RE,
  INTEGER_RE,
  LIMITS,
  MAX_IMAGE_MB,
  TIME_RE,
  URL_RE,
  decimalPlaces,
  imageFileProblem,
  isFiniteNumber,
} from "./limits";

export function isValidPhone(value: string): boolean {
  return BD_PHONE_RE.test(value);
}

export function validatePhone(value: string, field = "phone"): string {
  if (!isValidPhone(value)) {
    throw validationError({ [field]: sk("errors.validation.phone") });
  }
  return value;
}

/**
 * Password strength — mirrors the client `password` rule exactly
 * (min length from LIMITS, never all digits). Login is unaffected: only
 * registration / user creation / change-password use this.
 */
export function validatePassword(value: string, field = "password"): string {
  if (value.length < LIMITS.passwordMin) {
    throw validationError({ [field]: sk("errors.validation.passwordShort") });
  }
  if (/^\d+$/.test(value)) {
    throw validationError({ [field]: sk("errors.validation.passwordNumeric") });
  }
  return value;
}

// ── Shared field validators (same rules as lib/validation/rules.ts) ──────

/** Required non-empty string, trimmed, with an optional length window. */
export function validateRequired(
  value: unknown,
  field: string,
  { min, max }: { min?: number; max?: number } = {},
): string {
  const s = typeof value === "string" ? value.trim() : "";
  if (!s) throw validationError({ [field]: sk("validation.required") });
  if (min !== undefined && s.length < min) {
    throw validationError({ [field]: sk("validation.minLength", { n: min }) });
  }
  const cap = max ?? LIMITS.longTextMax;
  if (s.length > cap) {
    throw validationError({ [field]: sk("validation.maxLength", { n: cap }) });
  }
  return s;
}

export function validateEmail(value: unknown, field = "email"): string {
  const s = typeof value === "string" ? value.trim() : "";
  if (!EMAIL_RE.test(s)) throw validationError({ [field]: sk("validation.email") });
  return s.toLowerCase();
}

export function validateUrl(value: unknown, field: string): string {
  const s = typeof value === "string" ? value.trim() : "";
  if (!URL_RE.test(s)) throw validationError({ [field]: sk("validation.url") });
  return s;
}

/**
 * Finite number within an optional range. Rejects NaN, Infinity, "1e5" and
 * blank strings instead of silently coercing them to 0 — the bug class where a
 * typo becomes a free order.
 */
export function validateNumber(
  value: unknown,
  field: string,
  { min, max, integer }: { min?: number; max?: number; integer?: boolean } = {},
): number {
  const raw = typeof value === "number" ? String(value) : String(value ?? "").trim();
  if (!raw || !isFiniteNumber(raw)) throw validationError({ [field]: sk("validation.number") });
  if (integer && !INTEGER_RE.test(raw)) {
    throw validationError({ [field]: sk("validation.integer") });
  }
  const n = Number(raw);
  if (min !== undefined && n < min) {
    throw validationError({ [field]: sk("validation.min", { n: min }) });
  }
  if (max !== undefined && n > max) {
    throw validationError({ [field]: sk("validation.max", { n: max }) });
  }
  return n;
}

/**
 * Money: finite, non-negative, at most two decimals, within the safe range.
 * Returns the number; callers keep using the app's Decimal-safe helpers for
 * arithmetic — this only guards what enters the system.
 */
export function validateMoney(
  value: unknown,
  field: string,
  { min = LIMITS.moneyMin, max = LIMITS.moneyMax }: { min?: number; max?: number } = {},
): number {
  const raw = typeof value === "number" ? String(value) : String(value ?? "").trim();
  if (!raw || !DECIMAL_RE.test(raw) || !isFiniteNumber(raw)) {
    throw validationError({ [field]: sk("validation.number") });
  }
  if (decimalPlaces(raw) > LIMITS.moneyDecimals) {
    throw validationError({ [field]: sk("validation.decimals", { n: LIMITS.moneyDecimals }) });
  }
  const n = Number(raw);
  if (n < min) {
    throw validationError({
      [field]: min === 0 ? sk("validation.nonNegative") : sk("validation.min", { n: min }),
    });
  }
  if (n > max) throw validationError({ [field]: sk("validation.max", { n: max }) });
  return n;
}

/** The submitted value must be one of the allowed enum members. */
export function validateEnum<T extends string>(
  value: unknown,
  field: string,
  allowed: readonly T[],
): T {
  const s = String(value ?? "");
  if (!allowed.includes(s as T)) {
    throw validationError({ [field]: sk("validation.selectRequired") });
  }
  return s as T;
}

export function validateDate(value: unknown, field: string): string {
  const s = String(value ?? "").trim();
  if (!DATE_RE.test(s) || Number.isNaN(Date.parse(s))) {
    throw validationError({ [field]: sk("validation.date") });
  }
  return s;
}

export function validateTime(value: unknown, field: string): string {
  const s = String(value ?? "").trim();
  if (!TIME_RE.test(s)) throw validationError({ [field]: sk("validation.time") });
  return s;
}

/**
 * End must come after start. The message is attached to the END field — the one
 * the user most likely needs to change.
 */
export function validateRange(
  start: string,
  end: string,
  endField: string,
  { allowEqual = false, timeOfDay = false }: { allowEqual?: boolean; timeOfDay?: boolean } = {},
): void {
  if (!start || !end) return;
  const ok = allowEqual ? end >= start : end > start;
  if (!ok) {
    throw validationError({
      [endField]: timeOfDay ? sk("validation.timeRange") : sk("validation.dateRange"),
    });
  }
}

/**
 * Upload guard — identical MIME/extension/size limits the client checks, so a
 * file the browser accepted is never rejected here for a different reason.
 */
export function validateImage(
  file: File | null | undefined,
  field: string,
  { required = false }: { required?: boolean } = {},
): File | null {
  if (!file || file.size === 0) {
    if (required) throw validationError({ [field]: sk("validation.fileRequired") });
    return null;
  }
  const problem = imageFileProblem({ name: file.name, type: file.type, size: file.size });
  if (problem === "type") throw validationError({ [field]: sk("validation.fileType") });
  if (problem === "size") {
    throw validationError({ [field]: sk("validation.fileSize", { n: MAX_IMAGE_MB }) });
  }
  return file;
}

/**
 * Translate an expected database constraint failure into a field message.
 *
 * Raw Prisma errors must never reach the client: they leak model names, column
 * names and SQL. Callers wrap a write and pass the unique-constraint targets
 * they expect, e.g.
 *
 *   await withConstraintErrors(() => prisma.user.create({…}), {
 *     email: sk("errors.validation.emailTaken"),
 *     phone: sk("errors.validation.phoneTaken"),
 *   });
 *
 * Anything unrecognized is re-thrown and handled by `handle()` as a 500 with a
 * generic message, while the real error is logged server-side.
 */
export async function withConstraintErrors<T>(
  run: () => Promise<T>,
  map: Record<string, string>,
): Promise<T> {
  try {
    return await run();
  } catch (err) {
    const e = err as { code?: string; meta?: { target?: unknown; field_name?: unknown } };
    if (e?.code === "P2002") {
      const target = e.meta?.target;
      const columns = Array.isArray(target)
        ? target.map(String)
        : typeof target === "string"
          ? [target]
          : [];
      for (const column of columns) {
        // Prisma reports "User_email_key" or plain "email" depending on driver.
        const match = Object.keys(map).find((field) => column.includes(field));
        if (match) throw validationError({ [match]: map[match] });
      }
      const fallback = Object.keys(map)[0];
      if (fallback) throw validationError({ [fallback]: map[fallback] });
    }
    if (e?.code === "P2003" || e?.code === "P2025") {
      const fallback = Object.keys(map)[0];
      throw validationError({
        [fallback ?? "detail"]: sk("errors.validation.recordUnavailable"),
      });
    }
    throw err;
  }
}

/** Empty-string → undefined helper for optional form fields. */
export function blankToUndef(value: FormDataEntryValue | null): string | undefined {
  const s = typeof value === "string" ? value.trim() : "";
  return s === "" ? undefined : s;
}

export function str(value: FormDataEntryValue | null, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

/**
 * PHASE 10 — normalize a Bangladeshi phone number for SEARCH.
 *
 * Customers type numbers many ways: `+880 1711-111111`, `8801711111111`,
 * `01711111111`, `1711111111`, or a partial like `0171`. Stored values are the
 * local `01XXXXXXXXX` form. We reduce any input to its NATIONAL SIGNIFICANT
 * digits (the part after the country code and the leading trunk `0`), so a
 * `contains` match finds the same customer regardless of the format typed.
 *
 * Returns "" when the input carries no usable digits, so callers can fall back
 * to plain name/email search instead of matching everything.
 */
export function normalizeBdPhoneForSearch(raw: string): string {
  // Keep digits only — drops +, spaces, dashes, parentheses.
  let digits = String(raw ?? "").replace(/\D+/g, "");
  if (!digits) return "";
  // Strip the country code in either written form.
  if (digits.startsWith("00880")) digits = digits.slice(5);
  else if (digits.startsWith("880")) digits = digits.slice(3);
  // Strip a single leading trunk zero (local dialling form).
  if (digits.startsWith("0")) digits = digits.replace(/^0+/, "");
  return digits;
}

/** True when the raw search term is phone-shaped (digits with optional +/-/spaces). */
export function looksLikePhoneQuery(raw: string): boolean {
  const s = String(raw ?? "").trim();
  if (!s) return false;
  return /^[+\d][\d\s()+-]*$/.test(s) && (s.replace(/\D+/g, "").length >= 3);
}
