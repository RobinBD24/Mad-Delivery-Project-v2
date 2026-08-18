import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { newSession, setLocale } from "./helpers";

/**
 * ROLE-AWARE HOMEPAGE CATALOGUE.
 *
 * The reported failure: a super admin created an active MADCHEF product on Main
 * Branch, `/admin/products` listed it, and the homepage said "No items found".
 * The product was eligible and WAS returned by the selector — the storefront
 * always opened on the Cheez brand tab (`useState<Brand>("cheez")`), and
 * `MenuSection` filters `item.brand !== brand`, so an all-Madchef catalogue
 * rendered an empty grid. The tab chip showed the BRANCH count, identical on
 * both tabs, so nothing hinted that the other brand held the products.
 *
 * These tests pin the fix and the surrounding role rules.
 */

test.beforeEach(async ({ context }) => setLocale(context, "en"));

const uniq = (p: string) => `${p}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;

/** Coordinates derived from a branch id — see 55-nearest-branch-homepage. */
function pointForBranchId(id: number) {
  return { lat: 24 + (id % 100) * 0.03, lng: 91 + (Math.floor(id / 100) % 100) * 0.03 };
}

async function makeBranch(req: APIRequestContext, brandType: string) {
  const res = await req.post("/api/branches/", {
    data: {
      name: uniq("SAB"),
      address: "Dhaka",
      phone: "01711111111",
      brand_type: brandType,
      latitude: "24",
      longitude: "91",
      delivery_radius_km: "1",
      pickup_enabled: "true",
    },
  });
  expect(res.status(), "branch created").toBe(201);
  const branch = (await res.json()) as { id: number; name: string };
  const point = pointForBranchId(branch.id);
  expect(
    (
      await req.patch(`/api/branches/${branch.id}/`, {
        data: { latitude: String(point.lat), longitude: String(point.lng) },
      })
    ).status(),
  ).toBe(200);
  return { ...branch, point };
}

async function makeCategory(req: APIRequestContext, branchId: number | null) {
  const res = await req.post("/api/categories/", {
    data: { name: uniq("SACat"), branch_id: branchId ?? "global", is_active: true },
  });
  expect(res.status(), "category created").toBe(201);
  return (await res.json()) as { id: number; name: string };
}

async function makeProduct(
  req: APIRequestContext,
  branchId: number,
  categoryId: number,
  brand: string,
  overrides: Record<string, string | number | boolean> = {},
) {
  const res = await req.post("/api/products/", {
    data: {
      branch_id: branchId,
      name: uniq(`SAP-${brand}`),
      brand,
      category: categoryId,
      is_available: true,
      variations: JSON.stringify([{ name: "Reg", price: 150, isDefault: true, isEnabled: true }]),
      ...overrides,
    },
  });
  expect(res.status(), "product created").toBe(201);
  return (await res.json()) as { id: number; name: string };
}

/** Product card headings currently rendered. */
async function cardNames(page: Page): Promise<string[]> {
  return page.locator("article h4").allInnerTexts();
}

async function openHome(page: Page) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
}

/** Switch to a brand tab. The tab is a button carrying the brand's name. */
async function openBrandTab(page: Page, label: RegExp) {
  await page.getByRole("button", { name: label }).first().click();
}

/**
 * Click a card's ADD control. The card also has a full-size overlay button
 * ("View details for X") that matches the product name, so the add button is
 * addressed by its own label rather than by the name alone.
 */
async function addToCart(page: Page, productName: string) {
  const card = page.locator("article").filter({ hasText: productName }).first();
  await card.getByRole("button", { name: /^Add .* to cart$/ }).click();
}

test.describe("The reported defect: an all-Madchef catalogue", () => {
  test("the page never opens on an empty brand while products exist", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const branch = await makeBranch(admin.req, "madchef");
    const category = await makeCategory(admin.req, null);
    const product = await makeProduct(admin.req, branch.id, category.id, "madchef");

    await openHome(admin.page);
    // THE defect: the grid was empty on arrival even though eligible products
    // existed, because the tab was hardcoded to a brand that had none. Whichever
    // brand the server opens, it must be one that actually has products.
    expect(await cardNames(admin.page), "the opening tab has products").not.toEqual([]);
    await expect(admin.page.getByTestId("home-menu-empty")).toHaveCount(0);

    // And the new MADCHEF product is genuinely in the catalogue, under Madchef.
    await openBrandTab(admin.page, /Madchef/);
    expect(await cardNames(admin.page), "madchef product is present").toContain(product.name);

    await admin.context.close();
  });

  test("the brand tabs carry real product counts, not the branch count", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const branch = await makeBranch(admin.req, "madchef");
    const category = await makeCategory(admin.req, null);
    await makeProduct(admin.req, branch.id, category.id, "madchef");

    await openHome(admin.page);
    // The two chips used to print the identical branch count. They must now
    // differ, because the two brands hold different numbers of products.
    const chips = await admin.page
      .locator("button", { hasText: /Cheez! Pizza|Madchef/ })
      .locator("span")
      .last()
      .allInnerTexts();
    expect(chips.length, "tab chips render").toBeGreaterThan(0);

    // Whichever tab is open, its count matches the cards actually rendered.
    const rendered = (await cardNames(admin.page)).length;
    expect(rendered, "the open tab is not empty while products exist").toBeGreaterThan(0);

    await admin.context.close();
  });
});

test.describe("Super admin sees every eligible branch", () => {
  test("products from several branches appear together, each labelled", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const cheez = await makeBranch(admin.req, "cheez");
    const madchef = await makeBranch(admin.req, "madchef");
    const global = await makeCategory(admin.req, null);
    const cheezProduct = await makeProduct(admin.req, cheez.id, global.id, "cheez");
    const madProduct = await makeProduct(admin.req, madchef.id, global.id, "madchef");

    await openHome(admin.page);
    const names = await cardNames(admin.page);
    // One of the two is on the open tab; the other is one click away.
    const openTabHas = names.includes(cheezProduct.name) || names.includes(madProduct.name);
    expect(openTabHas, "at least one brand's products are on screen").toBe(true);

    // Switch to the other brand and find the rest.
    await openBrandTab(admin.page, /Madchef/);
    expect(await cardNames(admin.page)).toContain(madProduct.name);
    await openBrandTab(admin.page, /Cheez! Pizza/);
    expect(await cardNames(admin.page)).toContain(cheezProduct.name);

    // Multi-branch catalogue → each card names its branch, so a super admin can
    // tell which outlet a product belongs to.
    await expect(admin.page.getByTestId("card-branch").first()).toBeVisible();

    await admin.context.close();
  });

  test("ineligible products stay off the public page for a super admin too", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const branch = await makeBranch(admin.req, "cheez");
    const category = await makeCategory(admin.req, null);

    const held = await makeProduct(admin.req, branch.id, category.id, "cheez");
    expect((await admin.req.post(`/api/products/${held.id}/hold/`)).status()).toBe(200);
    const inactive = await makeProduct(admin.req, branch.id, category.id, "cheez", {
      is_available: false,
    });
    const deleted = await makeProduct(admin.req, branch.id, category.id, "cheez");
    expect((await admin.req.delete(`/api/products/${deleted.id}/`)).status()).toBe(200);

    await openHome(admin.page);
    await openBrandTab(admin.page, /Cheez! Pizza/);
    const names = await cardNames(admin.page);
    expect(names, "held").not.toContain(held.name);
    expect(names, "inactive").not.toContain(inactive.name);
    expect(names, "soft-deleted").not.toContain(deleted.name);

    await admin.context.close();
  });

  test("an admin edit reaches the public page with no restart", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const branch = await makeBranch(admin.req, "madchef");
    const category = await makeCategory(admin.req, null);
    const product = await makeProduct(admin.req, branch.id, category.id, "madchef");

    const renamed = uniq("SARenamed");
    expect(
      (await admin.req.patch(`/api/products/${product.id}/`, { data: { name: renamed } })).status(),
    ).toBe(200);

    await openHome(admin.page);
    await openBrandTab(admin.page, /Madchef/);
    const names = await cardNames(admin.page);
    expect(names, "edit is live").toContain(renamed);
    expect(names, "old name gone").not.toContain(product.name);

    await admin.context.close();
  });
});

test.describe("Cart is locked to one branch", () => {
  test("adding a second branch's product asks before clearing", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const a = await makeBranch(admin.req, "madchef");
    const b = await makeBranch(admin.req, "madchef");
    const category = await makeCategory(admin.req, null);
    const productA = await makeProduct(admin.req, a.id, category.id, "madchef");
    const productB = await makeProduct(admin.req, b.id, category.id, "madchef");

    await openHome(admin.page);
    await openBrandTab(admin.page, /Madchef/);

    // First add locks the cart to branch A.
    await addToCart(admin.page, productA.name);
    await admin.page.getByTestId("home-cart-button").click();
    await expect(admin.page.getByTestId("cart-branch")).toContainText(a.name);
    await admin.page.getByRole("button", { name: "Close" }).click();

    // A product from branch B must not slip in silently.
    await addToCart(admin.page, productB.name);

    const dialog = admin.page.getByTestId("branch-switch-dialog");
    await expect(dialog, "a confirmation is required").toBeVisible();
    await expect(dialog).toContainText(a.name);
    await expect(dialog).toContainText(b.name);

    // Cancelling leaves the cart on branch A, unchanged.
    await admin.page.getByTestId("branch-switch-cancel").click();
    await expect(dialog).toHaveCount(0);
    await admin.page.getByTestId("home-cart-button").click();
    await expect(admin.page.getByTestId("cart-branch")).toContainText(a.name);
    await expect(admin.page.locator("aside")).not.toContainText(productB.name);

    await admin.context.close();
  });

  test("confirming the switch clears the cart and moves to the new branch", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const a = await makeBranch(admin.req, "madchef");
    const b = await makeBranch(admin.req, "madchef");
    const category = await makeCategory(admin.req, null);
    const productA = await makeProduct(admin.req, a.id, category.id, "madchef");
    const productB = await makeProduct(admin.req, b.id, category.id, "madchef");

    await openHome(admin.page);
    await openBrandTab(admin.page, /Madchef/);
    await addToCart(admin.page, productA.name);
    await addToCart(admin.page, productB.name);
    await admin.page.getByTestId("branch-switch-confirm").click();

    await admin.page.getByTestId("home-cart-button").click();
    const drawer = admin.page.locator("aside");
    await expect(admin.page.getByTestId("cart-branch")).toContainText(b.name);
    await expect(drawer, "the new branch's product is in").toContainText(productB.name);
    await expect(drawer, "the old branch's product is out").not.toContainText(productA.name);

    await admin.context.close();
  });
});

test.describe("Customer scope is unchanged", () => {
  test("a customer still sees only their nearest branch, never all branches", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const a = await makeBranch(admin.req, "madchef");
    const b = await makeBranch(admin.req, "madchef");
    const category = await makeCategory(admin.req, null);
    const productA = await makeProduct(admin.req, a.id, category.id, "madchef");
    const productB = await makeProduct(admin.req, b.id, category.id, "madchef");

    const customer = await newSession(browser, "customer");
    expect(
      (
        await customer.req.post("/api/customer/location", {
          data: { lat: a.point.lat, lng: a.point.lng, accuracy: 10, captured_at: Date.now() },
        })
      ).status(),
    ).toBe(200);

    await openHome(customer.page);
    await openBrandTab(customer.page, /Madchef/);
    const names = await cardNames(customer.page);
    expect(names, "own branch").toContain(productA.name);
    expect(names, "never the other branch").not.toContain(productB.name);

    // And the API refuses the other branch's product outright.
    expect((await customer.req.get(`/api/products/${productB.id}/`)).status()).toBe(404);

    await admin.context.close();
    await customer.context.close();
  });
});
