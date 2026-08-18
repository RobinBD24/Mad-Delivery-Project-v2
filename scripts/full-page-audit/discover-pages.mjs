import { readdir, readFile, writeFile, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const PAGE_FILE_PATTERN = /^page\.(?:js|jsx|ts|tsx)$/;
const SOURCE_FILE_PATTERN = /\.(?:js|jsx|ts|tsx)$/;
const IGNORED_DIRECTORIES = new Set([
  ".git",
  ".next",
  "node_modules",
  "playwright-report",
  "storage",
  "test-artifacts",
  "test-results",
]);

export const REQUIRED_PAGE_RESULT_FIELDS = Object.freeze([
  "routePattern",
  "concreteTestedUrl",
  "pageName",
  "accessLevel",
  "requiredRole",
  "testUser",
  "dynamicDataSource",
  "desktopStatus",
  "mobileStatus",
  "englishStatus",
  "banglaStatus",
  "lightModeStatus",
  "darkModeStatus",
  "consoleErrorCount",
  "unexpectedNetworkFailureCount",
  "brokenImageCount",
  "accessibilityResult",
  "functionalResult",
  "rbacResult",
  "relatedApiResult",
  "defectsFound",
  "filesChanged",
  "targetedTests",
  "finalStatus",
]);

async function walkFiles(root, current = root) {
  const entries = await readdir(current, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.isDirectory() && IGNORED_DIRECTORIES.has(entry.name)) {
      continue;
    }

    const entryPath = path.join(current, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(root, entryPath)));
    } else if (entry.isFile()) {
      files.push(path.relative(root, entryPath).split(path.sep).join("/"));
    }
  }

  return files;
}

function applyInterceptingSegment(routeSegments, segment) {
  if (!segment.startsWith("(") || !segment.includes(")")) {
    return false;
  }

  if (segment.startsWith("(...)")) {
    routeSegments.length = 0;
    const remainder = segment.slice(5);
    if (remainder) routeSegments.push(remainder);
    return true;
  }

  const parentMarkers = segment.match(/^(\(\.\.\))+/)?.[0];
  if (parentMarkers) {
    const levels = parentMarkers.length / 4;
    routeSegments.splice(Math.max(0, routeSegments.length - levels), levels);
    const remainder = segment.slice(parentMarkers.length);
    if (remainder) routeSegments.push(remainder);
    return true;
  }

  if (segment.startsWith("(.)")) {
    const remainder = segment.slice(3);
    if (remainder) routeSegments.push(remainder);
    return true;
  }

  return false;
}

export function pageFileToRoutePattern(pageFile) {
  const normalized = pageFile.split(path.sep).join("/");
  const parts = normalized.split("/");
  const appIndex = parts.indexOf("app");
  const routeSegments = [];

  for (const segment of parts.slice(appIndex + 1, -1)) {
    if (segment.startsWith("_")) return null;
    if (segment.startsWith("@")) continue;
    if (/^\([^)]*\)$/.test(segment)) continue;
    if (applyInterceptingSegment(routeSegments, segment)) continue;
    routeSegments.push(segment);
  }

  return routeSegments.length === 0 ? "/" : `/${routeSegments.join("/")}`;
}

export async function discoverAppPageRoutes(projectRoot) {
  const appRoot = path.join(projectRoot, "app");
  const files = (await walkFiles(projectRoot, appRoot)).filter((file) =>
    PAGE_FILE_PATTERN.test(path.posix.basename(file)),
  );
  const routes = new Map();

  for (const pageFile of files) {
    const routePattern = pageFileToRoutePattern(pageFile);
    if (!routePattern) continue;
    const pageFiles = routes.get(routePattern) ?? [];
    pageFiles.push(pageFile);
    routes.set(routePattern, pageFiles);
  }

  return [...routes.entries()]
    .map(([routePattern, pageFiles]) => ({
      routePattern,
      pageFiles: pageFiles.sort(),
    }))
    .sort((a, b) => a.routePattern.localeCompare(b.routePattern));
}

function normalizeLiteralRoute(route) {
  const normalized = route.split(/[?#]/, 1)[0]?.replace(/\/+$/, "") || "/";
  if (!normalized.startsWith("/") || normalized.startsWith("/api/")) return null;
  if (normalized.includes("${")) return null;
  return normalized;
}

export async function discoverSourceRouteReferences(projectRoot) {
  const files = (await walkFiles(projectRoot)).filter((file) =>
    SOURCE_FILE_PATTERN.test(file),
  );
  const routes = new Map();
  const routeLiteralPattern =
    /(?:\bhref\s*=\s*|\b(?:router\.)?(?:push|replace)\s*\(\s*|\b(?:permanentRedirect|redirect)\s*\(\s*|\blink\s*:\s*)["'`]([^"'`]+)["'`]/g;

  for (const sourceFile of files) {
    const source = await readFile(path.join(projectRoot, sourceFile), "utf8");
    for (const match of source.matchAll(routeLiteralPattern)) {
      const route = normalizeLiteralRoute(match[1]);
      if (!route) continue;
      const sourceFiles = routes.get(route) ?? [];
      sourceFiles.push(sourceFile);
      routes.set(route, sourceFiles);
    }
  }

  return [...routes.entries()]
    .map(([route, sourceFiles]) => ({
      route,
      sourceFiles: [...new Set(sourceFiles)].sort(),
    }))
    .sort((a, b) => a.route.localeCompare(b.route));
}

function routePatternRegex(routePattern) {
  if (routePattern === "/") return /^\/$/;

  const segments = routePattern.slice(1).split("/");
  const pattern = segments
    .map((segment) => {
      if (/^\[\[\.\.\..+\]\]$/.test(segment)) return "(?:/.*)?";
      if (/^\[\.\.\..+\]$/.test(segment)) return "/.+";
      if (/^\[.+\]$/.test(segment)) return "/[^/]+";
      return `/${segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`;
    })
    .join("");

  return new RegExp(`^${pattern}$`);
}

function inferRole(routePattern) {
  const rolePrefixes = [
    ["/admin", "super_admin"],
    ["/management", "management"],
    ["/marketing", "marketing"],
    ["/branch-manager", "branch_manager"],
    ["/accounts", "accounts"],
    ["/rider", "rider"],
    ["/customer", "customer"],
  ];

  return rolePrefixes.find(([prefix]) =>
    routePattern === prefix || routePattern.startsWith(`${prefix}/`),
  )?.[1] ?? null;
}

function inferAccess(routePattern, requiredRole) {
  if (requiredRole) return "protected";
  if (
    routePattern === "/profile" ||
    routePattern === "/change-password" ||
    routePattern.startsWith("/complaints")
  ) {
    return "authenticated";
  }
  return "public";
}

function pageName(routePattern) {
  if (routePattern === "/") return "Homepage";
  return routePattern
    .split("/")
    .filter(Boolean)
    .map((segment) =>
      segment.startsWith("[")
        ? segment
        : segment
            .split("-")
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
            .join(" "),
    )
    .join(" — ");
}

function initialPageEntry(appRoute, concreteTestedUrl) {
  const requiredRole = inferRole(appRoute.routePattern);
  const status = "NOT TESTED";

  return {
    routePattern: appRoute.routePattern,
    concreteTestedUrl,
    pageName: pageName(appRoute.routePattern),
    accessLevel: inferAccess(appRoute.routePattern, requiredRole),
    requiredRole,
    testUser: requiredRole,
    dynamicDataSource: appRoute.routePattern.includes("[") ? "pending isolated seed lookup" : "static route",
    desktopStatus: status,
    mobileStatus: status,
    englishStatus: status,
    banglaStatus: status,
    lightModeStatus: status,
    darkModeStatus: status,
    consoleErrorCount: null,
    unexpectedNetworkFailureCount: null,
    brokenImageCount: null,
    accessibilityResult: status,
    functionalResult: status,
    rbacResult: status,
    relatedApiResult: status,
    defectsFound: [],
    filesChanged: [],
    targetedTests: [],
    finalStatus: status,
    pageFiles: appRoute.pageFiles,
  };
}

export function buildInitialInventory({ appRoutes, sourceReferences }) {
  const references = sourceReferences.map(({ route }) => route);
  const staticRoutePatterns = new Set(
    appRoutes
      .map(({ routePattern }) => routePattern)
      .filter((routePattern) => !routePattern.includes("[")),
  );
  const pages = appRoutes
    .map((appRoute) => {
      const matcher = routePatternRegex(appRoute.routePattern);
      const concreteTestedUrl =
        references.find(
          (reference) =>
            matcher.test(reference) &&
            !(
              appRoute.routePattern.includes("[") &&
              staticRoutePatterns.has(reference)
            ),
        ) ??
        (appRoute.routePattern.includes("[") ? null : appRoute.routePattern);
      return initialPageEntry(appRoute, concreteTestedUrl);
    })
    .sort((a, b) => a.routePattern.localeCompare(b.routePattern));

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    discovery: {
      appRouterPageFiles: appRoutes.reduce(
        (count, route) => count + route.pageFiles.length,
        0,
      ),
      uniqueRoutePatterns: pages.length,
      sourceReferenceCount: sourceReferences.length,
    },
    pages,
    sourceReferences,
  };
}

const DYNAMIC_SEED_ROUTES = Object.freeze({
  "/accounts/invoices/[id]": ["accountsInvoiceOrderId", "Order"],
  "/admin/branches/[id]": ["adminBranchId", "Branch"],
  "/admin/branches/[id]/edit": ["adminBranchId", "Branch"],
  "/admin/orders/[id]": ["adminOrderId", "Order"],
  "/admin/products/[id]/edit": ["adminProductId", "Product"],
  "/admin/users/[id]": ["adminUserId", "User"],
  "/admin/users/[id]/edit": ["adminUserId", "User"],
  "/branch-manager/catalog/categories/[id]/edit": [
    "branchManagerCategoryId",
    "Category",
  ],
  "/branch-manager/catalog/products/[id]/edit": [
    "branchManagerProductId",
    "Product",
  ],
  "/branch-manager/orders/[id]": ["branchManagerOrderId", "Order"],
  "/branch-manager/table-reservations/[id]": [
    "branchManagerReservationId",
    "TableReservation",
  ],
  "/complaints/[id]": ["complaintId", "Complaint"],
  "/customer/branches/[id]/menu": ["customerBranchId", "Branch"],
  "/customer/orders/[id]": ["customerOrderId", "Order"],
  "/customer/reservations/[id]": [
    "customerReservationId",
    "TableReservation",
  ],
  "/marketing/campaigns/[id]/edit": ["marketingCampaignId", "Campaign"],
  "/marketing/coupons/[id]/edit": ["marketingCouponId", "Coupon"],
  "/rider/orders/[id]": ["riderOrderId", "Order"],
});

export function applySeedDynamicUrls(inventory, seedEntities) {
  return {
    ...inventory,
    pages: inventory.pages.map((page) => {
      const mapping = DYNAMIC_SEED_ROUTES[page.routePattern];
      if (!mapping) return page;
      const [entityKey, model] = mapping;
      const entityId = seedEntities[entityKey];
      if (entityId === null || entityId === undefined) return page;
      return {
        ...page,
        concreteTestedUrl: page.routePattern.replace(
          "[id]",
          encodeURIComponent(String(entityId)),
        ),
        dynamicDataSource: `prisma/test.db: ${model}.id=${entityId}`,
      };
    }),
  };
}

function rowId(database, sql, ...params) {
  return database.prepare(sql).get(...params)?.id ?? null;
}

export function readSeedDynamicEntities(databasePath) {
  const database = new DatabaseSync(databasePath, { readOnly: true });
  try {
    const branchManagerBranchId = rowId(
      database,
      `SELECT b.id
       FROM Branch b
       JOIN BranchManagerAssignment a ON a.branchId = b.id
       JOIN User u ON u.id = a.managerId
       WHERE u.username = ? AND a.relievedAt IS NULL
       ORDER BY a.id DESC
       LIMIT 1`,
      "branch_manager",
    );

    return {
      accountsInvoiceOrderId: rowId(
        database,
        `SELECT id FROM "Order" ORDER BY id LIMIT 1`,
      ),
      adminBranchId: rowId(
        database,
        "SELECT id FROM Branch WHERE isActive = 1 AND isArchived = 0 ORDER BY id LIMIT 1",
      ),
      adminOrderId: rowId(
        database,
        `SELECT id FROM "Order" ORDER BY id LIMIT 1`,
      ),
      adminProductId: rowId(
        database,
        "SELECT id FROM Product WHERE deletedAt IS NULL ORDER BY id LIMIT 1",
      ),
      adminUserId: rowId(
        database,
        "SELECT id FROM User WHERE username = ? LIMIT 1",
        "customer",
      ),
      branchManagerCategoryId: rowId(
        database,
        "SELECT id FROM Category WHERE branchId = ? ORDER BY id LIMIT 1",
        branchManagerBranchId,
      ),
      branchManagerProductId: rowId(
        database,
        "SELECT id FROM Product WHERE branchId = ? AND deletedAt IS NULL ORDER BY id LIMIT 1",
        branchManagerBranchId,
      ),
      branchManagerOrderId: rowId(
        database,
        `SELECT id FROM "Order" WHERE branchId = ? ORDER BY id LIMIT 1`,
        branchManagerBranchId,
      ),
      branchManagerReservationId: rowId(
        database,
        "SELECT id FROM TableReservation WHERE branchId = ? ORDER BY id LIMIT 1",
        branchManagerBranchId,
      ),
      complaintId: rowId(
        database,
        "SELECT id FROM Complaint ORDER BY id LIMIT 1",
      ),
      customerBranchId: rowId(
        database,
        "SELECT id FROM Branch WHERE isActive = 1 AND isArchived = 0 ORDER BY id LIMIT 1",
      ),
      customerOrderId: rowId(
        database,
        `SELECT o.id
         FROM "Order" o
         JOIN User u ON u.id = o.customerId
         WHERE u.username = ?
         ORDER BY o.id
         LIMIT 1`,
        "customer",
      ),
      customerReservationId: rowId(
        database,
        `SELECT r.id
         FROM TableReservation r
         JOIN User u ON u.id = r.customerId
         WHERE u.username = ?
         ORDER BY r.id
         LIMIT 1`,
        "customer",
      ),
      marketingCampaignId: rowId(
        database,
        "SELECT id FROM Campaign ORDER BY id LIMIT 1",
      ),
      marketingCouponId: rowId(
        database,
        "SELECT id FROM Coupon ORDER BY id LIMIT 1",
      ),
      riderOrderId: rowId(
        database,
        `SELECT o.id
         FROM "Order" o
         JOIN User u ON u.id = o.riderId
         WHERE u.username = ?
         ORDER BY o.id
         LIMIT 1`,
        "rider",
      ),
    };
  } finally {
    database.close();
  }
}

export async function discoverPages(projectRoot) {
  const [appRoutes, sourceReferences] = await Promise.all([
    discoverAppPageRoutes(projectRoot),
    discoverSourceRouteReferences(projectRoot),
  ]);
  const inventory = buildInitialInventory({ appRoutes, sourceReferences });
  const testDatabasePath = path.join(projectRoot, "prisma", "test.db");

  try {
    await stat(testDatabasePath);
    return applySeedDynamicUrls(
      inventory,
      readSeedDynamicEntities(testDatabasePath),
    );
  } catch {
    return inventory;
  }
}

async function runCli() {
  const projectRoot = process.cwd();
  const outputPath = path.join(
    projectRoot,
    "test-artifacts",
    "full-page-audit",
    "page-inventory.json",
  );
  const inventory = await discoverPages(projectRoot);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(inventory, null, 2)}\n`, "utf8");
  process.stdout.write(
    `${inventory.discovery.uniqueRoutePatterns} route patterns from ` +
      `${inventory.discovery.appRouterPageFiles} page files; wrote ` +
      `${path.relative(projectRoot, outputPath)}\n`,
  );
}

const isCli =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isCli) {
  await runCli();
}
