import { test, expect } from "@playwright/test";

import { newSession } from "./helpers";

/**
 * These pages used to render by having a server component fetch the app's OWN
 * Route Handler over HTTP. That loopback request is an extra failure mode with
 * nothing to do with the report itself, and when it failed the user saw the
 * error boundary's "Could not load data". Each now calls the same service the
 * handler wrapped, so the data and role scope are unchanged.
 *
 * The assertions look for real rendered content and explicitly reject the error
 * boundary — a page that silently degraded would still fail here.
 */
const PAGES: { role: string; path: string }[] = [
  { role: "branch_manager", path: "/branch-manager/reports" },
  { role: "branch_manager", path: "/branch-manager/dashboard" },
  { role: "marketing", path: "/marketing/reports" },
  { role: "marketing", path: "/marketing/customers" },
  { role: "accounts", path: "/accounts/sales" },
  { role: "accounts", path: "/accounts/reports" },
  { role: "management", path: "/management/performance" },
  { role: "management", path: "/management/analytics" },
  { role: "super_admin", path: "/admin/reports" },
  { role: "rider", path: "/rider/deliveries" },
  { role: "rider", path: "/rider/duty-history" },
];

test.describe("Report and dashboard pages render without a self-fetch", () => {
  for (const { role, path } of PAGES) {
    test(`${path} loads for ${role}`, async ({ browser }) => {
      const session = await newSession(browser, role);
      const { page } = session;

      const response = await page.goto(path, { waitUntil: "domcontentloaded" });
      expect(response?.status(), `${path} must not be a server error`).toBeLessThan(400);

      const body = await page.locator("body").innerText();
      expect(body, `${path} must not show the error boundary`).not.toMatch(
        /something went wrong|could not load data|internal server error/i,
      );
      // A real heading proves the page rendered its own content, not a shell.
      await expect(page.getByRole("heading").first()).toBeVisible();

      await session.context.close();
    });
  }
});
