import { test, expect, type Page } from "@playwright/test";

import { newSession, API_BASE } from "./helpers";

/**
 * The five list pages called out as loading everything with no controls.
 * These assert real VALUES (row counts, totals, filtered results), not just
 * that an element exists.
 */

const DEFAULT_PAGE_SIZE = 20;

async function rowCount(page: Page) {
  // Desktop table rows only — the mobile card list renders the same records.
  return page.locator('[data-testid="responsive-data-desktop"] tbody tr').count();
}

async function noOverflow(page: Page, label: string) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, `${label} must not scroll horizontally`).toBeLessThanOrEqual(1);
}

test.describe("Internal list pages page, search and filter on the server", () => {
  test("customer accounts caps a page, and the total card counts every customer", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const { page } = admin;
    await page.goto("/admin/customers");

    // Never render more than one page of rows, however many customers exist.
    expect(await rowCount(page)).toBeLessThanOrEqual(DEFAULT_PAGE_SIZE);

    // The first card is an aggregate over ALL customers, not the page.
    const shown = (await page.getByTestId("summary-card").first().locator("[data-summary-value]").innerText())
      .replace(/\D/g, "");
    const api = await (await admin.req.get(`${API_BASE}/api/auth/users/?role=customer&page_size=1`)).json();
    expect(Number(shown), "total card counts every customer").toBe(api.count);

    // The range line must agree with the rows actually rendered.
    const range = await page.getByTestId("list-results-range").innerText();
    const [from, to] = range.match(/\d+/g)!.map(Number);
    expect(to - from + 1).toBe(await rowCount(page));

    await page.setViewportSize({ width: 360, height: 780 });
    await noOverflow(page, "customers at 360px");
    await admin.context.close();
  });

  test("blocked-customers card filters the list and every row is blocked", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const { page } = admin;
    await page.goto("/admin/customers");

    const blockedCard = page.getByTestId("summary-card").nth(2);
    const expected = Number((await blockedCard.locator("[data-summary-value]").innerText()).replace(/\D/g, ""));
    await blockedCard.click();
    await expect(page).toHaveURL(/status=blocked/);

    const rows = await rowCount(page);
    expect(rows).toBe(Math.min(expected, DEFAULT_PAGE_SIZE));
    // Every rendered row really is blocked.
    const badges = await page.locator('[data-testid="responsive-data-desktop"] tbody tr').allInnerTexts();
    for (const row of badges) expect(row.toLowerCase()).toContain("blocked");

    // Back restores the unfiltered list — state lives in the URL.
    await page.goBack();
    await expect(page).not.toHaveURL(/status=blocked/);
    await admin.context.close();
  });

  test("orders no longer render every record and status filter narrows them", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const { page } = admin;
    await page.goto("/admin/orders");

    const first = await rowCount(page);
    expect(first, "orders page is capped").toBeLessThanOrEqual(DEFAULT_PAGE_SIZE);

    const api = await (await admin.req.get(`${API_BASE}/api/orders/?page_size=1`)).json();
    const totalShown = (await page.getByTestId("summary-card").first().locator("[data-summary-value]").innerText())
      .replace(/\D/g, "");
    expect(Number(totalShown), "total card counts every order in scope").toBe(api.count);

    await page.goto("/admin/orders?status=delivered");
    const delivered = await (await admin.req.get(`${API_BASE}/api/orders/?status=delivered&page_size=1`)).json();
    const range = await page.getByTestId("list-results-range").innerText();
    expect(range.replace(/\D/g, "")).toContain(String(delivered.count));

    await page.setViewportSize({ width: 360, height: 780 });
    await noOverflow(page, "orders at 360px");
    await admin.context.close();
  });

  test("staff search narrows results and survives paging", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const { page } = admin;
    await page.goto("/admin/staff");
    const unfiltered = await rowCount(page);
    expect(unfiltered).toBeLessThanOrEqual(DEFAULT_PAGE_SIZE);

    // Filtering to a single role must not return more rows than the whole list.
    await page.goto("/admin/staff?role=rider");
    await expect(page).toHaveURL(/role=rider/);
    const riderRows = await page.locator('[data-testid="responsive-data-desktop"] tbody tr').allInnerTexts();
    for (const row of riderRows) expect(row.toLowerCase()).toContain("rider");

    await admin.context.close();
  });

  test("manager history and activity log are paged with real totals", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const { page } = admin;

    for (const path of ["/admin/branch-manager-history", "/admin/activity-logs"]) {
      await page.goto(path);
      expect(await rowCount(page), `${path} is capped`).toBeLessThanOrEqual(DEFAULT_PAGE_SIZE);
      await expect(page.getByTestId("summary-card").first()).toBeVisible();

      const range = await page.getByTestId("list-results-range").innerText();
      const nums = range.match(/\d+/g)!.map(Number);
      expect(nums[1] - nums[0] + 1, `${path} range matches rendered rows`).toBe(await rowCount(page));

      await page.setViewportSize({ width: 360, height: 780 });
      await noOverflow(page, `${path} at 360px`);
      await page.setViewportSize({ width: 1280, height: 900 });
    }
    await admin.context.close();
  });
});
