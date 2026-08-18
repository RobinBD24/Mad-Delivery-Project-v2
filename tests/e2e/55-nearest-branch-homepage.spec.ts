import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { newSession, setLocale, ROLE_HOME, atPath, login } from "./helpers";

/**
 * NEAREST-BRANCH HOMEPAGE — an authenticated customer sees, and can order, the
 * catalogue of exactly ONE branch: their nearest eligible one, resolved
 * server-side from their own trusted coordinates.
 *
 * The storefront previously rendered every live branch's products mixed
 * together, so a customer in Dhanmondi was shown (and could add) items only
 * sold in Banani. These tests pin the whole chain: homepage, category sections,
 * nav search, product detail, the products/categories APIs, the cart, the quote
 * and order creation.
 */

test.beforeEach(async ({ context }) => setLocale(context, "en"));

const uniq = (p: string) => `${p}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;

/**
 * Every fixture branch is placed at coordinates derived from its OWN database id.
 *
 * This matters more than it looks. Two branches at the same coordinates are the
 * same distance from the customer, and the deterministic lowest-id tie-break then
 * resolves to whichever was created first — correct behaviour, but not the branch
 * the test meant to assert about. The test database is persistent, so branches
 * left by earlier runs are real competitors; any fixed point, or any small set of
 * bands, is eventually occupied by one of them.
 *
 * Branch ids are unique and monotonic forever, so an id-derived grid gives every
 * branch ever created its own slot: 100 latitude steps x 100 longitude steps of
 * 0.03 degrees (~3.3 km) each, far outside the seeded Dhaka branches (23.7x,
 * 90.4x) and well beyond the 1 km delivery radius used below. Only the branch a
 * test just created covers its own point.
 */
function pointForBranchId(id: number): { lat: number; lng: number } {
  return {
    lat: 24 + (id % 100) * 0.03,
    lng: 91 + (Math.floor(id / 100) % 100) * 0.03,
  };
}
const FAR_AWAY = { lat: 21.4272, lng: 92.0058 }; // Cox's Bazar — outside everything

async function setLocation(req: APIRequestContext, point: { lat: number; lng: number }) {
  const res = await req.post("/api/customer/location", {
    data: { lat: point.lat, lng: point.lng, accuracy: 10, captured_at: Date.now() },
  });
  expect(res.status(), "location saved").toBe(200);
}

/**
 * Creates a branch and then moves it onto its own id-derived slot, so no two
 * fixture branches — in this run or any earlier one — can share coordinates.
 * Returns the branch together with the point it now occupies.
 */
async function makeBranch(req: APIRequestContext, overrides: Record<string, string> = {}) {
  const res = await req.post("/api/branches/", {
    data: {
      name: uniq("NB"),
      address: "Dhaka",
      phone: "01711111111",
      brand_type: "cheez",
      latitude: "24",
      longitude: "91",
      // 1 km — well inside the ~3.3 km grid spacing, so slots never overlap.
      delivery_radius_km: "1",
      ...overrides,
    },
  });
  expect(res.status(), "branch created").toBe(201);
  const branch = (await res.json()) as { id: number; name: string };
  const point = pointForBranchId(branch.id);
  const moved = await req.patch(`/api/branches/${branch.id}/`, {
    data: { latitude: String(point.lat), longitude: String(point.lng) },
  });
  expect(moved.status(), "branch placed on its own slot").toBe(200);
  return { ...branch, point };
}

async function makeCategory(req: APIRequestContext, branchId: number | null, name?: string) {
  const res = await req.post("/api/categories/", {
    data: { name: name ?? uniq("NBCat"), branch_id: branchId ?? "global", is_active: true },
  });
  expect(res.status(), "category created").toBe(201);
  return (await res.json()) as { id: number; name: string };
}

async function makeProduct(
  req: APIRequestContext,
  branchId: number,
  categoryId: number,
  overrides: Record<string, string | number | boolean> = {},
) {
  const res = await req.post("/api/products/", {
    data: {
      branch_id: branchId,
      name: uniq("NBProd"),
      brand: "cheez",
      category: categoryId,
      is_available: true,
      variations: JSON.stringify([{ name: "Std", price: 250, isDefault: true, isEnabled: true }]),
      ...overrides,
    },
  });
  expect(res.status(), "product created").toBe(201);
  return (await res.json()) as { id: number; name: string };
}

/** Product names the storefront actually renders (the card headings). */
async function homeNames(page: Page): Promise<string[]> {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  return page.locator("article h4").allInnerTexts();
}

/**
 * A world with two disjoint branches, a shared GLOBAL category, and the full set
 * of ineligible products. Built once per test so nothing leaks between them.
 */
async function buildWorld(admin: { req: APIRequestContext }) {
  const branchA = await makeBranch(admin.req);
  const branchB = await makeBranch(admin.req);
  const inactive = await makeBranch(admin.req);
  const archived = await makeBranch(admin.req);
  const pointA = branchA.point;
  const pointB = branchB.point;

  // One GLOBAL category used by BOTH branches — the case that must not merge.
  const global = await makeCategory(admin.req, null, uniq("GlobalPizza"));
  const catA = await makeCategory(admin.req, branchA.id);
  const catB = await makeCategory(admin.req, branchB.id);

  const aProduct = await makeProduct(admin.req, branchA.id, catA.id);
  const bProduct = await makeProduct(admin.req, branchB.id, catB.id);
  const aGlobal = await makeProduct(admin.req, branchA.id, global.id);
  const bGlobal = await makeProduct(admin.req, branchB.id, global.id);

  // Products that must never surface, all on branch A.
  const heldProduct = await makeProduct(admin.req, branchA.id, catA.id);
  expect((await admin.req.post(`/api/products/${heldProduct.id}/hold/`)).status()).toBe(200);

  const inactiveProduct = await makeProduct(admin.req, branchA.id, catA.id, { is_available: false });

  const deletedProduct = await makeProduct(admin.req, branchA.id, catA.id);
  expect((await admin.req.delete(`/api/products/${deletedProduct.id}/`)).status()).toBe(200);

  const inactiveBranchProduct = await makeProduct(admin.req, inactive.id, global.id);
  expect(
    (await admin.req.post(`/api/branches/${inactive.id}/deactivate/`, { data: { reason: "test" } })).status(),
  ).toBe(200);

  const archivedBranchProduct = await makeProduct(admin.req, archived.id, global.id);
  expect((await admin.req.delete(`/api/branches/${archived.id}/`)).status()).toBe(200);

  return {
    pointA,
    pointB,
    branchA,
    branchB,
    global,
    aProduct,
    bProduct,
    aGlobal,
    bGlobal,
    heldProduct,
    inactiveProduct,
    deletedProduct,
    inactiveBranchProduct,
    archivedBranchProduct,
  };
}

test.describe("Homepage is scoped to the nearest eligible branch", () => {
  test("customers near different branches see disjoint catalogues", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const world = await buildWorld(admin);

    const nearA = await newSession(browser, "customer");
    await setLocation(nearA.req, world.pointA);
    const aNames = await homeNames(nearA.page);

    expect(aNames, "own branch product").toContain(world.aProduct.name);
    expect(aNames, "own branch global-category product").toContain(world.aGlobal.name);
    expect(aNames, "other branch product").not.toContain(world.bProduct.name);
    expect(aNames, "other branch, SAME global category").not.toContain(world.bGlobal.name);

    const nearB = await newSession(browser, "qa_upload_1");
    await setLocation(nearB.req, world.pointB);
    const bNames = await homeNames(nearB.page);

    expect(bNames, "own branch product").toContain(world.bProduct.name);
    expect(bNames, "other branch product").not.toContain(world.aProduct.name);
    expect(bNames, "other branch, SAME global category").not.toContain(world.aGlobal.name);

    // The two catalogues share nothing — the exact leak this guards against.
    expect(aNames.filter((n) => bNames.includes(n)), "no overlap").toEqual([]);

    await admin.context.close();
    await nearA.context.close();
    await nearB.context.close();
  });

  test("ineligible products and branches never appear", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const world = await buildWorld(admin);
    const customer = await newSession(browser, "customer");
    await setLocation(customer.req, world.pointA);
    const names = await homeNames(customer.page);

    expect(names, "held").not.toContain(world.heldProduct.name);
    expect(names, "inactive").not.toContain(world.inactiveProduct.name);
    expect(names, "soft-deleted").not.toContain(world.deletedProduct.name);
    expect(names, "inactive branch").not.toContain(world.inactiveBranchProduct.name);
    expect(names, "archived branch").not.toContain(world.archivedBranchProduct.name);

    await admin.context.close();
    await customer.context.close();
  });

  test("the branch bar names the resolved branch", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const world = await buildWorld(admin);
    const customer = await newSession(browser, "customer");
    await setLocation(customer.req, world.pointA);

    await customer.page.goto("/", { waitUntil: "domcontentloaded" });
    const bar = customer.page.getByTestId("home-branch-bar");
    await expect(bar).toHaveAttribute("data-branch-state", "ok");
    await expect(customer.page.getByTestId("home-branch-name")).toHaveText(world.branchA.name);
    await expect(customer.page.getByTestId("home-branch-distance")).toBeVisible();

    await admin.context.close();
    await customer.context.close();
  });

  test("moving the customer moves the catalogue", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const world = await buildWorld(admin);
    const customer = await newSession(browser, "customer");

    await setLocation(customer.req, world.pointA);
    expect(await homeNames(customer.page)).toContain(world.aProduct.name);

    await setLocation(customer.req, world.pointB);
    const after = await homeNames(customer.page);
    expect(after, "new branch's product").toContain(world.bProduct.name);
    expect(after, "old branch's product is gone").not.toContain(world.aProduct.name);

    await admin.context.close();
    await customer.context.close();
  });
});

test.describe("Location and coverage states", () => {
  test("no location at all shows the location-setup state, not a catalogue", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const world = await buildWorld(admin);
    // A fresh customer with no GPS fix and no default address with coordinates.
    const customer = await newSession(browser, "qa_upload_2");

    await customer.page.goto("/", { waitUntil: "domcontentloaded" });
    const state = await customer.page.getByTestId("home-branch-bar").getAttribute("data-branch-state");
    // Either they genuinely have no location, or a saved default address gives
    // them one. Both are legitimate; what must NEVER happen is a mixed catalogue.
    const names = await customer.page.locator("article h4").allInnerTexts();
    if (state === "no-location") {
      await expect(customer.page.getByTestId("home-use-location")).toBeVisible();
      await expect(customer.page.getByTestId("home-select-address")).toBeVisible();
      expect(names, "no products without a location").toEqual([]);
    }
    expect(
      names.includes(world.aProduct.name) && names.includes(world.bProduct.name),
      "never both branches at once",
    ).toBe(false);

    await admin.context.close();
    await customer.context.close();
  });

  test("a location outside every zone shows out-of-zone and no catalogue", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const world = await buildWorld(admin);
    const customer = await newSession(browser, "customer");
    await setLocation(customer.req, FAR_AWAY);

    await customer.page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(customer.page.getByTestId("home-branch-bar")).toHaveAttribute(
      "data-branch-state",
      "out-of-zone",
    );
    await expect(customer.page.getByTestId("home-retry-location")).toBeVisible();
    await expect(customer.page.getByTestId("home-view-branches")).toBeVisible();

    const names = await customer.page.locator("article h4").allInnerTexts();
    expect(names, "no fallback catalogue whatsoever").toEqual([]);
    expect(names).not.toContain(world.aProduct.name);

    await admin.context.close();
    await customer.context.close();
  });

  test("out of zone, ordering is refused server-side", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const world = await buildWorld(admin);
    const customer = await newSession(browser, "customer");
    await setLocation(customer.req, FAR_AWAY);

    const res = await customer.req.post("/api/orders/", {
      data: {
        branch_id: world.branchA.id,
        payment_method: "cash",
        delivery_address: "Nowhere",
        fulfillment_type: "delivery",
        ...FAR_AWAY,
        items: [{ product_id: world.aProduct.id, quantity: 1 }],
      },
    });
    expect(res.status(), "no eligible branch → rejected").toBeGreaterThanOrEqual(400);

    await admin.context.close();
    await customer.context.close();
  });
});

test.describe("Search and category scoping", () => {
  test("nav search only finds the resolved branch's products", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const world = await buildWorld(admin);
    const customer = await newSession(browser, "customer");
    await setLocation(customer.req, world.pointA);

    await customer.page.goto("/", { waitUntil: "domcontentloaded" });
    const search = customer.page.getByRole("textbox", {
      name: /search any item across all menus/i,
    });

    await search.fill(world.aProduct.name);
    await expect(customer.page.getByText(world.aProduct.name).first()).toBeVisible();

    // A product that exists, is eligible, but belongs to the other branch.
    await search.fill(world.bProduct.name);
    await expect(customer.page.getByText(world.bProduct.name)).toHaveCount(0);

    await admin.context.close();
    await customer.context.close();
  });

  test("a global category never merges two branches' products", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const world = await buildWorld(admin);
    const customer = await newSession(browser, "customer");
    await setLocation(customer.req, world.pointA);

    await customer.page.goto("/", { waitUntil: "domcontentloaded" });
    // The global category's section exists exactly once and holds only branch A.
    const section = customer.page.locator("h3").filter({ hasText: world.global.name });
    await expect(section).toHaveCount(1);

    const names = await customer.page.locator("article h4").allInnerTexts();
    expect(names).toContain(world.aGlobal.name);
    expect(names).not.toContain(world.bGlobal.name);

    await admin.context.close();
    await customer.context.close();
  });
});

test.describe("Forged requests are refused", () => {
  test("a forged branch query parameter is ignored", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const world = await buildWorld(admin);
    const customer = await newSession(browser, "customer");
    await setLocation(customer.req, world.pointA);

    // Asking the products API for the OTHER branch must not return it.
    const res = await customer.req.get(`/api/products/?branch_id=${world.branchB.id}&page_size=200`);
    expect(res.status()).toBe(200);
    const names = ((await res.json()).results as { name: string }[]).map((p) => p.name);
    expect(names, "forged branch yields the resolved branch only").not.toContain(world.bProduct.name);
    expect(names).toContain(world.aProduct.name);

    await admin.context.close();
    await customer.context.close();
  });

  test("another branch's product detail is not readable", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const world = await buildWorld(admin);
    const customer = await newSession(browser, "customer");
    await setLocation(customer.req, world.pointA);

    expect((await customer.req.get(`/api/products/${world.aProduct.id}/`)).status()).toBe(200);
    expect(
      (await customer.req.get(`/api/products/${world.bProduct.id}/`)).status(),
      "other branch's product is not found for this customer",
    ).toBe(404);

    await admin.context.close();
    await customer.context.close();
  });

  test("another branch's menu URL is refused", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const world = await buildWorld(admin);
    const customer = await newSession(browser, "customer");
    await setLocation(customer.req, world.pointA);

    await customer.page.goto(`/customer/branches/${world.branchB.id}/menu`, {
      waitUntil: "domcontentloaded",
    });
    // Asserted on the RENDERED result, not the HTTP status. The route is a
    // dynamic server component, so Next has already begun streaming the shell by
    // the time the guard calls notFound() and the response stays 200 while the
    // not-found UI is what actually renders. The contract that matters is that
    // the other branch's menu is not served: nothing of it reaches the customer.
    const body = customer.page.locator("body");
    await expect(body).toContainText(/page not found/i);
    await expect(body, "no other-branch product leaks").not.toContainText(world.bProduct.name);
    await expect(body, "no other-branch name leaks").not.toContainText(world.branchB.name);

    await admin.context.close();
    await customer.context.close();
  });

  test("ordering another branch's product is rejected", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const world = await buildWorld(admin);
    const customer = await newSession(browser, "customer");
    await setLocation(customer.req, world.pointA);

    const body = {
      payment_method: "cash",
      delivery_address: "Dhaka",
      fulfillment_type: "delivery",
      ...world.pointA,
    };

    // Own branch: accepted.
    const ok = await customer.req.post("/api/orders/", {
      data: { ...body, branch_id: world.branchA.id, items: [{ product_id: world.aProduct.id, quantity: 1 }] },
    });
    expect(ok.status(), "own branch order").toBe(201);

    // Other branch's product, however the branch_id is forged.
    for (const branchId of [world.branchA.id, world.branchB.id]) {
      const res = await customer.req.post("/api/orders/", {
        data: { ...body, branch_id: branchId, items: [{ product_id: world.bProduct.id, quantity: 1 }] },
      });
      expect(res.status(), `cross-branch order refused (branch_id=${branchId})`).toBeGreaterThanOrEqual(400);
    }

    // A cart mixing both branches is refused too.
    const mixed = await customer.req.post("/api/orders/", {
      data: {
        ...body,
        branch_id: world.branchA.id,
        items: [
          { product_id: world.aProduct.id, quantity: 1 },
          { product_id: world.bProduct.id, quantity: 1 },
        ],
      },
    });
    expect(mixed.status(), "mixed-branch cart refused").toBeGreaterThanOrEqual(400);

    await admin.context.close();
    await customer.context.close();
  });

  test("a quote for another branch's product is refused", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const world = await buildWorld(admin);
    const customer = await newSession(browser, "customer");
    await setLocation(customer.req, world.pointA);

    const quote = await customer.req.post("/api/delivery/quote", {
      data: {
        branch_id: world.branchB.id,
        fulfillment_type: "delivery",
        ...world.pointA,
        items: [{ product_id: world.bProduct.id, quantity: 1 }],
      },
    });
    expect(quote.status(), "quote pinned to the resolved branch").toBeGreaterThanOrEqual(400);

    await admin.context.close();
    await customer.context.close();
  });

  test("a held product cannot be ordered even by direct id", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const world = await buildWorld(admin);
    const customer = await newSession(browser, "customer");
    await setLocation(customer.req, world.pointA);

    const res = await customer.req.post("/api/orders/", {
      data: {
        branch_id: world.branchA.id,
        payment_method: "cash",
        delivery_address: "Dhaka",
        fulfillment_type: "delivery",
        ...world.pointA,
        items: [{ product_id: world.heldProduct.id, quantity: 1 }],
      },
    });
    expect(res.status()).toBeGreaterThanOrEqual(400);

    await admin.context.close();
    await customer.context.close();
  });
});

test.describe("Admin changes reach the right branch", () => {
  test("an edit to branch A's product shows for A and never for B", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const world = await buildWorld(admin);
    const nearA = await newSession(browser, "customer");
    const nearB = await newSession(browser, "qa_upload_1");
    await setLocation(nearA.req, world.pointA);
    await setLocation(nearB.req, world.pointB);

    const renamed = uniq("Renamed");
    expect(
      (await admin.req.patch(`/api/products/${world.aProduct.id}/`, { data: { name: renamed } })).status(),
    ).toBe(200);

    expect(await homeNames(nearA.page), "A sees the edit").toContain(renamed);
    expect(await homeNames(nearB.page), "B never sees A's product").not.toContain(renamed);

    await admin.context.close();
    await nearA.context.close();
    await nearB.context.close();
  });

  test("two customers do not receive each other's catalogue from cache", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const world = await buildWorld(admin);

    // A loads first and would warm any shared cache entry.
    const nearA = await newSession(browser, "customer");
    await setLocation(nearA.req, world.pointA);
    const aNames = await homeNames(nearA.page);
    expect(aNames).toContain(world.aProduct.name);

    // B then loads the same URL in a different session.
    const nearB = await newSession(browser, "qa_upload_1");
    await setLocation(nearB.req, world.pointB);
    const bNames = await homeNames(nearB.page);

    expect(bNames, "B must not receive A's branch").not.toContain(world.aProduct.name);
    expect(bNames, "B receives its own branch").toContain(world.bProduct.name);

    // And A is still correct afterwards — the reverse leak.
    expect(await homeNames(nearA.page)).not.toContain(world.bProduct.name);

    await admin.context.close();
    await nearA.context.close();
    await nearB.context.close();
  });

  test("existing orders are unchanged by later product edits", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const world = await buildWorld(admin);
    const customer = await newSession(browser, "customer");
    await setLocation(customer.req, world.pointA);

    const placed = await customer.req.post("/api/orders/", {
      data: {
        branch_id: world.branchA.id,
        payment_method: "cash",
        delivery_address: "Dhaka",
        fulfillment_type: "delivery",
        ...world.pointA,
        items: [{ product_id: world.aProduct.id, quantity: 1 }],
      },
    });
    expect(placed.status()).toBe(201);
    const order = await placed.json();
    const line = order.items[0];

    await admin.req.patch(`/api/products/${world.aProduct.id}/`, {
      data: {
        name: uniq("Later"),
        variations: JSON.stringify([{ name: "Std", price: 9999, isDefault: true, isEnabled: true }]),
      },
    });

    const readBack = await (await customer.req.get(`/api/orders/${order.id}/`)).json();
    expect(readBack.items[0].product_name, "snapshot name").toBe(line.product_name);
    expect(readBack.items[0].unit_price, "snapshot price").toBe(line.unit_price);

    await admin.context.close();
    await customer.context.close();
  });
});

test.describe("Login behaviour is unchanged", () => {
  test("a customer still lands on /", async ({ page }) => {
    await login(page, "customer");
    expect(new URL(page.url()).pathname).toBe("/");
    await expect(page).toHaveURL(atPath("/"));
  });

  for (const role of ["super_admin", "branch_manager", "rider"] as const) {
    test(`${role} still lands on ${ROLE_HOME[role]}`, async ({ page }) => {
      await login(page, role);
      expect(new URL(page.url()).pathname).toBe(ROLE_HOME[role]);
    });
  }
});
