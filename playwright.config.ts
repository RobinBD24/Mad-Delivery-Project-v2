import path from "node:path";

import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E config for MAD Delivery HQ (Next.js-only).
 * Runs against a production build served by `npm run start` on PORT 3000.
 * Chromium-only (headless); self-starts the server.
 */
const PORT = Number(process.env.E2E_PORT ?? 3000);
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${PORT}`;

// `sharp` (profile-image WEBP pipeline) dlopen()s a project-local libvips that
// is not on the system loader path. Prepend it so `npm run start` can serve the
// image routes without the caller having to export LD_LIBRARY_PATH by hand —
// `npm run test:e2e` is then self-sufficient.
const VIPS_LIB = path.join(
  process.cwd(),
  "node_modules/sharp/node_modules/@img/sharp-libvips-linux-x64/lib",
);
const LD_LIBRARY_PATH = [VIPS_LIB, process.env.LD_LIBRARY_PATH].filter(Boolean).join(":");

/**
 * ISOLATED TEST DATABASE. The project `.env` points DATABASE_URL at `dev.db`,
 * which is ALSO what the deployed server uses — running the suite against it
 * would mutate live data (the specs create/mutate branches, orders, areas…).
 * Pin the E2E server to its own SQLite file so Playwright can never touch the
 * development/production database. Override with E2E_DATABASE_URL if needed.
 * Prisma resolves a relative `file:` URL against the schema dir (prisma/).
 */
// SQLite allows exactly one writer, so `connection_limit=1` is the correct
// setting: several connections do not buy parallelism, they just fight over the
// write lock and stall until a request times out. Serialising through one
// connection removes the fight, and the generous `pool_timeout` then lets a
// burst (e.g. six concurrent orders) queue instead of failing at the 10s
// default. `socket_timeout` covers a slow individual query. Together these keep
// a loaded machine from producing sporadic stalls that look like product bugs
// but are pure contention on the test database.
const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL ?? "file:./test.db?connection_limit=1&socket_timeout=30&pool_timeout=60";
const E2E_UPLOAD_DIR =
  process.env.E2E_UPLOAD_DIR ??
  path.join(process.cwd(), "test-artifacts", "e2e-uploads");

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false, // workflow specs mutate shared seed data; run serially
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Next.js SSR pages + server actions. 90s rather than 45s because this
  // project is built on a SHARED machine: several other applications run
  // alongside the suite, and a multi-step order flow (transaction →
  // notifications → reward award → commission) serialised through one SQLite
  // connection can genuinely take longer than 45s while the box is busy. This
  // raises the ceiling for slow work; it weakens no assertion and hides no
  // race — every expectation is unchanged.
  timeout: 90_000,
  expect: { timeout: 10_000 },
  // E2E_OUTPUT_DIR / E2E_REPORT_DIR isolate one run's artifacts from any other
  // QA session sharing this working tree.
  outputDir: process.env.E2E_OUTPUT_DIR ?? "test-results",
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: process.env.E2E_REPORT_DIR ?? "playwright-report" }],
  ],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 15_000,
    navigationTimeout: 25_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // Always boot our OWN production server (never reuse a stray `next dev`,
    // which is slow, emits HMR/dev-only console noise and resets connections).
    // Requires a prior `npm run build` (see the QA command sequence).
    command: `npm run start -- -p ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: "ignore",
    stderr: "pipe",
    env: {
      ...(process.env as Record<string, string>),
      // Never let the E2E server write to the dev/production database.
      DATABASE_URL: E2E_DATABASE_URL,
      // Never inherit a deployment-only absolute upload path from `.env`.
      // Profile/upload specs write only to this ignored, project-local area.
      UPLOAD_DIR: E2E_UPLOAD_DIR,
      LD_LIBRARY_PATH,
    },
  },
});
