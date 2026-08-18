export const PASSWORD = "Admin12345@##";

export const DEMO_USERS = [
  "super_admin",
  "management",
  "marketing",
  "branch_manager",
  "accounts",
  "rider",
  "customer",
] as const;
export type DemoUser = (typeof DEMO_USERS)[number] | "blocked_customer";

/** Display name the seed gives each demo user (used for topbar selectors). */
export const DISPLAY_NAME: Record<string, string> = {
  super_admin: "Super Admin",
  management: "Management",
  marketing: "Marketing",
  branch_manager: "Branch Manager",
  accounts: "Accounts",
  rider: "Rider",
  customer: "Customer",
  blocked_customer: "Blocked Customer",
};

/**
 * Where each role LANDS after signing in — mirrors ROLE_HOME in
 * lib/constants. A customer lands on the PUBLIC HOMEPAGE "/", where the
 * ordering flow starts; specs about the customer DASHBOARD or the branch list
 * must use ROLE_DASHBOARD below, or navigate there explicitly.
 */
export const ROLE_HOME: Record<string, string> = {
  super_admin: "/admin/dashboard",
  management: "/management/dashboard",
  marketing: "/marketing/dashboard",
  branch_manager: "/branch-manager/dashboard",
  accounts: "/accounts/dashboard",
  rider: "/rider/dashboard",
  customer: "/",
  // Dedicated, order-independent fixture users for avatar-upload specs (seeded
  // as customers), so they land on the public homepage like any other customer.
  qa_upload_1: "/",
  qa_upload_2: "/",
  courier2: "/rider/dashboard",
};

/** The role's dashboard page — not always the post-login landing (see above). */
export const ROLE_DASHBOARD: Record<string, string> = {
  ...ROLE_HOME,
  customer: "/customer/dashboard",
  qa_upload_1: "/customer/dashboard",
  qa_upload_2: "/customer/dashboard",
};

/**
 * Anchored URL matcher for a landing path.
 *
 * Needed because the customer's landing path is now "/", and the idiom this
 * suite used — new RegExp(`${path}$`) — degenerates to /\/$/ for it, which
 * matches ANY url ending in a slash and would pass on the wrong page. For "/"
 * the match must be pinned to the origin boundary instead.
 */
export function atPath(path: string): RegExp {
  if (path === "/") return /^https?:\/\/[^/]+\/(\?[^#]*)?$/;
  const escaped = path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`${escaped}(\\?[^#]*)?$`);
}
