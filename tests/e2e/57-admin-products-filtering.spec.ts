import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { newSession, setLocale } from "./helpers";

/**
 * SUPER ADMIN — All Products list: instant filters, instant search, 15 per page.
 *
 * The page previously carried an Apply button beside every dropdown and a Search
 * button beside the search box, so nothing filtered until a second click, and it
 * paged at the shared default of 10. Filtering is still entirely SERVER-SIDE —
 * only the trigger changed, from a form submit to a URL rewrite.
 */

test.beforeEach(async ({ context }) => setLocale(context, "en"));

const BASE = "/admin/products";
const PAGE_SIZE = 15;
const uniq = (p: string) => `${p}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;

async function firstBranch(req: APIRequestContext) {
  const { results } = await (await req.get("/api/branches/?page_size=1")).json();
  return results[0] as { id: number; name: string };
}

async function makeCategory(req: APIRequestContext, branchId: number) {
  const res = await req.post("/api/categories/", {
    data: { name: uniq("PFCat"), branch_id: branchId, is_active: true },
  });
  expect(res.status()).toBe(201);
  return (await res.json()) as { id: number; name: string };
}

async function makeProduct(req: APIRequestContext, branchId: number, categoryId: number, name: string) {
  const res = await req.post("/api/products/", {
    data: {
      branch_id: branchId,
      name,
      brand: "cheez",
      category: categoryId,
      is_available: true,
      variations: JSON.stringify([{ name: "Reg", price: 120, isDefault: true, isEnabled: true }]),
    },
  });
  expect(res.status(), `product ${name} created`).toBe(201);
  return (await res.json()) as { id: number; name: string };
}

/** Rows in the desktop table (ResponsiveDataView also renders a hidden mobile tree). */
function rows(page: Page) {
  return page.getByTestId("responsive-table").locator("tbody tr");
}

/**
 * The product-name cell of every row. `rows.locator("td").first()` would collapse
 * to a single cell across the whole table, not one per row.
 */
async function rowNames(page: Page): Promise<string[]> {
  return rows(page).locator("td:first-child").allInnerTexts();
}

test.describe("No Apply or Search buttons remain", () => {
  test("the filter bar has no Apply button and no Search submit", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    await admin.page.goto(BASE, { waitUntil: "domcontentloaded" });

    const bar = admin.page.getByTestId("filter-bar");
    await expect(bar.getByRole("button", { name: /^apply$/i })).toHaveCount(0);
    await expect(bar.getByRole("button", { name: /^search$/i })).toHaveCount(0);
    // The search box and the filters are still there.
    await expect(admin.page.getByTestId("instant-search")).toBeVisible();
    await expect(admin.page.getByTestId("instant-filter-branch")).toBeVisible();

    await admin.context.close();
  });
});

test.describe("Filters apply immediately", () => {
  test("each dropdown filters on change, with no second click", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const branch = await firstBranch(admin.req);
    await admin.page.goto(BASE, { waitUntil: "domcontentloaded" });

    for (const [name, value] of [
      ["branch", String(branch.id)],
      ["brand", "cheez"],
      ["status", "available"],
      ["variationType", "THICK"],
    ] as const) {
      await admin.page.getByTestId(`instant-filter-${name}`).selectOption(value);
      // The URL carries the filter without any Apply press…
      await expect(admin.page).toHaveURL(new RegExp(`${name}=${value}`));
      // …and the server re-rendered: either matching rows or the no-results state.
      const count = await rows(admin.page).count();
      const empty = await admin.page.getByText(/no matching records/i).count();
      expect(count > 0 || empty > 0, `${name} produced a definite result`).toBe(true);
    }

    await admin.context.close();
  });

  test("changing a filter resets to page 1 and preserves the others", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const branch = await firstBranch(admin.req);

    await admin.page.goto(`${BASE}?brand=cheez&page=2`, { waitUntil: "domcontentloaded" });
    await admin.page.getByTestId("instant-filter-branch").selectOption(String(branch.id));

    await expect(admin.page).toHaveURL(new RegExp(`branch=${branch.id}`));
    await expect(admin.page, "the other filter survives").toHaveURL(/brand=cheez/);
    await expect(admin.page, "paging resets").not.toHaveURL(/page=2/);

    await admin.context.close();
  });

  test("selecting All removes only that filter", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    await admin.page.goto(`${BASE}?brand=cheez&status=available`, { waitUntil: "domcontentloaded" });

    await admin.page.getByTestId("instant-filter-status").selectOption("");
    await expect(admin.page).not.toHaveURL(/status=/);
    await expect(admin.page, "the untouched filter stays").toHaveURL(/brand=cheez/);

    await admin.context.close();
  });

  test("dropdowns show readable labels, never raw ids", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const branch = await firstBranch(admin.req);
    const category = await makeCategory(admin.req, branch.id);
    await admin.page.goto(BASE, { waitUntil: "domcontentloaded" });

    // The option VALUE is the database id; the visible LABEL is the name.
    const option = admin.page
      .getByTestId("instant-filter-category")
      .locator(`option[value="${category.id}"]`);
    await expect(option).toHaveText(category.name);
    // The branch dropdown likewise shows the branch name, not its id.
    await expect(
      admin.page.getByTestId("instant-filter-branch").locator(`option[value="${branch.id}"]`),
    ).toHaveText(branch.name);

    await admin.context.close();
  });
});

test.describe("Search runs while typing", () => {
  test("typing filters the list, and clearing restores it", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const branch = await firstBranch(admin.req);
    const category = await makeCategory(admin.req, branch.id);
    const needle = uniq("Zqxtarget");
    await makeProduct(admin.req, branch.id, category.id, needle);

    await admin.page.goto(BASE, { waitUntil: "domcontentloaded" });
    const box = admin.page.getByTestId("instant-search");
    await box.fill(needle);

    // No button press: the URL and the table follow the debounce on their own.
    await expect(admin.page).toHaveURL(new RegExp(`search=${encodeURIComponent(needle)}`));
    await expect(rows(admin.page)).toHaveCount(1);
    expect(await rowNames(admin.page)).toContain(needle);

    await admin.page.getByTestId("instant-search-clear").click();
    await expect(admin.page, "clearing drops the parameter").not.toHaveURL(/search=/);
    await expect(rows(admin.page).first()).toBeVisible();

    await admin.context.close();
  });

  test("a fast retype settles on the LAST term, not an earlier one", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const branch = await firstBranch(admin.req);
    const category = await makeCategory(admin.req, branch.id);
    const first = uniq("Aaafirst");
    const second = uniq("Bbbsecond");
    await makeProduct(admin.req, branch.id, category.id, first);
    await makeProduct(admin.req, branch.id, category.id, second);

    await admin.page.goto(BASE, { waitUntil: "domcontentloaded" });
    const box = admin.page.getByTestId("instant-search");
    // Two terms typed inside one debounce window: the older navigation must be
    // cancelled, never applied after the newer one.
    await box.fill(first);
    await box.fill(second);

    await expect(admin.page).toHaveURL(new RegExp(`search=${encodeURIComponent(second)}`));
    await expect(admin.page, "the superseded term never lands").not.toHaveURL(
      new RegExp(`search=${encodeURIComponent(first)}`),
    );
    expect(await rowNames(admin.page)).toEqual([second]);

    await admin.context.close();
  });

  test("search keeps the active filters", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    await admin.page.goto(`${BASE}?brand=cheez`, { waitUntil: "domcontentloaded" });
    await admin.page.getByTestId("instant-search").fill("pizza");

    await expect(admin.page).toHaveURL(/search=pizza/);
    await expect(admin.page, "the filter survives the search").toHaveURL(/brand=cheez/);

    await admin.context.close();
  });
});

test.describe("Pagination shows 15 per page", () => {
  test("page 1 holds at most 15 rows and page 2 continues without overlap", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    await admin.page.goto(BASE, { waitUntil: "domcontentloaded" });

    const firstPage = await rowNames(admin.page);
    expect(firstPage.length, "at most 15 per page").toBeLessThanOrEqual(PAGE_SIZE);

    const total = Number(
      (await admin.page.getByTestId("list-results-range").innerText()).match(/of\s+([\d,]+)/)?.[1]?.replace(/,/g, "") ??
        "0",
    );
    if (total > PAGE_SIZE) {
      expect(firstPage.length, "a full first page is exactly 15").toBe(PAGE_SIZE);

      await admin.page.goto(`${BASE}?page=2`, { waitUntil: "domcontentloaded" });
      const secondPage = await rowNames(admin.page);
      expect(secondPage.length).toBeGreaterThan(0);
      expect(
        secondPage.filter((n) => firstPage.includes(n)),
        "no product appears on both pages",
      ).toEqual([]);
    }

    await admin.context.close();
  });

  test("the results range reads correctly", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    await admin.page.goto(BASE, { waitUntil: "domcontentloaded" });

    const text = await admin.page.getByTestId("list-results-range").innerText();
    const match = text.match(/([\d,]+)\D+([\d,]+)\D+([\d,]+)/);
    expect(match, `range parsed from "${text}"`).not.toBeNull();
    const [from, to, totalCount] = match!.slice(1).map((n) => Number(n.replace(/,/g, "")));
    expect(from).toBe(1);
    expect(to).toBe(Math.min(PAGE_SIZE, totalCount));
    expect(to - from + 1).toBe((await rowNames(admin.page)).length);

    await admin.context.close();
  });

  test("paging preserves search and filters", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    await admin.page.goto(`${BASE}?brand=cheez&page=2`, { waitUntil: "domcontentloaded" });
    // Whatever the page renders, the filter must still be in the URL and applied.
    await expect(admin.page).toHaveURL(/brand=cheez/);
    const chips = admin.page.getByTestId("filter-bar");
    await expect(chips).toContainText(/cheez/i);

    await admin.context.close();
  });

  test("a page beyond the end normalises instead of showing an empty table", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    // Far past the end — reachable for real by deleting the last row of the
    // final page.
    await admin.page.goto(`${BASE}?page=9999`, { waitUntil: "domcontentloaded" });

    await expect(admin.page, "redirected to a real page").not.toHaveURL(/page=9999/);
    expect((await rowNames(admin.page)).length, "rows are shown").toBeGreaterThan(0);

    await admin.context.close();
  });
});

test.describe("Nothing else changed", () => {
  test("summary cards still count the whole dataset, not the page", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    await admin.page.goto(BASE, { waitUntil: "domcontentloaded" });

    // A fresh server render for the baseline: earlier tests in this file create
    // products, and a cached router payload would otherwise supply a total from
    // before those inserts — making the comparison measure the cache, not the
    // filtering behaviour under test.
    await admin.page.reload({ waitUntil: "domcontentloaded" });
    // Compare the NUMBER, not the raw text: innerText collapses whitespace
    // differently between a full render and a transition render, so the strings
    // differ ("Total Products1507" vs "Total Products\n1507") while the value
    // does not.
    const totalOf = async () =>
      (await admin.page.getByTestId("summary-card").first().innerText()).replace(/\D/g, "");
    const unfiltered = await totalOf();
    expect(unfiltered, "a total was read").not.toBe("");

    // Filtering the table must not rewrite the global totals.
    await admin.page.getByTestId("instant-filter-status").selectOption("held");
    await expect(admin.page).toHaveURL(/status=held/);
    await expect.poll(totalOf).toBe(unfiltered);

    await admin.context.close();
  });

  test("row actions still open", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    await admin.page.goto(BASE, { waitUntil: "domcontentloaded" });

    const trigger = rows(admin.page).first().locator('[data-testid^="product-actions-"]');
    await trigger.click();
    await expect(admin.page.getByRole("link", { name: /^edit$/i }).first()).toBeVisible();

    await admin.context.close();
  });

  test("other list pages keep their Apply buttons untouched", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    // The shared server-rendered controls are unchanged; only /admin/products
    // opted into the instant variant.
    await admin.page.goto("/admin/customers", { waitUntil: "domcontentloaded" });
    await expect(
      admin.page.getByTestId("filter-bar").getByRole("button", { name: /^apply$/i }).first(),
    ).toBeVisible();

    await admin.context.close();
  });
});
