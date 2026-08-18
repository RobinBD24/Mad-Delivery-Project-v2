import { expect, test } from "@playwright/test";

import {
  apiLogin,
  DEMO_USERS,
  expectNoRawKeys,
  realErrors,
  ROLE_HOME,
  setLocale,
  trackConsoleErrors,
} from "../helpers";

const PATHS = [
  "/branch-manager/complaints",
  "/branch-manager/notifications",
];

test.describe("Full page audit — Branch Manager communication", () => {
  test("communication pages enforce Branch Manager routing while shared APIs stay session-scoped", async ({
    browser,
    page,
  }) => {
    for (const path of PATHS) {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(/\/login$/);
    }
    expect((await page.request.get("/api/complaints")).status()).toBe(401);
    expect((await page.request.get("/api/notifications")).status()).toBe(401);

    for (const role of DEMO_USERS.filter((role) => role !== "branch_manager")) {
      const { context, req } = await apiLogin(browser, role);
      const rolePage = await context.newPage();
      for (const path of PATHS) {
        await rolePage.goto(path, { waitUntil: "domcontentloaded" });
        await expect(rolePage, `${role} denial for ${path}`).toHaveURL(
          new RegExp(`${ROLE_HOME[role]}$`),
        );
      }
      expect((await req.get("/api/complaints")).status()).toBe(200);
      expect((await req.get("/api/notifications")).status()).toBe(200);
      await context.close();
    }
  });

  test("complaints and notifications render exact scoped data and accessible filters", async ({
    browser,
  }) => {
    const { context } = await apiLogin(browser, "branch_manager");
    await setLocale(context, "en");
    const page = await context.newPage();
    const complaints = await (
      await page.request.get("/api/complaints?page_size=100")
    ).json();
    const notifications = await (
      await page.request.get("/api/notifications?page_size=100")
    ).json();

    await page.goto("/branch-manager/complaints", {
      waitUntil: "domcontentloaded",
    });
    await expect(page.locator("main ul > li")).toHaveCount(
      complaints.results.length,
    );
    await expect(
      page.locator('a[href="/complaints/new"]').first(),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: /^all$/i }).first()).toHaveAttribute(
      "aria-current",
      "page",
    );
    await page.goto("/branch-manager/complaints?box=inbox&status=open", {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByRole("link", { name: /^inbox$/i })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(page.getByRole("link", { name: /^open$/i })).toHaveAttribute(
      "aria-current",
      "page",
    );

    await page.goto("/branch-manager/notifications", {
      waitUntil: "domcontentloaded",
    });
    await expect(page.locator("main ul > li")).toHaveCount(
      notifications.results.length,
    );
    await expect(
      page.getByRole("button", { name: /^all$/i }),
    ).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: /^unread$/i }).click();
    await expect(
      page.getByRole("button", { name: /^unread$/i }),
    ).toHaveAttribute("aria-pressed", "true");
    await context.close();
  });

  test("communication pages are responsive, localized, themed, and runtime-clean", async ({
    browser,
  }) => {
    const { context } = await apiLogin(browser, "branch_manager");
    await setLocale(context, "en");
    await context.addCookies([
      { name: "mad_theme", value: "light", url: "http://localhost:3101" },
    ]);
    const page = await context.newPage();
    const consoleErrors = trackConsoleErrors(page);
    for (const path of PATHS) {
      for (const viewport of [
        { width: 1440, height: 900 },
        { width: 390, height: 844 },
        { width: 320, height: 800 },
      ]) {
        await page.setViewportSize(viewport);
        const response = await page.goto(path, {
          waitUntil: "domcontentloaded",
        });
        expect(response?.status()).toBe(200);
        await expect(page.locator("main")).toHaveCount(1);
        await expect(page.locator("h1")).toHaveCount(1);
        await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
          "content",
          /noindex/,
        );
        expect(
          await page.evaluate(
            () =>
              document.documentElement.scrollWidth -
              document.documentElement.clientWidth,
          ),
        ).toBeLessThanOrEqual(1);
      }
      await expectNoRawKeys(page);
    }
    await setLocale(context, "bn");
    await context.addCookies([
      { name: "mad_theme", value: "dark", url: "http://localhost:3101" },
    ]);
    for (const path of PATHS) {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      await expect(page.locator("html")).toHaveAttribute("lang", "bn");
      await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
      await expectNoRawKeys(page);
    }
    expect(realErrors(consoleErrors)).toEqual([]);
    await context.close();
  });
});
