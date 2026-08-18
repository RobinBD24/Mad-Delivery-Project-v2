/**
 * SINGLE SOURCE OF TRUTH for validation constraints.
 *
 * Imported by BOTH the client rules (`lib/validation/rules.ts`) and the server
 * validators (`lib/validation/server.ts` + the service layer), so a rule can
 * never drift between the two sides — the class of bug where the frontend
 * accepts 2 characters but the backend demands 3.
 *
 * This module is CLIENT-SAFE: constants and pure regexes only. No database
 * access, no permission logic, no secrets. Server-only authorization and
 * ownership checks stay in `lib/services/*`.
 */

// ── Patterns ────────────────────────────────────────────────────────────

/** Pragmatic email shape check (the authoritative check is deliverability). */
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Bangladeshi 11-digit mobile. The server historically used the stricter
 * operator-prefix form (`01[3-9]`); the client used `01\d`. Both sides now use
 * the strict one so a number the client accepts is never rejected on submit.
 */
export const BD_PHONE_RE = /^01[3-9]\d{8}$/;

/** http/https URL. */
export const URL_RE = /^https?:\/\/[^\s/$.?#].[^\s]*$/i;

/** Digits with an optional single decimal part — rejects "1e5", "0x2", "--3". */
export const DECIMAL_RE = /^-?\d+(\.\d+)?$/;

/** Whole number, no decimal point. */
export const INTEGER_RE = /^-?\d+$/;

/** HH:MM 24-hour clock. */
export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** YYYY-MM-DD calendar date. */
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// ── Lengths ─────────────────────────────────────────────────────────────

export const LIMITS = {
  /** Passwords: min 8 and never all-digits (mirrors validatePassword). */
  passwordMin: 8,
  nameMin: 2,
  nameMax: 120,
  /** Short single-line free text (labels, codes, transaction ids). */
  shortTextMax: 200,
  /** Long free text (descriptions, notes, reasons, messages). */
  longTextMax: 2000,
  phoneDigits: 11,
  /** Money: two decimal places, non-negative, capped well below overflow. */
  moneyMin: 0,
  moneyMax: 10_000_000,
  moneyDecimals: 2,
  /** Percentages / discount rates. */
  percentMin: 0,
  percentMax: 100,
  /** Delivery radius in km. */
  radiusMin: 0.1,
  radiusMax: 100,
  /** Minutes-based estimates (prep time, delivery estimate). */
  minutesMin: 1,
  minutesMax: 1440,
  /** Order/cart item quantity. */
  qtyMin: 1,
  qtyMax: 999,
  /** Reservation party size / table capacity. */
  partySizeMin: 1,
  partySizeMax: 100,
  /** Reward points / coins. */
  pointsMin: 0,
  pointsMax: 1_000_000,
  /** Star rating. */
  ratingMin: 1,
  ratingMax: 5,
  /** Latitude / longitude bounds. */
  latMin: -90,
  latMax: 90,
  lngMin: -180,
  lngMax: 180,
} as const;

// ── Uploads ─────────────────────────────────────────────────────────────

/**
 * Image MIME types accepted anywhere in the app. This list IS the upload
 * pipeline's list (`lib/http/upload.ts` imports it), so the browser's `accept`
 * filter, the client rule and the server guard can never disagree about which
 * files are allowed. Every accepted image is re-encoded to WEBP by Sharp.
 */
export const IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"] as const;

/** Alternate MIME spellings some browsers send for the same formats. */
export const IMAGE_MIME_ALIASES = ["image/pjpeg"] as const;

/** Extensions matching IMAGE_MIME_TYPES — checked in addition to the MIME type. */
export const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "avif"] as const;

/**
 * Max upload size in bytes and its human label for messages.
 *
 * 50 MB by product decision — comfortably above any phone or DSLR photo, while
 * keeping the transient memory cost of an upload bounded. Shared by the
 * browser-side check and the server-side one, so the two can never disagree
 * about what is too big.
 *
 * Must stay <= the Server Action body limit in next.config.ts, or the request is
 * rejected with a 413 before this check ever runs and the user sees a generic
 * error instead of the field message below.
 */
export const MAX_IMAGE_BYTES = 50 * 1024 * 1024;
export const MAX_IMAGE_MB = 50;

// ── Helpers shared by both sides ────────────────────────────────────────

/** True when the value parses to a finite number (rejects NaN/Infinity/""). */
export function isFiniteNumber(value: unknown): boolean {
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed || !DECIMAL_RE.test(trimmed)) return false;
  return Number.isFinite(Number(trimmed));
}

/** Decimal places in a numeric string ("12.50" → 2). */
export function decimalPlaces(value: string): number {
  const dot = value.indexOf(".");
  return dot === -1 ? 0 : value.trim().length - dot - 1;
}

/** Lowercase file extension without the dot, or "" when there is none. */
export function fileExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot + 1).toLowerCase();
}

/**
 * Shared image check used by the client rules AND the server upload guard.
 *
 * The extension must be allowed; the MIME type must be allowed too, but only
 * when the browser actually supplied one (some send an empty string for files
 * dragged from certain sources).
 */
export function imageFileProblem(
  file: { name: string; type: string; size: number },
): "type" | "size" | null {
  const mime = (file.type || "").toLowerCase();
  const mimeOk =
    !mime ||
    (IMAGE_MIME_TYPES as readonly string[]).includes(mime) ||
    (IMAGE_MIME_ALIASES as readonly string[]).includes(mime);
  const extOk = (IMAGE_EXTENSIONS as readonly string[]).includes(fileExtension(file.name));
  if (!mimeOk || !extOk) return "type";
  if (file.size > MAX_IMAGE_BYTES) return "size";
  return null;
}
