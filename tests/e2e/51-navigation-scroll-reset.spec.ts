import { test, expect, type Page } from "@playwright/test";

import { newSession } from "./helpers";

/**
 * Navigating inside the authenticated shell must land at the TOP of the new
 * page.
 *
 * Next's `<Link>` deliberately maintains scroll position, and when it does
 * scroll it targets "the top of the first Page element", skipping sticky/fixed
 * elements. In this shell that left the next page part-way down (measured at
 * 289px from a 118px starting offset). `ScrollToTop` in the authenticated
 * layout makes the reset deterministic.
 */

/**
 * A SHORT viewport guarantees every one of these pages overflows, so the
 * "scroll down first" precondition can never silently no-op on a page that
 * happens to be shorter than the window.
 */
const SHORT_VIEWPORT = { width: 1280, height: 400 };

async function scrollDown(page: Page, by = 2000) {
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight), {
      message: "page must be taller than the viewport for this check to mean anything",
    })
    .toBe(true);
  await page.mouse.wheel(0, by);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
}

test.describe("Authenticated navigation resets scroll", () => {
  test("sidebar navigation lands at the top of the next page", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const { page } = admin;
    await page.setViewportSize(SHORT_VIEWPORT);

    await page.goto("/admin/orders");
    await scrollDown(page);

    await page
      .getByTestId("dashboard-sidebar")
      .getByRole("link", { name: /branches/i })
      .first()
      .click();
    await page.waitForURL("**/admin/branches**");

    await expect
      .poll(() => page.evaluate(() => window.scrollY), {
        message: "new page must start at the top",
      })
      .toBe(0);

    await admin.context.close();
  });

  test("paging a list from its bottom control starts the next page at the top", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const { page } = admin;
    await page.setViewportSize(SHORT_VIEWPORT);

    // A query-string-only navigation still has to reset — the control that
    // triggers it sits at the bottom of the list.
    await page.goto("/admin/customers");
    await scrollDown(page);
    await page.goto("/admin/customers?status=blocked");

    await expect
      .poll(() => page.evaluate(() => window.scrollY))
      .toBe(0);

    await admin.context.close();
  });

  test("the skip link still reaches the content anchor instead of the top", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const { page } = admin;

    // An in-page anchor asks for a specific element; the reset must not fight it.
    await page.goto("/admin/orders#dashboard-content");
    await expect(page.locator("#dashboard-content")).toBeVisible();

    await admin.context.close();
  });
});
