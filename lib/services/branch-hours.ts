import { APP_TIME_ZONE } from "@/lib/i18n/format";

/**
 * Single source of truth for "is this branch open right now?".
 *
 * The open-now branching lived only in `components/home/BranchesCoverage.tsx`
 * (`liveStatus`) — client-side and DISPLAY-ONLY, reading the browser's local
 * clock. That is fine for a status chip but must NOT be the authority for
 * whether an order may be placed (§20: the backend is the source of truth). This
 * module extracts the exact same branching into a pure, i18n-free, timezone-
 * agnostic function so the server can enforce hours off the app's own timezone
 * (Asia/Dhaka) while the homepage keeps rendering its labels unchanged — one
 * implementation, no second competing system (§22).
 */

export type BranchOpenStatus = "open" | "last-orders" | "delivery-only" | "closed";

/** Statuses in which a customer may still ORDER (dining/delivery still accepted). */
export const ORDERABLE_STATUSES: readonly BranchOpenStatus[] = ["open", "last-orders", "delivery-only"];

/** Parse a stored "HH:MM" into minutes-since-midnight; null when unset/invalid. */
export function parseMinutes(value: string | null | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec((value ?? "").trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** Cheez! carries the late-night delivery window (brand-driven, not name-driven). */
export function isLateNight(brandType: string): boolean {
  return brandType === "cheez" || brandType === "combined";
}

/** The minimal branch shape the open-now decision needs. */
export interface BranchHoursInput {
  openingTime: string | null;
  closingTime: string | null;
  brandType: string;
  isActive: boolean;
}

/**
 * Pure port of `liveStatus`'s status branching, returning ONLY the status (no
 * labels, no `t()`, no clock). `minutesSinceMidnight` is supplied by the caller:
 * the homepage passes the browser's local clock (display), the server passes
 * Dhaka minutes (enforcement). Faithful to the original, including the
 * 11:00–23:00 defaults when a time is unset and the cheez/combined late-night
 * window — so refactoring the homepage to call this changes nothing there.
 */
export function branchOpenStatus(branch: BranchHoursInput, minutesSinceMidnight: number): BranchOpenStatus {
  if (!branch.isActive) return "closed";

  const minutes = minutesSinceMidnight;
  const late = isLateNight(branch.brandType);
  const open = parseMinutes(branch.openingTime) ?? 660; // 11:00 AM default
  const close = parseMinutes(branch.closingTime) ?? 1380; // 11:00 PM default
  const lastEntry = Math.max(open, close - 30);
  const cheezLast = 225; // 3:45 AM
  const cheezWarn = 195; // 3:15 AM

  if (minutes < 240) {
    if (!late) return "closed";
    if (minutes >= cheezLast) return "closed";
    if (minutes >= cheezWarn) return "last-orders";
    return "delivery-only";
  }
  if (minutes < open) return "closed";
  if (minutes < lastEntry) {
    if (minutes >= lastEntry - 30) return "last-orders";
    return "open";
  }
  if (minutes < close) return "last-orders";
  if (late) return "delivery-only";
  return "closed";
}

/**
 * Current minutes-since-midnight in the app's timezone (Asia/Dhaka), so hours
 * enforcement never depends on where the server happens to run (UTC in CI, local
 * in dev). Uses a fixed en-GB 24h format to read the wall-clock in that zone.
 */
export function nowMinutesInDhaka(now: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: APP_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const hh = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  // Intl may emit "24" for midnight in some engines; fold it back to 0.
  const mm = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return (hh % 24) * 60 + mm;
}

/**
 * The server-authoritative "can this branch take an order right now?" decision.
 *
 * Adds two rules on top of the pure status branching:
 *   1. An inactive branch is never orderable (temporary/manual closure).
 *   2. A branch WITHOUT configured hours (openingTime or closingTime null) is
 *      always orderable. Hours are optional; a branch that never set them behaves
 *      exactly as it did before hours were enforced. This is also what keeps the
 *      existing test suite deterministic (seeded branches without hours are a
 *      no-op for the gate regardless of the clock).
 *
 * `opensAt` is the branch's stored opening time ("HH:MM"), for the customer-
 * facing "Opens at …" note; null when there is nothing meaningful to show.
 */
export function isBranchOpenNow(
  branch: BranchHoursInput,
  minutesSinceMidnight: number = nowMinutesInDhaka(),
): { orderable: boolean; status: BranchOpenStatus; opensAt: string | null } {
  if (!branch.isActive) {
    return { orderable: false, status: "closed", opensAt: branch.openingTime ?? null };
  }
  if (branch.openingTime == null || branch.closingTime == null) {
    return { orderable: true, status: "open", opensAt: null };
  }
  const status = branchOpenStatus(branch, minutesSinceMidnight);
  return {
    orderable: ORDERABLE_STATUSES.includes(status),
    status,
    opensAt: branch.openingTime,
  };
}
