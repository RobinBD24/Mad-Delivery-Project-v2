// Client-side field validators. Each returns an i18n key (+ optional vars) on
// failure, or null when valid. Messages are resolved via useTranslation in the
// form-validation hook. Backend remains the final source of truth.
//
// Every constraint here comes from `lib/validation/limits.ts`, which the server
// validators import as well — so the two sides can never disagree.

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

export type RuleResult = { key: string; vars?: Record<string, string | number> } | null;
export type Rule = (value: string, all: Record<string, string>) => RuleResult;

export const required: Rule = (v) => (v.trim() ? null : { key: "validation.required" });

export const email: Rule = (v) =>
  !v.trim() || EMAIL_RE.test(v.trim()) ? null : { key: "validation.email" };

export const phone: Rule = (v) =>
  !v.trim() || BD_PHONE_RE.test(v.replace(/[\s-]/g, "")) ? null : { key: "validation.phone" };

export const url: Rule = (v) =>
  !v.trim() || URL_RE.test(v.trim()) ? null : { key: "validation.url" };

export const minLength =
  (n: number): Rule =>
  (v) =>
    !v || v.length >= n ? null : { key: "validation.minLength", vars: { n } };

export const maxLength =
  (n: number): Rule =>
  (v) =>
    !v || v.length <= n ? null : { key: "validation.maxLength", vars: { n } };

export const matches =
  (otherField: string, key = "validation.passwordMatch"): Rule =>
  (v, all) =>
    v === (all[otherField] ?? "") ? null : { key };

/** Password policy — mirrors `validatePassword` on the server exactly. */
export const password: Rule = (v) => {
  if (!v) return null; // pair with `required` when the field is mandatory
  if (v.length < LIMITS.passwordMin)
    return { key: "validation.passwordShort", vars: { n: LIMITS.passwordMin } };
  if (/^\d+$/.test(v)) return { key: "validation.passwordNumeric" };
  return null;
};

/** Any finite number — rejects NaN, Infinity, "1e5", "abc". */
export const number: Rule = (v) =>
  !v.trim() || isFiniteNumber(v) ? null : { key: "validation.number" };

/** Whole number only. */
export const integer: Rule = (v) =>
  !v.trim() || INTEGER_RE.test(v.trim()) ? null : { key: "validation.integer" };

export const min =
  (n: number): Rule =>
  (v) => {
    if (!v.trim()) return null;
    if (!isFiniteNumber(v)) return { key: "validation.number" };
    return Number(v) >= n ? null : { key: "validation.min", vars: { n } };
  };

export const max =
  (n: number): Rule =>
  (v) => {
    if (!v.trim()) return null;
    if (!isFiniteNumber(v)) return { key: "validation.number" };
    return Number(v) <= n ? null : { key: "validation.max", vars: { n } };
  };

/** Strictly greater than zero (prices that may not be free, quantities…). */
export const positive: Rule = (v) => {
  if (!v.trim()) return null;
  if (!isFiniteNumber(v)) return { key: "validation.number" };
  return Number(v) > 0 ? null : { key: "validation.positive" };
};

/** Zero or more — the rule for fees, discounts and points. */
export const nonNegative: Rule = (v) => {
  if (!v.trim()) return null;
  if (!isFiniteNumber(v)) return { key: "validation.number" };
  return Number(v) >= 0 ? null : { key: "validation.nonNegative" };
};

/** Money: finite, non-negative, at most 2 decimal places, within range. */
export const money: Rule = (v) => {
  if (!v.trim()) return null;
  const raw = v.trim();
  if (!DECIMAL_RE.test(raw) || !isFiniteNumber(raw)) return { key: "validation.number" };
  const n = Number(raw);
  if (n < LIMITS.moneyMin) return { key: "validation.nonNegative" };
  if (n > LIMITS.moneyMax) return { key: "validation.max", vars: { n: LIMITS.moneyMax } };
  if (decimalPlaces(raw) > LIMITS.moneyDecimals)
    return { key: "validation.decimals", vars: { n: LIMITS.moneyDecimals } };
  return null;
};

/** Numeric range in one rule — `range(1, 5)` for a star rating. */
export const range =
  (lo: number, hi: number): Rule =>
  (v) => {
    if (!v.trim()) return null;
    if (!isFiniteNumber(v)) return { key: "validation.number" };
    const n = Number(v);
    return n >= lo && n <= hi ? null : { key: "validation.range", vars: { lo, hi } };
  };

/** Require a non-empty selection from a <select> (value must not be ""). */
export const selectRequired: Rule = (v) => (v ? null : { key: "validation.selectRequired" });

/** The submitted value must be one the UI actually offers. */
export const oneOf =
  (allowed: readonly string[]): Rule =>
  (v) =>
    !v || allowed.includes(v) ? null : { key: "validation.selectRequired" };

/** A required checkbox (terms, confirmations). Unchecked boxes submit nothing. */
export const checked: Rule = (v) => (v ? null : { key: "validation.checkboxRequired" });

/** A required radio/checkbox GROUP — the error belongs to the whole group. */
export const groupRequired: Rule = (v) => (v ? null : { key: "validation.chooseOption" });

export const date: Rule = (v) => {
  if (!v.trim()) return null;
  if (!DATE_RE.test(v.trim()) || Number.isNaN(Date.parse(v))) return { key: "validation.date" };
  return null;
};

export const time: Rule = (v) =>
  !v.trim() || TIME_RE.test(v.trim()) ? null : { key: "validation.time" };

/** This date must be strictly after another field's date. */
export const afterField =
  (otherField: string, key = "validation.dateRange"): Rule =>
  (v, all) => {
    const other = (all[otherField] ?? "").trim();
    if (!v.trim() || !other) return null;
    return v > other ? null : { key };
  };

/** This date must be after OR EQUAL to another field's date (multi-day ranges). */
export const onOrAfterField =
  (otherField: string, key = "validation.dateRange"): Rule =>
  (v, all) => {
    const other = (all[otherField] ?? "").trim();
    if (!v.trim() || !other) return null;
    return v >= other ? null : { key };
  };

/** End time strictly after start time (same-day HH:MM comparison). */
export const afterTimeField =
  (otherField: string): Rule =>
  (v, all) => {
    const other = (all[otherField] ?? "").trim();
    if (!v.trim() || !other) return null;
    return v > other ? null : { key: "validation.timeRange" };
  };

/** Today's date as YYYY-MM-DD in the browser's local calendar. */
function todayISO(): string {
  const now = new Date();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${m}-${d}`;
}

/** Reject dates in the past (today is allowed). */
export const notPast: Rule = (v) =>
  !v.trim() || v >= todayISO() ? null : { key: "validation.datePast" };

/** Reject dates in the future (today is allowed) — joining dates, attendance. */
export const notFuture: Rule = (v) =>
  !v.trim() || v <= todayISO() ? null : { key: "validation.dateFuture" };

// ── File rules ──────────────────────────────────────────────────────────
// File inputs are not plain strings, so they are checked with `validateImageFile`
// rather than through the string `Rule` pipeline.

/** Shared image check — same MIME/extension/size limits the server enforces. */
export function validateImageFile(
  file: File | null | undefined,
  isRequired = false,
): RuleResult {
  if (!file || file.size === 0) return isRequired ? { key: "validation.required" } : null;
  const problem = imageFileProblem(file);
  if (problem === "type") return { key: "validation.fileType" };
  if (problem === "size") return { key: "validation.fileSize", vars: { n: MAX_IMAGE_MB } };
  return null;
}
