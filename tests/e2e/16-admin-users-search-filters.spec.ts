import { test, expect, type APIRequestContext, type BrowserContext, type Page } from "@playwright/test";

import {
  expectHealthy,
  newSession,
  realErrors,
  trackConsoleErrors,
} from "./helpers";

/**
 * Super Admin /admin/users search & filter toolbar:
 * real-time debounced search, role/status dropdowns, URL query state,
 * pagination, i18n (en/bn), loading/empty states and stale-request safety.
 */

const USERS_URL = "/admin/users";
const API = "**/api/auth/users*";

/** Extra approved customers so the customer filter spans 2 pages (page size 20). */
const PAG_PREFIX = "e2epag";
const PAG_COUNT = 20;
const PAG_PASSWORD = "Admin12345@##";

const rows = (page: Page) => page.locator("tbody tr");
const searchBox = (page: Page) => page.getByTestId("users-search");
const roleFilter = (page: Page) => page.getByTestId("users-role-filter");
const statusFilter = (page: Page) => page.getByTestId("users-status-filter");
const clearButton = (page: Page) => page.getByTestId("users-clear-filters");

async function createPagUsers(req: APIRequestContext): Promise<void> {
  for (let i = 1; i <= PAG_COUNT; i++) {
    const n = String(i).padStart(2, "0");
    const res = await req.post("/api/auth/users", {
      data: {
        username: `${PAG_PREFIX}${n}`,
        email: `${PAG_PREFIX}${n}@example.com`,
        first_name: "Pag",
        last_name: `User${n}`,
        role: "customer",
        status: "approved",
        password: PAG_PASSWORD,
      },
    });
    // 400 = already exists from an earlier aborted run — that's fine.
    if (!res.ok() && res.status() !== 400) {
      throw new Error(`seeding ${PAG_PREFIX}${n} failed: ${res.status()}`);
    }
  }
}

async function deletePagUsers(req: APIRequestContext): Promise<void> {
  const res = await req.get(`/api/auth/users?search=${PAG_PREFIX}&page_size=100`);
  if (!res.ok()) return;
  const body = (await res.json()) as { results: { id: number; username: string }[] };
  for (const u of body.results) {
    if (u.username.startsWith(PAG_PREFIX)) await req.delete(`/api/auth/users/${u.id}`);
  }
}

test.describe.configure({ mode: "serial" });

test.describe("Admin users — search & filter toolbar", () => {
  let context: BrowserContext;
  let page: Page;
  let errors: string[];

  test.beforeAll(async ({ browser }) => {
    ({ context, page } = await newSession(browser, "super_admin"));
    errors = trackConsoleErrors(page);
    await createPagUsers(page.request);
  });

  test.afterAll(async () => {
    await deletePagUsers(page.request);
    await context.close();
  });

  test.beforeEach(async () => {
    await page.unrouteAll({ behavior: "ignoreErrors" });
    await page.goto(USERS_URL);
    await expect(rows(page).first()).toBeVisible();
    // Interactions must not race hydration: pre-hydration input events never
    // reach React and the toolbar would silently ignore them.
    await page.waitForLoadState("networkidle");
  });

  test("page loads for super admin with toolbar, no old filter chips", async () => {
    await expect(page.getByRole("heading", { name: /all users/i })).toBeVisible();
    await expect(searchBox(page)).toBeVisible();
    await expect(roleFilter(page)).toBeVisible();
    await expect(statusFilter(page)).toBeVisible();
    // Clear Filters hidden while nothing is active.
    await expect(clearButton(page)).toHaveCount(0);
    // The old rows of role/status chip links are gone.
    await expect(page.locator('a[href*="/admin/users?role="]')).toHaveCount(0);
    await expectHealthy(page);
  });

  test("search filters automatically by name — no Enter, focus kept, URL updated", async () => {
    await searchBox(page).click();
    await searchBox(page).pressSequentially("Branch Manager", { delay: 30 });
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page).first()).toContainText("@branch_manager");
    await expect(page).toHaveURL(/search=Branch(\+|%20)Manager/);
    await expect(searchBox(page)).toBeFocused();
  });

  test("search works by username", async () => {
    await searchBox(page).fill("blocked_customer");
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page).first()).toContainText("@blocked_customer");
  });

  test("search works by email", async () => {
    await searchBox(page).fill("rider@example.com");
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page).first()).toContainText("@rider");
  });

  test("search works by phone", async () => {
    await searchBox(page).fill("01711111111");
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page).first()).toContainText("@customer");
  });

  test("role dropdown filters users and updates the URL", async () => {
    await roleFilter(page).selectOption("rider");
    await expect(page).toHaveURL(/role=rider/);
    // Riders only (multiple riders may exist) — the seeded rider is present and
    // no customers leak into the filtered list.
    await expect(page.locator("tbody")).toContainText("@rider");
    await expect(page.locator("tbody")).not.toContainText("@customer");
  });

  test("status dropdown filters users (blocked → only blocked customer)", async () => {
    await statusFilter(page).selectOption("blocked");
    await expect(page).toHaveURL(/status=blocked/);
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page).first()).toContainText("@blocked_customer");
  });

  test("search + role work together", async () => {
    await roleFilter(page).selectOption("customer");
    await searchBox(page).fill("blocked");
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page).first()).toContainText("@blocked_customer");
    await expect(page).toHaveURL(/search=blocked/);
    await expect(page).toHaveURL(/role=customer/);
  });

  test("search + status work together", async () => {
    await statusFilter(page).selectOption("approved");
    await searchBox(page).fill("rider@example.com");
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page).first()).toContainText("@rider");
  });

  test("role + status work together", async () => {
    await roleFilter(page).selectOption("customer");
    await statusFilter(page).selectOption("blocked");
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page).first()).toContainText("@blocked_customer");
  });

  test("search + role + status work together", async () => {
    await roleFilter(page).selectOption("customer");
    await statusFilter(page).selectOption("approved");
    await searchBox(page).fill("Pag User01");
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page).first()).toContainText(`@${PAG_PREFIX}01`);
  });

  test("clearing the search restores the filtered list", async () => {
    await roleFilter(page).selectOption("customer");
    await searchBox(page).fill("blocked");
    await expect(rows(page)).toHaveCount(1);
    await searchBox(page).fill("");
    await expect(page).toHaveURL(/role=customer/);
    await expect(page).not.toHaveURL(/search=/);
    // Newest-first: the first page of the customer list is the e2e pagination fixtures.
    await expect(page.locator("tbody")).toContainText(`@${PAG_PREFIX}`);
    await expect.poll(() => rows(page).count()).toBeGreaterThan(1);
  });

  test("Clear Filters resets everything and returns to /admin/users", async () => {
    await roleFilter(page).selectOption("rider");
    await searchBox(page).fill("rider");
    await statusFilter(page).selectOption("approved");
    await expect(clearButton(page)).toBeVisible();
    await clearButton(page).click();
    await expect(page).toHaveURL(/\/admin\/users$/);
    await expect(searchBox(page)).toHaveValue("");
    await expect(roleFilter(page)).toHaveValue("");
    await expect(statusFilter(page)).toHaveValue("");
    await expect.poll(() => rows(page).count()).toBeGreaterThan(1);
    await expect(clearButton(page)).toHaveCount(0);
  });

  test("refresh preserves search and filters", async () => {
    await page.goto(`${USERS_URL}?search=rider&role=rider`);
    await expect(rows(page)).toHaveCount(1);
    await page.reload();
    await expect(searchBox(page)).toHaveValue("rider");
    await expect(roleFilter(page)).toHaveValue("rider");
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page).first()).toContainText("@rider");
  });

  test("browser Back/Forward restores filter state", async () => {
    await roleFilter(page).selectOption("rider");
    await expect(page).toHaveURL(/role=rider/);
    await statusFilter(page).selectOption("approved");
    await expect(page).toHaveURL(/status=approved/);

    await page.goBack();
    await expect(page).toHaveURL(/role=rider/);
    await expect(page).not.toHaveURL(/status=/);
    await expect(statusFilter(page)).toHaveValue("");

    await page.goBack();
    await expect(page).not.toHaveURL(/role=/);
    await expect(roleFilter(page)).toHaveValue("");

    await page.goForward();
    await expect(page).toHaveURL(/role=rider/);
    await expect(roleFilter(page)).toHaveValue("rider");
  });

  test("pagination preserves filters; new search resets to page 1", async () => {
    await roleFilter(page).selectOption("customer");
    const pager = page.locator('nav[aria-label="Pagination"]');
    await expect(pager).toBeVisible();
    await pager.getByRole("button", { name: "2" }).click();
    await expect(page).toHaveURL(/role=customer/);
    await expect(page).toHaveURL(/page=2/);
    await expect(rows(page).first()).toBeVisible();
    // Newest-first: page 2 of the customer filter holds the older seed customers.
    await expect(page.locator("tbody")).toContainText("@customer");

    // Typing a new search must reset pagination to page 1.
    await searchBox(page).fill("Pag");
    await expect(page).not.toHaveURL(/page=2/);
    await expect(page).toHaveURL(/search=Pag/);
    await expect(rows(page).first()).toBeVisible();
  });

  test("debounce coalesces fast typing and stale responses never win", async () => {
    const requested: string[] = [];
    await page.route(API, async (route) => {
      const url = new URL(route.request().url());
      const s = url.searchParams.get("search") ?? "";
      requested.push(s);
      // Slow down every intermediate query so a stale response would arrive
      // AFTER the final one if the client failed to cancel/sequence it.
      if (s && s !== "rider@example.com") await new Promise((r) => setTimeout(r, 1000));
      await route.continue().catch(() => {}); // client may have aborted a stale request
    });

    await searchBox(page).click();
    await searchBox(page).pressSequentially("rider@example.com", { delay: 20 });
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page).first()).toContainText("@rider");

    // Debounce: 17 keystrokes must not mean 17 requests.
    expect(requested.length).toBeLessThan(5);

    // Give any stale (delayed) response time to land — the table must not change.
    await page.waitForTimeout(1500);
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page).first()).toContainText("@rider");
    await expect(searchBox(page)).toHaveValue("rider@example.com");
  });

  test("a subtle loading indicator appears while searching", async () => {
    await page.route(API, async (route) => {
      await new Promise((r) => setTimeout(r, 700));
      await route.continue().catch(() => {});
    });
    await searchBox(page).fill("management");
    await expect(page.getByTestId("users-searching")).toBeVisible();
    // The page keeps its content — no full-screen loader.
    await expect(searchBox(page)).toHaveValue("management");
    await expect(rows(page)).toHaveCount(1);
    await expect(page.getByTestId("users-searching")).toHaveCount(0);
  });

  test("no-results state offers Clear Filters and recovers", async () => {
    await searchBox(page).fill("zzz-no-such-user");
    await expect(page.getByText("No users found")).toBeVisible();
    await expect(page.getByText(/try changing your search or filters/i)).toBeVisible();
    const emptyClear = page.locator("main").getByRole("button", { name: /clear filters/i }).last();
    await emptyClear.click();
    await expect(rows(page).first()).toBeVisible();
    await expectHealthy(page);
  });

  test("View / Edit / Delete actions still work with filters active", async () => {
    await searchBox(page).fill("blocked_customer");
    await expect(rows(page)).toHaveCount(1);
    const row = rows(page).first();

    await row.getByRole("link", { name: /^view$/i }).click();
    await expect(page).toHaveURL(/\/admin\/users\/\d+$/);
    await page.goBack();
    await expect(rows(page)).toHaveCount(1);

    await row.getByRole("link", { name: /^edit$/i }).click();
    await expect(page).toHaveURL(/\/admin\/users\/\d+\/edit$/);
    await page.goBack();
    await expect(rows(page)).toHaveCount(1);

    await row.getByRole("button", { name: /^delete$/i }).click();
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: /^cancel$/i }).click();
    await expect(dialog).toHaveCount(0);
    await expect(rows(page)).toHaveCount(1);
  });

  test("mobile layout does not overflow horizontally", async () => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(USERS_URL);
    await expect(searchBox(page)).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
    await page.setViewportSize({ width: 1280, height: 720 });
  });

  test("English labels render with no console errors or raw keys", async () => {
    await expect(searchBox(page)).toHaveAttribute("placeholder", /search by name, username/i);
    await expect(roleFilter(page).locator("option").first()).toHaveText("All Roles");
    await expect(statusFilter(page).locator("option").first()).toHaveText("All Statuses");
    await roleFilter(page).selectOption("customer");
    await expect(clearButton(page)).toHaveText("Clear Filters");
    await expectHealthy(page);
    expect(realErrors(errors)).toEqual([]);
  });
});

test.describe("Admin users — Bangla labels", () => {
  test("toolbar is fully translated in Bangla", async ({ browser }) => {
    const { context, page } = await newSession(browser, "super_admin", "bn");
    await page.goto(USERS_URL);
    await page.waitForLoadState("networkidle");
    await expect(searchBox(page)).toHaveAttribute("placeholder", /নাম, ইউজারনেম/);
    await expect(roleFilter(page).locator("option").first()).toHaveText("সব ভূমিকা");
    await expect(statusFilter(page).locator("option").first()).toHaveText("সব স্ট্যাটাস");

    await roleFilter(page).selectOption("customer");
    await expect(clearButton(page)).toHaveText("ফিল্টার মুছুন");

    await searchBox(page).fill("zzz-no-such-user");
    await expect(page.getByText("কোনো ব্যবহারকারী পাওয়া যায়নি")).toBeVisible();
    await expectHealthy(page);
    await context.close();
  });
});
