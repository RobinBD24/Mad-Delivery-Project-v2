export const E2E_PORT = Number(process.env.E2E_PORT ?? 3000);
/** Origin the suite drives — override with PLAYWRIGHT_BASE_URL for a dedicated env. */
export const E2E_ORIGIN = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${E2E_PORT}`;
export const API_BASE = E2E_ORIGIN;

/** Representative data pages per role for load/stability sweeps. */
export const ROLE_PAGES: Record<string, string[]> = {
  super_admin: [
    "/admin/dashboard", "/admin/users", "/admin/customers", "/admin/staff",
    "/admin/products", "/admin/reports/sales", "/admin/reports/attendance",
    "/admin/notices", "/admin/rewards", "/admin/complaints",
  ],
  branch_manager: [
    "/branch-manager/dashboard", "/branch-manager/orders", "/branch-manager/riders",
    "/branch-manager/delivery-zone", "/branch-manager/delivery-hours",
    "/branch-manager/attendance", "/branch-manager/table-reservations",
    "/branch-manager/duty-history", "/branch-manager/complaints",
  ],
  rider: [
    "/rider/dashboard", "/rider/wallet", "/rider/earnings", "/rider/withdrawals",
    "/rider/performance", "/rider/location-history", "/rider/route-history",
    "/rider/login-history", "/rider/attendance", "/rider/notifications",
  ],
  customer: [
    "/customer/dashboard", "/customer/branches", "/customer/orders",
    "/customer/addresses", "/customer/rewards", "/customer/reviews",
    "/customer/settings", "/customer/reservations", "/customer/complaints",
  ],
  accounts: [
    "/accounts/dashboard", "/accounts/payments", "/accounts/transactions",
    "/accounts/withdrawals", "/accounts/rider-earnings", "/accounts/refunds",
    "/accounts/invoices", "/accounts/expenses", "/accounts/settlements",
    "/accounts/adjustments", "/accounts/audit-log", "/accounts/reports",
  ],
  marketing: [
    "/marketing/dashboard", "/marketing/campaigns", "/marketing/coupons",
    "/marketing/audience", "/marketing/performance", "/marketing/feedback",
  ],
  management: [
    "/management/dashboard", "/management/reports", "/management/reports/finance",
    "/management/reports/riders", "/management/analytics", "/management/exports",
  ],
};

/** [actingRole, targetPath] — role must NOT be able to open this page. */
export const WRONG_ROLE_PAGES: [string, string][] = [
  ["rider", "/admin/dashboard"],
  ["customer", "/branch-manager/orders"],
  ["marketing", "/accounts/withdrawals"],
  ["accounts", "/marketing/campaigns"],
  ["management", "/rider/wallet"],
  ["branch_manager", "/customer/rewards"],
];

/** [actingRole, api] — must return 403 for this role. */
export const WRONG_ROLE_APIS: [string, string][] = [
  ["rider", "/api/accounts/withdrawals"],
  ["customer", "/api/marketing/coupons"],
  ["marketing", "/api/admin/rewards"],
  ["customer", "/api/rider/wallet"],
  ["branch_manager", "/api/admin/settings/delivery-fees"],
  ["accounts", "/api/management/export?type=finance"],
];
