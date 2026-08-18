import { ROLE_BASE, ROLE_HOME } from "@/lib/constants";
import type { Role } from "@/types";

/**
 * THE single place that decides where a successful login lands. Every sign-in
 * path funnels through here — email/password, phone/password, registration
 * auto-login — so the rule lives once and cannot drift between call sites.
 *
 * A `callbackUrl` is honoured ONLY when it is BOTH:
 *   1. a same-site absolute path — a value with a scheme, a protocol-relative
 *      "//host" prefix, a backslash (which some browsers normalise to "/") or a
 *      CR/LF is discarded rather than sanitised, because an attacker-supplied
 *      destination is not something to negotiate with; and
 *   2. inside the signed-in user's OWN section. "Internal" is not sufficient:
 *      a branch manager arriving with ?callbackUrl=/customer/branches must land
 *      in their own area, not be walked into the customer ordering flow only to
 *      be bounced by the page's own role guard.
 *
 * Anything else falls back to ROLE_HOME[role]. Two consequences that are the
 * point of this design, not accidents of it:
 *   • a customer with no approved internal destination always lands on "/",
 *     never on /customer/dashboard and never in another role's section; and
 *   • a staff role can never resolve to "/", because "/" is outside every
 *     staff ROLE_BASE and their fallback is their own dashboard.
 * An EXPLICIT ?callbackUrl=/customer/dashboard is still honoured for a
 * customer — that is a deep link the user asked for, not an automatic default.
 */
export function loginDestination(role: Role, callbackUrl: string): string {
  const home = ROLE_HOME[role] ?? "/login";
  const raw = (callbackUrl ?? "").trim();
  if (!raw) return home;
  if (!raw.startsWith("/")) return home; // absolute URL or relative path
  if (raw.startsWith("//") || raw.startsWith("/\\")) return home; // protocol-relative
  if (raw.includes("\\") || /[\r\n\t]/.test(raw)) return home; // separator/CRLF tricks
  if (raw.startsWith("/api/")) return home; // not a page
  const base = ROLE_BASE[role];
  if (!base || (raw !== base && !raw.startsWith(`${base}/`))) return home;
  return raw;
}
