import type { Locale } from "./config";

const BN_DIGITS: Record<string, string> = {
  "0": "০", "1": "১", "2": "২", "3": "৩", "4": "৪",
  "5": "৫", "6": "৬", "7": "৭", "8": "৮", "9": "৯",
};

function toBnDigits(value: string | number): string {
  return String(value).replace(/[0-9]/g, (d) => BN_DIGITS[d]);
}

/**
 * PHASE 8 — the business operates in Bangladesh, so every displayed date/time is
 * rendered in Asia/Dhaka regardless of where the code runs. Pinning the zone
 * also makes the SERVER render and the CLIENT re-render agree, which removes the
 * hydration mismatch that a runtime-local timezone would cause.
 */
export const APP_TIME_ZONE = "Asia/Dhaka";

/** Locale-aware display formatters (digits, money, dates). */
export interface Formatters {
  /** Plain number → localized digits (Bengali digits in bn, Latin in en). */
  num: (value: string | number) => string;
  /** Currency in Taka, e.g. ৳১,২৫০ / ৳1,250. */
  money: (value: string | number | null | undefined) => string;
  date: (value: string | null | undefined) => string;
  dateTime: (value: string | null | undefined) => string;
  time: (value: string | null | undefined) => string;
}

export function makeFormatters(locale: Locale): Formatters {
  // bn-BD renders Bengali digits + month names; en-GB keeps day-first English.
  const bcp = locale === "bn" ? "bn-BD" : "en-GB";
  const zone = { timeZone: APP_TIME_ZONE } as const;
  return {
    num: (value) => (locale === "bn" ? toBnDigits(value) : String(value)),
    money: (value) => {
      const num = Number(value ?? 0);
      return `৳${num.toLocaleString(locale === "bn" ? "bn-BD" : "en-US", { maximumFractionDigits: 0 })}`;
    },
    date: (value) =>
      !value
        ? "—"
        : new Date(value).toLocaleDateString(bcp, {
            day: "numeric", month: "long", year: "numeric", ...zone,
          }),
    dateTime: (value) =>
      !value
        ? "—"
        : new Date(value).toLocaleString(bcp, {
            day: "numeric", month: "short", year: "numeric",
            hour: "numeric", minute: "2-digit", hour12: true, ...zone,
          }),
    time: (value) =>
      !value
        ? "—"
        : new Date(value).toLocaleTimeString(bcp, {
            hour: "numeric", minute: "2-digit", hour12: true, ...zone,
          }),
  };
}
