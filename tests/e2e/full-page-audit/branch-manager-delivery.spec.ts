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

const DELIVERY_PAGES = [
  "/branch-manager/delivery-areas",
  "/branch-manager/delivery-hours",
  "/branch-manager/delivery-zone",
];

test.describe("Full page audit — Branch Manager delivery configuration", () => {
  test("delivery configuration pages and private APIs are Branch Manager-only", async ({
    browser,
    page,
  }) => {
    for (const path of DELIVERY_PAGES) {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(/\/login$/);
    }
    for (const endpoint of [
      "/api/branch-manager/delivery-settings",
      "/api/branch-manager/time-slots",
    ]) {
      expect((await page.request.get(endpoint)).status()).toBe(401);
    }

    for (const role of DEMO_USERS.filter((role) => role !== "branch_manager")) {
      const { context, req } = await apiLogin(browser, role);
      await setLocale(context, "en");
      const rolePage = await context.newPage();
      for (const path of DELIVERY_PAGES) {
        await rolePage.goto(path, { waitUntil: "domcontentloaded" });
        await expect(rolePage, `${role} denial for ${path}`).toHaveURL(
          new RegExp(`${ROLE_HOME[role]}$`),
        );
      }
      for (const endpoint of [
        "/api/branch-manager/delivery-settings",
        "/api/branch-manager/time-slots",
      ]) {
        expect(
          (await req.get(endpoint)).status(),
          `${role} denial for ${endpoint}`,
        ).toBe(403);
      }
      await context.close();
    }
  });

  test("delivery areas, hours, and zones render exact data with cancel-safe controls", async ({
    browser,
  }) => {
    const { context } = await apiLogin(browser, "branch_manager");
    await setLocale(context, "en");
    const page = await context.newPage();
    const areas = await (await page.request.get("/api/delivery-areas")).json();
    const settings = await (
      await page.request.get("/api/branch-manager/delivery-settings")
    ).json();
    const slots = await (
      await page.request.get("/api/branch-manager/time-slots")
    ).json();

    await page.goto("/branch-manager/delivery-areas", {
      waitUntil: "domcontentloaded",
    });
    await expect(page.locator("tbody tr")).toHaveCount(areas.results.length);
    await expect(page.getByLabel(/search delivery areas/i)).toBeVisible();
    await page.getByRole("link", { name: /add delivery area/i }).click();
    await expect(page).toHaveURL(/\/branch-manager\/delivery-areas\/new/);
    await page.getByRole("button", { name: /create delivery area/i }).click();
    await expect(page.getByText(/this field is required/i)).toBeVisible();
    await page.getByRole("link", { name: /^cancel$/i }).click();
    await expect(page).toHaveURL(/\/branch-manager\/delivery-areas$/);
    if (areas.results.length > 0) {
      const first = areas.results[0] as { id: number; name: string };
      const row = page.locator("tbody tr").first();
      await expect(row).toContainText(first.name);
      await row.getByRole("link", { name: /^edit$/i }).click();
      await expect(page).toHaveURL(
        new RegExp(`/branch-manager/delivery-areas/${first.id}/edit`),
      );
      await expect(page.getByLabel(/area name/i)).toHaveValue(first.name);
      await page.getByRole("link", { name: /^cancel$/i }).click();
      await expect(page).toHaveURL(/\/branch-manager\/delivery-areas/);
    }

    await page.goto("/branch-manager/delivery-hours", {
      waitUntil: "domcontentloaded",
    });
    await expect(page.locator('input[name="opening_time"]')).toHaveValue(
      settings.opening_time ?? "",
    );
    await expect(page.locator('input[name="closing_time"]')).toHaveValue(
      settings.closing_time ?? "",
    );
    await expect(page.getByLabel(/^label$/i)).toBeVisible();
    await expect(page.locator('input[name="start_time"]')).toBeVisible();
    await expect(page.locator('input[name="end_time"]')).toBeVisible();
    await expect(page.locator("tbody tr")).toHaveCount(slots.results.length);
    await page.getByRole("button", { name: /add slot/i }).click();
    await expect(page.getByText(/this field is required/i)).toHaveCount(2);
    if (slots.results.length > 0) {
      const first = slots.results[0] as { label: string };
      const row = page.locator("tbody tr").filter({ hasText: first.label });
      await row.getByRole("button", { name: /^delete$/i }).click();
      const dialog = page.getByRole("dialog", { name: /delete slot/i });
      await expect(dialog).toBeVisible();
      await dialog.getByRole("button", { name: /^cancel$/i }).click();
      await expect(row).toBeVisible();
    }

    await page.goto("/branch-manager/delivery-zone", {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByLabel(/delivery radius/i)).toHaveValue(
      settings.delivery_radius_km,
    );
    await expect(page.getByLabel(/^latitude$/i).first()).toHaveValue(
      settings.latitude ?? "",
    );
    await expect(page.getByLabel(/^longitude$/i).first()).toHaveValue(
      settings.longitude ?? "",
    );
    await expect(page.getByLabel(/delivery charge/i)).toBeVisible();
    await expect(page.locator('[data-testid="zone-list"] > li')).toHaveCount(
      settings.zones.length,
    );
    await page.getByLabel(/delivery radius/i).fill("");
    await page
      .getByTestId("delivery-settings-form")
      .getByRole("button", { name: /^save$/i })
      .click();
    await expect(page.getByText(/this field is required/i)).toBeVisible();
    if (settings.zones.length > 0) {
      const zone = settings.zones[0] as { name: string };
      const row = page.locator('[data-testid="zone-list"] > li').filter({
        hasText: zone.name,
      });
      await row.getByRole("button", { name: /^delete$/i }).click();
      const dialog = page.getByRole("dialog", { name: /delete.*zone/i });
      await expect(dialog).toBeVisible();
      await dialog.getByRole("button", { name: /^cancel$/i }).click();
      await expect(row).toBeVisible();
    }
    await context.close();
  });

  test("malformed delivery identifiers and coordinates return controlled errors without mutation", async ({
    browser,
  }) => {
    const { context } = await apiLogin(browser, "branch_manager");
    const page = await context.newPage();
    const before = await page.request.get(
      "/api/branch-manager/delivery-settings",
    );
    expect(before.status()).toBe(200);
    const beforeBody = await before.json();

    const invalidCoordinates = await page.request.patch(
      "/api/branch-manager/delivery-settings",
      { data: { latitude: "not-a-number", longitude: "also-bad" } },
    );
    expect(invalidCoordinates.status()).toBe(400);
    expect(
      await (
        await page.request.get("/api/branch-manager/delivery-settings")
      ).json(),
    ).toEqual(beforeBody);

    expect(
      (
        await page.request.delete(
          "/api/branch-manager/time-slots/not-a-number",
        )
      ).status(),
    ).toBe(404);
    expect(
      (
        await page.request.patch("/api/delivery-zones/not-a-number", {
          data: { name: "must-not-write" },
        })
      ).status(),
    ).toBe(404);
    expect(
      (
        await page.request.delete("/api/delivery-zones/not-a-number")
      ).status(),
    ).toBe(404);
    await context.close();
  });

  test("delivery configuration is responsive, localized, themed, and runtime-clean", async ({
    browser,
  }) => {
    const { context } = await apiLogin(browser, "branch_manager");
    await setLocale(context, "en");
    await context.addCookies([
      { name: "mad_theme", value: "light", url: "http://localhost:3101" },
    ]);
    const page = await context.newPage();
    const consoleErrors = trackConsoleErrors(page);
    for (const path of DELIVERY_PAGES) {
      for (const viewport of [
        { width: 1440, height: 900 },
        { width: 390, height: 844 },
        { width: 320, height: 800 },
      ]) {
        await page.setViewportSize(viewport);
        const response = await page.goto(path, {
          waitUntil: "domcontentloaded",
        });
        expect(response?.status(), `${path} at ${viewport.width}px`).toBe(200);
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
          `${path} horizontal overflow at ${viewport.width}px`,
        ).toBeLessThanOrEqual(1);
      }
      await expectNoRawKeys(page);
    }
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await setLocale(context, "bn");
    await context.addCookies([
      { name: "mad_theme", value: "dark", url: "http://localhost:3101" },
    ]);
    for (const path of DELIVERY_PAGES) {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      await expect(page.locator("html")).toHaveAttribute("lang", "bn");
      await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
      await expectNoRawKeys(page);
    }
    expect(realErrors(consoleErrors), "application console errors").toEqual([]);
    await context.close();
  });
});
