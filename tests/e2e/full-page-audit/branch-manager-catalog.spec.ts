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

const CATALOG_PAGES = [
  "/branch-manager/catalog",
  "/branch-manager/catalog/categories/create",
  "/branch-manager/catalog/categories/1/edit",
  "/branch-manager/catalog/products/create",
];

test.describe("Full page audit — Branch Manager catalog", () => {
  test("catalog routes enforce role and category-governance boundaries", async ({
    browser,
    page,
  }) => {
    for (const path of CATALOG_PAGES) {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(/\/login$/);
    }
    for (const role of DEMO_USERS.filter((role) => role !== "branch_manager")) {
      const { context } = await apiLogin(browser, role);
      await setLocale(context, "en");
      const rolePage = await context.newPage();
      for (const path of CATALOG_PAGES) {
        await rolePage.goto(path, { waitUntil: "domcontentloaded" });
        await expect(rolePage, `${role} denial for ${path}`).toHaveURL(
          new RegExp(`${ROLE_HOME[role]}$`),
        );
      }
      await context.close();
    }

    const { context, req } = await apiLogin(browser, "branch_manager");
    const categories = await (await req.get("/api/categories?page_size=100")).json();
    const redirectPage = await context.newPage();
    await redirectPage.goto("/branch-manager/catalog/categories/create");
    await expect(redirectPage).toHaveURL(/\/branch-manager\/catalog$/);
    await redirectPage.goto(
      `/branch-manager/catalog/categories/${categories.results[0]?.id ?? 1}/edit`,
    );
    await expect(redirectPage).toHaveURL(/\/branch-manager\/catalog$/);
    expect(
      (
        await req.post("/api/categories", {
          data: { name: "must-not-create" },
        })
      ).status(),
    ).toBe(403);
    if (categories.results.length > 0) {
      expect(
        (
          await req.patch(`/api/categories/${categories.results[0].id}`, {
            data: { name: "must-not-edit" },
          })
        ).status(),
      ).toBe(403);
    }
    await context.close();
  });

  test("catalog list and product forms match own-branch data with cancel-safe availability", async ({
    browser,
  }) => {
    const { context } = await apiLogin(browser, "branch_manager");
    await setLocale(context, "en");
    const page = await context.newPage();
    const products = await (
      await page.request.get("/api/products?page_size=100")
    ).json();
    const categories = await (
      await page.request.get("/api/categories?page_size=100")
    ).json();

    await page.goto("/branch-manager/catalog", {
      waitUntil: "domcontentloaded",
    });
    await expect(page.locator("tbody tr")).toHaveCount(products.results.length);
    await expect(page.getByPlaceholder(/search products/i)).toBeVisible();
    await expect(
      page.locator('a[href="/branch-manager/catalog/products/create"]'),
    ).toBeVisible();
    await expect(
      page.locator('a[href*="/catalog/categories/"]'),
    ).toHaveCount(0);
    for (const category of categories.results as Array<{
      id: number;
      name: string;
    }>) {
      await expect(
        page.locator(`a[href="/branch-manager/catalog?cat=${category.id}"]`),
      ).toContainText(category.name);
    }
    if (products.results.length > 0) {
      const first = products.results[0] as {
        id: number;
        name: string;
        is_available: boolean;
      };
      const row = page.locator("tbody tr").first();
      await expect(row).toContainText(first.name);
      await expect(
        row.locator(
          `a[href="/branch-manager/catalog/products/${first.id}/edit"]`,
        ),
      ).toBeVisible();
      if (first.is_available) {
        await row.getByRole("button", { name: /^disable$/i }).click();
        await expect(
          row.getByLabel(/^reason/i),
        ).toBeVisible();
        await row.getByRole("button", { name: /^cancel$/i }).click();
        await expect(row.getByText(/available/i)).toBeVisible();
      }
    }

    await page.goto("/branch-manager/catalog/products/create", {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByLabel("Branch", { exact: true })).toBeDisabled();
    await expect(page.getByLabel(/product name/i)).toBeVisible();
    await page.getByRole("button", { name: /add product/i }).last().click();
    await expect(page.getByText(/required/i).first()).toBeVisible();
    await expect(
      page.locator('a[href="/branch-manager/catalog"]', {
        hasText: /cancel/i,
      }),
    ).toBeVisible();

    if (products.results.length > 0) {
      const first = products.results[0] as { id: number; name: string };
      await page.goto(
        `/branch-manager/catalog/products/${first.id}/edit`,
        { waitUntil: "domcontentloaded" },
      );
      await expect(page.getByLabel(/product name/i)).toHaveValue(first.name);
      await expect(
        page.locator('a[href="/branch-manager/catalog"]', {
          hasText: /cancel/i,
        }),
      ).toBeVisible();
    }
    const malformed = await page.goto(
      "/branch-manager/catalog/products/not-a-number/edit",
      { waitUntil: "domcontentloaded" },
    );
    expect([200, 404]).toContain(malformed?.status());
    await expect(
      page.getByRole("heading", { name: /page not found/i }),
    ).toBeVisible();
    await context.close();
  });

  test("catalog pages are responsive, localized, themed, and runtime-clean", async ({
    browser,
  }) => {
    const { context } = await apiLogin(browser, "branch_manager");
    await setLocale(context, "en");
    await context.addCookies([
      { name: "mad_theme", value: "light", url: "http://localhost:3101" },
    ]);
    const page = await context.newPage();
    const products = await (
      await page.request.get("/api/products?page_size=100")
    ).json();
    const paths = [
      "/branch-manager/catalog",
      "/branch-manager/catalog/products/create",
      ...(products.results.length
        ? [
            `/branch-manager/catalog/products/${products.results[0].id}/edit`,
          ]
        : []),
    ];
    const consoleErrors = trackConsoleErrors(page);
    for (const path of paths) {
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
    for (const path of paths) {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      await expect(page.locator("html")).toHaveAttribute("lang", "bn");
      await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
      await expectNoRawKeys(page);
    }
    expect(realErrors(consoleErrors), "application console errors").toEqual([]);
    await context.close();
  });
});
