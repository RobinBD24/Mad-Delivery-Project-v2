import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  REQUIRED_PAGE_RESULT_FIELDS,
  applySeedDynamicUrls,
  buildInitialInventory,
  discoverAppPageRoutes,
  discoverSourceRouteReferences,
} from "../../scripts/full-page-audit/discover-pages.mjs";

const projectRoot = process.cwd();
const fixtureRoot = path.join(
  projectRoot,
  "test-artifacts",
  "full-page-audit",
  "route-discovery-fixture",
);

async function write(relativePath, contents = "export default function Page() {}") {
  const filePath = path.join(fixtureRoot, relativePath);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, contents, "utf8");
}

test.beforeEach(async () => {
  await rm(fixtureRoot, { recursive: true, force: true });
});

test.after(async () => {
  await rm(fixtureRoot, { recursive: true, force: true });
});

test("discovers App Router pages without counting route groups or parallel slots as URL segments", async () => {
  await write("app/page.tsx");
  await write("app/(auth)/login/page.ts");
  await write("app/(dashboard)/customer/orders/[id]/page.tsx");
  await write("app/(dashboard)/@modal/customer/orders/[id]/page.tsx");
  await write("app/api/orders/route.ts");
  await write("app/(dashboard)/customer/orders/loading.tsx");

  const routes = await discoverAppPageRoutes(fixtureRoot);

  assert.deepEqual(
    routes.map(({ routePattern }) => routePattern),
    ["/", "/customer/orders/[id]", "/login"],
  );
  assert.equal(
    routes.find(({ routePattern }) => routePattern === "/customer/orders/[id]")
      ?.pageFiles.length,
    2,
  );
});

test("discovers literal page URLs from navigation, redirects, and notification links", async () => {
  await write(
    "components/navigation.tsx",
    `
      <Link href="/customer/cart">Cart</Link>
      router.push("/customer/checkout?from=cart")
      router.replace('/login')
      redirect("/admin/dashboard")
      const notice = { link: "/customer/orders/seed-order-id" }
      const ignored = "/api/orders"
    `,
  );

  const references = await discoverSourceRouteReferences(fixtureRoot);

  assert.deepEqual(
    references.map(({ route }) => route),
    [
      "/admin/dashboard",
      "/customer/cart",
      "/customer/checkout",
      "/customer/orders/seed-order-id",
      "/login",
    ],
  );
});

test("builds deterministic resumable entries with every required audit field", () => {
  const inventory = buildInitialInventory({
    appRoutes: [
      {
        routePattern: "/customer/orders/[id]",
        pageFiles: ["app/(dashboard)/customer/orders/[id]/page.tsx"],
      },
      { routePattern: "/", pageFiles: ["app/page.tsx"] },
    ],
    sourceReferences: [
      {
        route: "/customer/orders/seed-order-id",
        sourceFiles: ["tests/e2e/04-customer-order-flow.spec.ts"],
      },
    ],
  });

  assert.deepEqual(
    inventory.pages.map(({ routePattern }) => routePattern),
    ["/", "/customer/orders/[id]"],
  );
  assert.equal(
    inventory.pages[1].concreteTestedUrl,
    "/customer/orders/seed-order-id",
  );
  assert.equal(inventory.pages[1].finalStatus, "NOT TESTED");

  for (const field of REQUIRED_PAGE_RESULT_FIELDS) {
    assert.ok(
      Object.hasOwn(inventory.pages[1], field),
      `expected inventory entry to include ${field}`,
    );
  }
});

test("does not use a static sibling route as the concrete URL for a dynamic page", () => {
  const inventory = buildInitialInventory({
    appRoutes: [
      {
        routePattern: "/admin/branches/[id]",
        pageFiles: ["app/(dashboard)/admin/branches/[id]/page.tsx"],
      },
      {
        routePattern: "/admin/branches/create",
        pageFiles: ["app/(dashboard)/admin/branches/create/page.tsx"],
      },
    ],
    sourceReferences: [
      {
        route: "/admin/branches/create",
        sourceFiles: ["components/navigation.tsx"],
      },
    ],
  });

  assert.equal(
    inventory.pages.find(
      ({ routePattern }) => routePattern === "/admin/branches/[id]",
    )?.concreteTestedUrl,
    null,
  );
  assert.equal(
    inventory.pages.find(
      ({ routePattern }) => routePattern === "/admin/branches/create",
    )?.concreteTestedUrl,
    "/admin/branches/create",
  );
});

test("resolves dynamic pages from role-scoped isolated seed entities", () => {
  const routePatterns = [
    "/accounts/invoices/[id]",
    "/admin/branches/[id]",
    "/admin/branches/[id]/edit",
    "/admin/orders/[id]",
    "/admin/products/[id]/edit",
    "/admin/users/[id]",
    "/admin/users/[id]/edit",
    "/branch-manager/catalog/categories/[id]/edit",
    "/branch-manager/catalog/products/[id]/edit",
    "/branch-manager/orders/[id]",
    "/branch-manager/table-reservations/[id]",
    "/complaints/[id]",
    "/customer/branches/[id]/menu",
    "/customer/orders/[id]",
    "/customer/reservations/[id]",
    "/marketing/campaigns/[id]/edit",
    "/marketing/coupons/[id]/edit",
    "/rider/orders/[id]",
  ];
  const inventory = buildInitialInventory({
    appRoutes: routePatterns.map((routePattern) => ({
      routePattern,
      pageFiles: [`app${routePattern}/page.tsx`],
    })),
    sourceReferences: [],
  });

  const resolved = applySeedDynamicUrls(inventory, {
    accountsInvoiceOrderId: 101,
    adminBranchId: 102,
    adminOrderId: 103,
    adminProductId: 104,
    adminUserId: 105,
    branchManagerCategoryId: 106,
    branchManagerProductId: 107,
    branchManagerOrderId: 108,
    branchManagerReservationId: 109,
    complaintId: 110,
    customerBranchId: 111,
    customerOrderId: 112,
    customerReservationId: 113,
    marketingCampaignId: 114,
    marketingCouponId: 115,
    riderOrderId: 116,
  });

  assert.equal(
    resolved.pages.find(
      ({ routePattern }) => routePattern === "/admin/branches/[id]/edit",
    )?.concreteTestedUrl,
    "/admin/branches/102/edit",
  );
  assert.equal(
    resolved.pages.find(
      ({ routePattern }) => routePattern === "/rider/orders/[id]",
    )?.concreteTestedUrl,
    "/rider/orders/116",
  );
  assert.match(
    resolved.pages.find(
      ({ routePattern }) => routePattern === "/customer/orders/[id]",
    )?.dynamicDataSource ?? "",
    /prisma\/test\.db.*Order\.id=112/,
  );
  assert.equal(
    resolved.pages.filter(({ concreteTestedUrl }) => !concreteTestedUrl).length,
    0,
  );
});
