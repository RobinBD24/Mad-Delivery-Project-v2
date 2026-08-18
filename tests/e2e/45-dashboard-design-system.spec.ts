import { expect, test } from "@playwright/test";

import { login, setLocale } from "./helpers";

test.describe("Authenticated dashboard design system", () => {
  test.beforeEach(async ({ context }) => {
    await setLocale(context, "en");
  });

  test("shared shell provides keyboard entry point and contains mobile width", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, "customer");
    await page.goto("/customer/dashboard");

    const skipLink = page.getByRole("link", { name: "Skip to main content" });
    await page.keyboard.press("Tab");
    await expect(skipLink).toBeFocused();
    await expect(skipLink).toHaveAttribute("href", "#dashboard-content");

    const main = page.locator("main#dashboard-content");
    await expect(main).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("mobile navigation closes with Escape and restores page access", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, "customer");
    await page.goto("/customer/dashboard");

    const sidebar = page.getByTestId("dashboard-sidebar");
    await expect(sidebar).not.toBeInViewport();

    await page.getByTestId("sidebar-toggle").click();
    await expect(sidebar).toBeInViewport();

    await page.keyboard.press("Escape");
    await expect(sidebar).not.toBeInViewport();
    await expect(page.locator("main#dashboard-content")).toBeVisible();
  });

  test("page header keeps one clear title and usable actions at 320px", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 760 });
    await login(page, "super_admin");
    await page.goto("/admin/reports");

    const header = page.getByTestId("dashboard-page-header");
    await expect(header).toBeVisible();
    await expect(header.locator("h1")).toHaveCount(1);
    await expect(page.locator("main h1")).toHaveCount(1);

    const firstAction = header.getByRole("link").first();
    await expect(firstAction).toBeVisible();
    const box = await firstAction.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(36);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("reports uses canonical summary cards without squeezing mobile values", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 760 });
    await login(page, "super_admin");
    await page.goto("/admin/reports");

    const grid = page.getByTestId("summary-card-grid");
    await expect(grid).toBeVisible();
    const cards = grid.getByTestId("summary-card");
    await expect(cards).toHaveCount(4);

    const first = await cards.nth(0).boundingBox();
    const second = await cards.nth(1).boundingBox();
    expect(first?.x).toBe(second?.x);
    expect(first?.width ?? 0).toBeGreaterThanOrEqual(260);

    for (const card of await cards.all()) {
      await expect(card.locator("[data-summary-value]")).not.toHaveText("");
    }
  });

  test("order lists switch from desktop table to readable mobile cards", async ({ page }) => {
    await login(page, "super_admin");
    await page.goto("/admin/orders");

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByTestId("responsive-data-mobile")).toBeVisible();
    await expect(page.getByTestId("responsive-data-desktop")).toBeHidden();
    await expect(page.getByTestId("mobile-order-card").first()).toBeVisible();

    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(page.getByTestId("responsive-data-desktop")).toBeVisible();
    await expect(page.getByTestId("responsive-data-mobile")).toBeHidden();
  });

  test("shared data tables become labelled mobile rows without page overflow", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 760 });
    await login(page, "management");
    await page.goto("/management/branches");

    const row = page.getByTestId("responsive-table").locator("tbody tr").first();
    await expect(row).toBeVisible();
    await expect(row).toHaveCSS("display", "block");
    await expect(row.locator("td").first()).toHaveAttribute("data-label", /.+/);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("nested authenticated pages expose localized breadcrumb navigation", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, "super_admin");
    await page.goto("/admin/users/create");

    const breadcrumb = page.getByRole("navigation", { name: "Breadcrumb" });
    await expect(breadcrumb).toBeVisible();
    await expect(breadcrumb.getByRole("link", { name: "All Users" })).toHaveAttribute("href", "/admin/users");
    await expect(breadcrumb).toContainText(/Create.*User/);
    await expect(page.locator("main h1")).toHaveCount(1);
  });
});
