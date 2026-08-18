import { test, expect, type Page } from "@playwright/test";

import { newSession, API_BASE } from "./helpers";

/**
 * The notifications, complaints and management-report pages are rendered for
 * EVERY role by three shared views. These checks cover those shared views once
 * each rather than repeating the same assertions per role route.
 */

const MOBILE = { width: 360, height: 780 };

async function expectNoHorizontalOverflow(page: Page, label: string) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, `${label} must not scroll horizontally`).toBeLessThanOrEqual(1);
}

test.describe("Shared authenticated views use the dashboard design system", () => {
  test("notifications inbox shows own-scope summary cards and the shared header", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const { page } = admin;
    await page.goto("/admin/notifications");

    await expect(page.getByTestId("dashboard-page-header")).toBeVisible();
    const cards = page.getByTestId("summary-card");
    await expect(cards).toHaveCount(3);

    // The total must be the signed-in user's WHOLE inbox, not the fetched page
    // and not another user's notifications.
    const api = await (await admin.req.get(`${API_BASE}/api/notifications/?page_size=1`)).json();
    const shown = (await cards.first().locator("[data-summary-value]").innerText()).replace(/\D/g, "");
    expect(Number(shown), "total card counts the whole inbox, not the fetched page").toBe(api.count);

    await page.setViewportSize(MOBILE);
    await expectNoHorizontalOverflow(page, "notifications at 360px");
    await admin.context.close();
  });

  test("complaints summary cards filter the list through the URL", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const { page } = admin;
    await page.goto("/admin/complaints");

    await expect(page.getByTestId("dashboard-page-header")).toBeVisible();
    const cards = page.getByTestId("summary-card");
    await expect(cards).toHaveCount(5);

    // A status card is a real link: clicking it filters and is undoable by Back.
    await cards.nth(1).click();
    await expect(page).toHaveURL(/status=pending/);
    await page.goBack();
    await expect(page).not.toHaveURL(/status=pending/);

    await page.setViewportSize(MOBILE);
    await expectNoHorizontalOverflow(page, "complaints at 360px");
    await admin.context.close();
  });

  test("management report becomes labelled cards on mobile without overflow", async ({ browser }) => {
    const mgmt = await newSession(browser, "management");
    const { page } = mgmt;
    await page.goto("/management/reports/orders");

    await expect(page.getByTestId("dashboard-page-header")).toBeVisible();
    // Breadcrumb back to the hub replaced the ad-hoc back link.
    await expect(page.getByRole("navigation", { name: /breadcrumb/i })).toBeVisible();
    await expect(page.getByTestId("responsive-data-desktop")).toBeVisible();

    await page.setViewportSize(MOBILE);
    await expect(page.getByTestId("responsive-data-mobile")).toBeVisible();
    await expect(page.getByTestId("responsive-data-desktop")).toBeHidden();
    await expectNoHorizontalOverflow(page, "management report at 360px");
    await mgmt.context.close();
  });
});
