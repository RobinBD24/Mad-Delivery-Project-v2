import { test, expect } from "@playwright/test";

import { login } from "./helpers";

/**
 * Regression (req/task #7): the "branch" dropdown on the super-admin category
 * form must be readable in BOTH light and dark mode. The bug was a raw <select>
 * whose native options inherited unreadable colors in dark mode; the fix routes
 * it through the shared themed <Select>, which forces the option colors to the
 * theme surface — with NO page-specific inline styling. This test locks that in:
 * the control is the shared Select (carries the themed option class) and stays
 * visible + dark-surfaced after switching to dark mode.
 */
test.describe("#7 category branch dropdown theming", () => {
  test("uses the shared themed Select and is readable in light + dark", async ({ page }) => {
    await login(page, "super_admin");
    await page.goto("/admin/categories");

    const select = page.getByTestId("category-branch-select");
    await expect(select).toBeVisible();

    // It is a real <select> with the global choices + at least one branch.
    expect(await select.evaluate((el) => el.tagName)).toBe("SELECT");
    expect(await select.evaluate((el) => (el as HTMLSelectElement).options.length)).toBeGreaterThan(1);

    // The fix lives in the shared Select: themed field surface + forced option
    // colors, not a one-off page style.
    const cls = (await select.getAttribute("class")) ?? "";
    expect(cls).toContain("bg-surface-card");
    expect(cls).toContain("[&>option]:bg-surface-card");

    // Switch to dark mode; the control must stay visible and dark-surfaced
    // (i.e. not a white box with white text).
    await page.getByTestId("theme-switcher").click();
    await page.getByTestId("theme-switcher-option-dark").click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(select).toBeVisible();

    const bg = await select.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(bg, "select background follows the dark surface").not.toBe("rgb(255, 255, 255)");
  });
});
