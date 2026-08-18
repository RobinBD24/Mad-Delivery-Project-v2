import fs from "node:fs";
import path from "node:path";

import { test, expect, type Page } from "@playwright/test";
import { login, setLocale, E2E_ORIGIN } from "./helpers";

/**
 * Visual capture + layout invariants for every role dashboard at the three
 * reference sizes. Deterministic: fixed locale (en), fixed theme (dark — the
 * design source is dark), animations disabled, and the running clock hidden
 * (the only truly dynamic pixel region; nothing else is masked).
 *
 * Screenshots land in test-results/visual/ as review artifacts. Assertions are
 * structural (sections present, zero horizontal overflow, no broken images) so
 * the suite does not depend on machine-specific font rasterization the way
 * toHaveScreenshot baselines would.
 */

const DASHBOARDS: [string, string][] = [
  ["super_admin", "/admin/dashboard"],
  ["management", "/management/dashboard"],
  ["marketing", "/marketing/dashboard"],
  ["branch_manager", "/branch-manager/dashboard"],
  ["accounts", "/accounts/dashboard"],
  ["rider", "/rider/dashboard"],
  ["customer", "/customer/dashboard"],
];

const SIZES: [string, { width: number; height: number }][] = [
  ["desktop", { width: 1440, height: 900 }],
  ["tablet", { width: 768, height: 1024 }],
  ["mobile", { width: 390, height: 844 }],
];

// Outside test-results/ so Playwright's per-run cleanup keeps the review set.
const OUT_DIR = path.join("test-artifacts", "visual");

/** Freeze animations and hide the live clock so captures are stable. */
async function makeDeterministic(page: Page) {
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation: none !important;
        transition: none !important;
      }
      [data-testid="dashboard-status-bar"] .font-mono { visibility: hidden !important; }
    `,
  });
  await page.evaluate(() => document.fonts.ready);
}

test.describe("Dashboard visual capture — all roles × sizes", () => {
  test.beforeAll(() => {
    fs.mkdirSync(OUT_DIR, { recursive: true });
  });

  for (const [sizeName, viewport] of SIZES) {
    for (const [role, route] of DASHBOARDS) {
      test(`${role} @ ${sizeName}`, async ({ page, context }) => {
        await setLocale(context, "en");
        await context.addCookies([
          { name: "mad_theme", value: "dark", url: E2E_ORIGIN },
        ]);
        await page.setViewportSize(viewport);

        await login(page, role);
        // PHASE O — the customer's post-login landing is the ordering flow, so
        // this dashboard capture navigates to the dashboard explicitly.
        await page.goto(route);
        await expect(page).toHaveURL(new RegExp(`${route}$`));

        // Content loaded: chip rail + status bar are the demo's above-the-fold markers.
        await expect(page.locator(".chip-accent").first()).toBeVisible();
        await expect(page.getByTestId("dashboard-status-bar")).toBeVisible();

        await makeDeterministic(page);

        // Invariants at this size:
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - window.innerWidth,
        );
        expect(overflow, `${route} horizontal overflow at ${sizeName}`).toBeLessThanOrEqual(1);

        const brokenImages = await page.evaluate(() =>
          [...document.querySelectorAll("img")]
            .filter((img) => img.complete && img.naturalWidth === 0)
            .map((img) => img.currentSrc || img.src),
        );
        expect(brokenImages).toEqual([]);

        await page.screenshot({
          path: path.join(OUT_DIR, `${role}-${sizeName}.png`),
          fullPage: true,
        });
      });
    }
  }
});
