import { test, expect } from "@playwright/test";
import { login, setLocale, expectHealthy } from "./helpers";

// One representative data-heavy page per role that must render real content.
const ROLE_PAGES: Record<string, string[]> = {
  super_admin: ["/admin/dashboard", "/admin/users", "/admin/reports/attendance", "/admin/complaints"],
  management: ["/management/dashboard", "/management/reports", "/management/analytics"],
  marketing: ["/marketing/dashboard", "/marketing/campaigns", "/marketing/performance"],
  branch_manager: ["/branch-manager/dashboard", "/branch-manager/duty-history", "/branch-manager/orders"],
  accounts: ["/accounts/dashboard", "/accounts/reports", "/accounts/withdrawals"],
  rider: ["/rider/dashboard", "/rider/wallet", "/rider/performance", "/rider/notifications"],
  customer: ["/customer/dashboard", "/customer/orders", "/customer/rewards", "/customer/reviews"],
};

for (const [role, pages] of Object.entries(ROLE_PAGES)) {
  test.describe(`${role} dashboards`, () => {
    test.beforeEach(async ({ context, page }) => {
      await setLocale(context, "en");
      await login(page, role);
    });
    for (const path of pages) {
      test(`${path} renders healthy`, async ({ page }) => {
        const res = await page.goto(path);
        expect(res!.status(), `${path} http`).toBeLessThan(400);
        await expect(page).toHaveURL(new RegExp(path.replace(/\//g, "\\/")));
        await expect(page.locator("h1"), `${path} has a heading`).toBeVisible();
        await expectHealthy(page);
      });
    }
  });
}
