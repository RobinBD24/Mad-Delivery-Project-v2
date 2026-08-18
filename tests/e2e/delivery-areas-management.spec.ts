import { expect, test } from "@playwright/test";

import { apiLogin, setLocale } from "./helpers";

test.describe("Delivery Areas management redesign", () => {
  test("list is management-only and Add opens a dedicated role route", async ({ browser }) => {
    const { context } = await apiLogin(browser, "super_admin");
    await setLocale(context, "en");
    const page = await context.newPage();

    await page.goto("/admin/delivery-areas", { waitUntil: "domcontentloaded" });

    await expect(page.getByRole("heading", { name: "Delivery Areas", level: 1 })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Area name" })).toHaveCount(0);

    const add = page.getByRole("link", { name: /add delivery area/i });
    await expect(add).toHaveAttribute("href", "/admin/delivery-areas/new");
    await add.click();
    await expect(page).toHaveURL(/\/admin\/delivery-areas\/new$/);
    await expect(page.getByRole("heading", { name: /add delivery area/i, level: 1 })).toBeVisible();
    await expect(page.getByRole("combobox", { name: /^branch$/i })).toBeVisible();

    await context.close();
  });

  test("GET applies trimmed server search and returns pagination metadata", async ({ browser }) => {
    const { context, req } = await apiLogin(browser, "super_admin");

    const response = await req.get("/api/delivery-areas?search=%20no-such-area-9f67a%20&page=2");
    expect(response.status()).toBe(200);
    const body = await response.json();

    expect(body).toMatchObject({
      count: 0,
      page: 1,
      page_size: 20,
      results: [],
    });
    expect(body.summary).toMatchObject({
      total: expect.any(Number),
      active: expect.any(Number),
      held: expect.any(Number),
      inactive: expect.any(Number),
    });

    await context.close();
  });

  test("Super Admin creates, edits, holds, and resumes without losing list state", async ({
    browser,
  }) => {
    const { context } = await apiLogin(browser, "super_admin");
    await setLocale(context, "en");
    const page = await context.newPage();
    const name = `Explorer Area ${Date.now()}`;

    await page.goto("/admin/delivery-areas/new", {
      waitUntil: "domcontentloaded",
    });
    const create = page.getByRole("button", { name: "Create Delivery Area" });
    await create.click();
    await expect(page.getByText("Please select an option")).toBeVisible();
    await expect(page.getByText("This field is required")).toBeVisible();

    await page.getByRole("combobox", { name: "Branch" }).selectOption({ index: 1 });
    await page.getByRole("textbox", { name: "Area name" }).fill(name);
    await page.getByRole("spinbutton", { name: /delivery time/i }).fill("37");
    const charge = page.getByRole("textbox", { name: "Delivery charge" });
    await charge.fill("invalid");
    await create.click();
    await expect(page.getByText("Enter a valid number")).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Area name" })).toHaveValue(name);

    await charge.fill("55.50");
    await create.click();
    await expect(page).toHaveURL(/\/admin\/delivery-areas\?.*search=Explorer(\+|%20)Area/);
    await expect(page.getByText("Delivery Area created.")).toBeVisible();

    const cardOrRow = page.locator("tbody tr").filter({ hasText: name });
    await expect(cardOrRow).toHaveCount(1);
    await expect(cardOrRow).toContainText("37");

    await cardOrRow.getByRole("link", { name: "Edit" }).click();
    await expect(page).toHaveURL(/\/admin\/delivery-areas\/\d+\/edit/);
    await expect(page.getByRole("textbox", { name: "Area name" })).toHaveValue(name);
    await expect(page.getByText(/delivery status:/i)).toBeVisible();
    await page.getByRole("spinbutton", { name: /delivery time/i }).fill("41");
    await page.getByRole("button", { name: "Save Changes" }).click();
    await expect(page).toHaveURL(/\/admin\/delivery-areas\?/);
    await expect(page.getByText("Delivery area updated.")).toBeVisible();
    await expect(page.locator("tbody tr").filter({ hasText: name })).toContainText("41");

    const row = page.locator("tbody tr").filter({ hasText: name });
    await row.getByRole("button", { name: "Hold Delivery" }).click();
    const holdDialog = page.getByRole("dialog", { name: new RegExp(name) });
    await expect(holdDialog).toContainText("Existing orders");
    await holdDialog.getByPlaceholder(/optional reason/i).fill("Focused QA");
    await holdDialog.getByRole("button", { name: "Hold Delivery" }).click();
    await expect(row.getByText("On Hold")).toBeVisible();

    await row.getByRole("button", { name: "Resume Delivery" }).click();
    const resumeDialog = page.getByRole("dialog", { name: new RegExp(name) });
    await expect(resumeDialog).toContainText("accepted again");
    await resumeDialog.getByRole("button", { name: "Resume Delivery" }).click();
    await expect(row.getByText("Available")).toBeVisible();

    await context.close();
  });

  test("filters compose in the URL and the responsive list never overflows", async ({
    browser,
  }) => {
    const { context } = await apiLogin(browser, "super_admin");
    await setLocale(context, "en");
    const page = await context.newPage();

    await page.goto("/admin/delivery-areas", { waitUntil: "domcontentloaded" });
    await page.getByRole("combobox", { name: "Filter by status" }).selectOption("active");
    await expect(page).toHaveURL(/status=active/);
    await page
      .getByRole("combobox", { name: "Filter by delivery state" })
      .selectOption("held");
    await expect(page).toHaveURL(/status=active.*deliveryState=held|deliveryState=held.*status=active/);
    await page
      .getByRole("combobox", { name: "Sort delivery areas" })
      .selectOption("updated:desc");
    await expect(page).toHaveURL(/sort=updated/);
    await expect(page).toHaveURL(/direction=desc/);

    for (const width of [320, 360, 375, 390, 414, 768, 1440]) {
      await page.setViewportSize({ width, height: 850 });
      expect(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth -
            document.documentElement.clientWidth,
        ),
        `horizontal overflow at ${width}px`,
      ).toBeLessThanOrEqual(1);
    }

    await context.close();
  });

  test("loading, error retry, and filtered no-result states stay distinct", async ({
    browser,
  }) => {
    const { context } = await apiLogin(browser, "super_admin");
    await setLocale(context, "en");
    const page = await context.newPage();
    await page.goto("/admin/delivery-areas", { waitUntil: "domcontentloaded" });

    let releaseRequest: (() => void) | undefined;
    const requestGate = new Promise<void>((resolve) => {
      releaseRequest = resolve;
    });
    await page.route("**/api/delivery-areas?*", async (route) => {
      await requestGate;
      await route.continue();
    });
    await page.getByRole("combobox", { name: "Filter by status" }).selectOption("active");
    await expect(page.getByTestId("delivery-area-skeleton")).toBeVisible();
    releaseRequest?.();
    await expect(page.getByTestId("delivery-area-skeleton")).toHaveCount(0);
    await page.unroute("**/api/delivery-areas?*");

    let failOnce = true;
    await page.route("**/api/delivery-areas?*", async (route) => {
      if (failOnce) {
        failOnce = false;
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ detail: "forced test failure" }),
        });
        return;
      }
      await route.continue();
    });
    await page
      .getByRole("combobox", { name: "Filter by delivery state" })
      .selectOption("held");
    await expect(page.getByText("Delivery areas could not be loaded.")).toBeVisible();
    await page.getByRole("button", { name: "Retry" }).click();
    await expect(page.getByText("Delivery areas could not be loaded.")).toHaveCount(0);
    await page.unroute("**/api/delivery-areas?*");

    await page.getByRole("button", { name: "Clear Filters" }).click();
    await page
      .getByRole("searchbox", { name: "Search delivery areas" })
      .fill("no-such-area-filter-state-72b");
    await expect(page).toHaveURL(/search=no-such-area-filter-state-72b/);
    await expect(
      page.getByText("No delivery areas match your search or filters"),
    ).toBeVisible();
    await expect(page.getByText("No delivery areas yet")).toHaveCount(0);

    await context.close();
  });

  test("Branch Manager scope ignores branch query spoofing and hides foreign edit routes", async ({
    browser,
  }) => {
    const admin = await apiLogin(browser, "super_admin");
    const manager = await apiLogin(browser, "branch_manager");
    await setLocale(manager.context, "en");
    const managerPage = await manager.context.newPage();

    const own = await (await manager.req.get("/api/delivery-areas?page_size=100")).json();
    expect(own.results.length).toBeGreaterThan(0);
    const ownBranch = own.results[0].branch;
    expect(own.results.every((area: { branch: number }) => area.branch === ownBranch)).toBe(true);

    const spoofed = await (
      await manager.req.get("/api/delivery-areas?branch=999999&page_size=100")
    ).json();
    expect(spoofed.results.map((area: { id: number }) => area.id)).toEqual(
      own.results.map((area: { id: number }) => area.id),
    );

    await managerPage.goto("/branch-manager/delivery-areas/new", {
      waitUntil: "domcontentloaded",
    });
    await expect(
      managerPage.getByRole("combobox", { name: "Branch" }),
    ).toHaveCount(0);
    await expect(
      managerPage
        .getByRole("main")
        .getByText(own.results[0].branch_name, { exact: true }),
    ).toBeVisible();

    const all = await (
      await admin.req.get("/api/delivery-areas?page_size=100")
    ).json();
    const foreign = all.results.find(
      (area: { branch: number }) => area.branch !== ownBranch,
    );
    if (foreign) {
      await managerPage.goto(
        `/branch-manager/delivery-areas/${foreign.id}/edit`,
        { waitUntil: "domcontentloaded" },
      );
      await expect(
        managerPage.getByRole("heading", { name: "Page not found" }),
      ).toBeVisible();
      await expect(
        managerPage.getByRole("button", { name: "Save Changes" }),
      ).toHaveCount(0);
    }

    await admin.context.close();
    await manager.context.close();
  });
});
