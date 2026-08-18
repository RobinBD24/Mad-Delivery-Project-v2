import { expect, test } from "@playwright/test";

import { login, setLocale } from "./helpers";

test.describe("Role-scoped page summaries", () => {
  test.beforeEach(async ({ context }) => {
    await setLocale(context, "en");
  });

  test("Super Admin Users total matches authoritative API count", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 760 });
    await login(page, "super_admin");
    const response = await page.request.get("/api/auth/users?page_size=1");
    expect(response.ok()).toBeTruthy();
    const payload = (await response.json()) as { count: number };

    await page.goto("/admin/users");
    const total = page.getByTestId("users-total-card");
    await expect(total.locator("[data-summary-value]")).toHaveText(String(payload.count));
    await expect(page.getByTestId("responsive-data-desktop")).toBeHidden();
    await expect(page.getByTestId("mobile-user-card").first()).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("Branch Manager pending-order card uses own-branch count and URL filter", async ({ page }) => {
    await login(page, "branch_manager");
    const response = await page.request.get("/api/orders?status=pending&page_size=1");
    expect(response.ok()).toBeTruthy();
    const payload = (await response.json()) as { count: number };

    await page.goto("/branch-manager/orders");
    const pending = page.getByTestId("orders-pending-card");
    await expect(pending.locator("[data-summary-value]")).toHaveText(String(payload.count));
    await pending.click();
    await expect(page).toHaveURL(/\/branch-manager\/orders\?status=pending$/);
  });

  test("Customer order summary contains only signed-in customer's orders", async ({ page }) => {
    await login(page, "customer");
    const response = await page.request.get("/api/orders?page_size=1");
    expect(response.ok()).toBeTruthy();
    const payload = (await response.json()) as { count: number };

    await page.goto("/customer/orders");
    const total = page.getByTestId("orders-total-card");
    await expect(total.locator("[data-summary-value]")).toHaveText(String(payload.count));
  });
});
