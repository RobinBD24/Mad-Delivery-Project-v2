import { test, expect } from "@playwright/test";

import { newSession } from "./helpers";

/**
 * Checks for this pass: the category create flow now has its own route, and the
 * destructive actions that used to fire straight from a click are confirmed.
 */
test.describe("Internal page enhancements", () => {
  test("category create lives on its own route and the list is list-only", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const { page } = admin;

    await page.goto("/admin/categories");
    // The list page must no longer host the create form.
    await expect(page.getByTestId("category-branch-select")).toHaveCount(0);

    // The primary action is in the header and goes to the dedicated route.
    await page.getByRole("link", { name: /create category/i }).first().click();
    await expect(page).toHaveURL(/\/admin\/categories\/new$/);

    // The dedicated page carries the form, a breadcrumb back, and context cards.
    await expect(page.getByTestId("category-branch-select")).toBeVisible();
    await expect(page.getByRole("navigation", { name: /breadcrumb/i })).toBeVisible();
    await expect(page.getByTestId("summary-card").first()).toBeVisible();

    // It stays usable on a narrow screen.
    await page.setViewportSize({ width: 360, height: 780 });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, "create page must not scroll horizontally at 360px").toBeLessThanOrEqual(1);

    await admin.context.close();
  });

  test("branch table delete asks for confirmation instead of deleting on click", async ({ browser }) => {
    const bm = await newSession(browser, "branch_manager");
    const { page } = bm;
    await page.goto("/branch-manager/tables");

    // Select a table so the inspector (which holds Delete) appears.
    const node = page.locator("[data-table]").first();
    if ((await node.count()) === 0) {
      test.skip(true, "branch has no tables to select in this dataset");
    }
    await node.click();

    await page.getByRole("button", { name: /^delete$/i }).first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog, "a confirmation dialog must open").toBeVisible();
    await expect(dialog).toContainText(/delete table/i);

    // Cancelling must leave the table untouched and the page usable.
    await dialog.getByRole("button", { name: /cancel/i }).click();
    await expect(dialog).toBeHidden();

    await bm.context.close();
  });
});
