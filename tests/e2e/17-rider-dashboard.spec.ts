import fs from "node:fs";
import path from "node:path";

import { test, expect, type APIRequestContext, type Page } from "@playwright/test";

import {
  API_BASE,
  E2E_ORIGIN,
  expectHealthy,
  login,
  newSession,
  realErrors,
  setLocale,
  trackConsoleErrors,
} from "./helpers";

/**
 * Rider dashboard rebuilt against static_design/Rider-Dashbord-offline.html:
 * offline/online states, real data sections, delivery workflow from the
 * dashboard, i18n, theme, responsive sizes and a deterministic offline
 * screenshot (fixed viewport/locale/theme, animations off, clock hidden).
 */

const DASH = "/rider/dashboard";

// Online now means "on an active branch duty session" (Part C). Idempotent:
// start a session at the demo branch (where the seeded products/orders live), or
// end the active one.
async function setOnline(req: APIRequestContext, online: boolean) {
  const duty = await (await req.get(`${API_BASE}/api/rider/duty`)).json();
  if (online) {
    const main = (duty.eligible_branches as { id: number; name: string }[]).find((b) => b.name === "Main Branch") ?? duty.eligible_branches[0];
    if (duty.active_session && duty.active_session.branch !== main.id) {
      // On duty at the wrong branch → switch to Main.
      await req.post(`${API_BASE}/api/rider/duty/end`, { data: {} });
      const res = await req.post(`${API_BASE}/api/rider/duty/start`, { data: { branch_id: main.id } });
      expect(res.ok(), "switch duty").toBeTruthy();
    } else if (!duty.active_session) {
      const res = await req.post(`${API_BASE}/api/rider/duty/start`, { data: { branch_id: main.id } });
      expect(res.ok(), "start duty").toBeTruthy();
    }
  } else if (duty.active_session) {
    const res = await req.post(`${API_BASE}/api/rider/duty/end`, { data: {} });
    expect(res.ok(), "end duty").toBeTruthy();
  }
}

/** Create an order and walk it to "ready", assigned to the given rider. */
async function createAssignedOrder(
  customerReq: APIRequestContext,
  bmReq: APIRequestContext,
  riderReq: APIRequestContext,
): Promise<number> {
  const prod = (await (await customerReq.get(`${API_BASE}/api/products?page_size=1`)).json()).results[0];
  expect(prod, "a sellable product exists").toBeTruthy();
  const riderId = (await (await riderReq.get(`${API_BASE}/api/auth/me`)).json()).id;
  const order = await (
    await customerReq.post(`${API_BASE}/api/orders`, {
      data: {
        branch_id: prod.branch,
        payment_method: "cash",
        delivery_address: "E2E rider dashboard, Dhaka", lat: 23.781, lng: 90.408,
        items: [{ product_id: prod.id, quantity: 1 }],
      },
    })
  ).json();
  for (const s of ["accepted", "preparing", "ready"]) {
    expect((await bmReq.post(`${API_BASE}/api/orders/${order.id}/update-status`, { data: { status: s } })).ok()).toBeTruthy();
  }
  expect((await bmReq.post(`${API_BASE}/api/orders/${order.id}/assign-rider`, { data: { rider_id: riderId } })).ok()).toBeTruthy();
  return order.id as number;
}

async function freezeChrome(page: Page) {
  await page.addStyleTag({
    content: `
      *, *::before, *::after { animation: none !important; transition: none !important; }
      [data-testid="dashboard-status-bar"] .font-mono { visibility: hidden !important; }
    `,
  });
  await page.evaluate(() => document.fonts.ready);
}

test.describe.configure({ mode: "serial" });

test.describe("Rider dashboard — offline/online design states", () => {
  // Other specs (order flow, notifications) assign orders to this rider and
  // the API rejects assigning an OFFLINE rider — always leave him online.
  test.afterAll(async ({ browser }) => {
    const { context, req } = await newSession(browser, "rider");
    await setOnline(req, true);
    await context.close();
  });

  test("rider login lands on the dashboard with the design's structure", async ({ browser }) => {
    const { context, page } = await newSession(browser, "rider");
    const errors = trackConsoleErrors(page);
    await expect(page).toHaveURL(new RegExp(`${DASH}$`));

    // Design sections: 5-chip metric strip, online panel, three-column content, footer bar.
    await expect(page.locator(".chip-accent")).toHaveCount(5);
    await expect(page.getByTestId("rider-online-panel")).toBeVisible();
    await expect(page.getByText(/current order/i).first()).toBeVisible();
    await expect(page.getByText(/earnings overview/i)).toBeVisible();
    await expect(page.getByText(/my wallet/i).first()).toBeVisible();
    await expect(page.getByText(/my performance/i)).toBeVisible();
    await expect(page.getByTestId("rider-footer-status")).toBeVisible();

    await expectHealthy(page);
    expect(realErrors(errors)).toEqual([]);
    await context.close();
  });

  test("offline state matches the design: red state, no requests, Go Online action", async ({ browser }) => {
    const { context, page, req } = await newSession(browser, "rider");
    await setOnline(req, false);
    await page.goto(DASH);

    const panel = page.getByTestId("rider-online-panel");
    await expect(panel).toHaveAttribute("data-online", "false");
    await expect(panel).toContainText("You are Offline");
    await expect(panel).toContainText("Not accepting orders");
    await expect(page.getByTestId("rider-go-online")).toHaveText(/go online/i);
    await expect(page.getByTestId("rider-online-toggle")).toHaveAttribute("aria-checked", "false");

    // No delivery requests are presented while offline.
    await expect(page.getByTestId("rider-pending-offline")).toBeVisible();
    await expect(page.getByText(/go online to start receiving delivery requests/i)).toBeVisible();
    // Live map foundation is inactive.
    await expect(page.getByText(/go online to activate live delivery tracking/i)).toBeVisible();
    // Footer reflects the database state.
    await expect(page.getByTestId("rider-footer-status")).toContainText(/offline/i);
    await expectHealthy(page);
    await context.close();
  });

  test("going online updates the dashboard and survives refresh", async ({ browser }) => {
    const { context, page, req } = await newSession(browser, "rider");
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation({ latitude: 23.7808, longitude: 90.2792 });
    await setOnline(req, false);
    await page.goto(DASH);
    await page.waitForLoadState("networkidle");

    await page.getByTestId("rider-go-online").click();
    const panel = page.getByTestId("rider-online-panel");
    await expect(panel).toHaveAttribute("data-online", "true");
    await expect(panel).toContainText("You are Online");
    await expect(page.getByTestId("rider-go-online")).toHaveText(/go offline/i);

    // Server state persisted → refresh keeps the online presentation.
    await page.reload();
    await expect(page.getByTestId("rider-online-panel")).toHaveAttribute("data-online", "true");
    await expect(page.getByTestId("rider-footer-status")).toContainText(/online/i);
    await expect(page.getByTestId("rider-pending-offline")).toHaveCount(0);
    await context.close();
  });

  test("assigned delivery appears and can be driven to delivered from the dashboard", async ({ browser }) => {
    const customer = await newSession(browser, "customer");
    const bm = await newSession(browser, "branch_manager");
    const rider = await newSession(browser, "rider");
    try {
      await setOnline(rider.req, true);
      const orderId = await createAssignedOrder(customer.req, bm.req, rider.req);
      // #6: the rider must respond to the blocking new-order assignment first;
      // accepting dismisses the popup. Then #C5 confirm-receive.
      expect((await rider.req.post(`${API_BASE}/api/rider/assignments/${orderId}/respond`, { data: { action: "accept" } })).status()).toBe(200);
      expect((await rider.req.post(`${API_BASE}/api/rider/orders/${orderId}/confirm-receive`)).status()).toBe(200);

      // #15: the order is shown by its unique order number (ORD-…), not its id.
      const ord = await (await rider.req.get(`${API_BASE}/api/orders/${orderId}`)).json();
      const label = (ord.order_number ?? `#${orderId}`) as string;

      await rider.page.goto(DASH);

      // The assigned order shows in the current-order card and the queue.
      await expect(rider.page.getByText(label).first()).toBeVisible();

      // Walk the delivery forward from the dashboard queue row for THIS order.
      const row = rider.page.locator("li", { hasText: label });
      await row.getByRole("button", { name: /^picked up$/i }).click();
      await row.getByRole("button", { name: /^on the way$/i }).click();
      await row.getByRole("button", { name: /^delivered$/i }).click();

      // Delivered → the order leaves the active queue (dashboard revalidates).
      await rider.page.goto(DASH);
      await expect(rider.page.getByText(label)).toHaveCount(0, { timeout: 15_000 });

      // The delivery earned a commission → wallet/earnings sections show money.
      await rider.page.goto(DASH);
      await expect(rider.page.getByText(/current balance/i)).toBeVisible();
      const walletApi = await (await rider.req.get(`${API_BASE}/api/rider/wallet`)).json();
      expect(Number(walletApi.total_earnings)).toBeGreaterThan(0);
    } finally {
      await customer.context.close();
      await bm.context.close();
      await rider.context.close();
    }
  });

  test("earnings, wallet and notifications sections load real data", async ({ browser }) => {
    const { context, page } = await newSession(browser, "rider");
    await expect(page.getByText(/earnings overview/i)).toBeVisible();
    await expect(page.getByText(/this week/i).first()).toBeVisible();
    await expect(page.getByText(/current balance/i)).toBeVisible();
    // ৳ appears in the wallet balance (Bangladeshi taka formatting).
    await expect(page.getByText(/৳/).first()).toBeVisible();
    // Notifications panel (assignment/commission notifications exist from the flow above).
    await expect(page.getByText(/notifications/i).first()).toBeVisible();
    await context.close();
  });

  test("Bangla mode renders the rider dashboard fully translated", async ({ browser }) => {
    const { context, page, req } = await newSession(browser, "rider", "bn");
    await setOnline(req, false);
    await page.goto(DASH);
    await expect(page.getByText("আপনি অফলাইনে আছেন").first()).toBeVisible();
    await expect(page.getByText("অর্ডার গ্রহণ করা হচ্ছে না")).toBeVisible();
    await expect(page.getByTestId("rider-go-online")).toContainText("অনলাইনে যান");
    await expectHealthy(page);
    await context.close();
  });

  test("theme switching works on the rider dashboard", async ({ browser }) => {
    const { context, page } = await newSession(browser, "rider");
    const html = page.locator("html");
    await page.getByTestId("theme-switcher").click();
    await page.getByTestId("theme-switcher-option-dark").click();
    await expect(html).toHaveAttribute("data-theme", "dark");
    await page.getByTestId("theme-switcher").click();
    await page.getByTestId("theme-switcher-option-light").click();
    await expect(html).toHaveAttribute("data-theme", "light");
    await context.close();
  });

  test("desktop / tablet / mobile layouts have no overflow or broken images", async ({ browser }) => {
    const { context, page } = await newSession(browser, "rider");
    for (const [name, viewport] of [
      ["desktop", { width: 1440, height: 900 }],
      ["tablet", { width: 768, height: 1024 }],
      ["mobile", { width: 390, height: 844 }],
    ] as const) {
      await page.setViewportSize(viewport);
      await page.goto(DASH);
      await expect(page.getByTestId("rider-online-panel")).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `overflow at ${name}`).toBeLessThanOrEqual(1);
      const broken = await page.evaluate(() =>
        [...document.querySelectorAll("img")]
          .filter((img) => img.complete && img.naturalWidth === 0)
          .map((img) => img.currentSrc || img.src),
      );
      expect(broken, `broken images at ${name}`).toEqual([]);
    }
    await context.close();
  });

  test("wrong-role access is blocked (page redirect + API 403)", async ({ browser }) => {
    const { context, page, req } = await newSession(browser, "management");
    await page.goto(DASH);
    await expect(page).toHaveURL(/\/management\/dashboard$/);
    expect((await req.get(`${API_BASE}/api/dashboard/rider`)).status()).toBe(403);
    expect((await req.post(`${API_BASE}/api/riders/online`, { data: { online: true } })).status()).toBe(403);
    await context.close();
  });

  test("offline dashboard screenshot comparison (deterministic)", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await setLocale(context, "en");
    await context.addCookies([{ name: "mad_theme", value: "dark", url: E2E_ORIGIN }]);
    const page = await context.newPage();
    await login(page, "rider");
    await setOnline(page.request, false);
    await page.goto(DASH);
    await page.waitForLoadState("networkidle");
    await freezeChrome(page);

    await expect(page.getByTestId("rider-online-panel")).toHaveAttribute("data-online", "false");
    // Only the topbar's live clock is masked — no full dashboard sections.
    await expect(page).toHaveScreenshot("rider-offline-dashboard.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
      mask: [page.locator('[data-testid="dashboard-status-bar"] .font-mono')],
    });

    // Also drop a copy in the shared visual-review folder.
    const outDir = path.join("test-artifacts", "visual");
    fs.mkdirSync(outDir, { recursive: true });
    await page.screenshot({ path: path.join(outDir, "rider-offline-dashboard.png"), fullPage: true });
    await context.close();
  });
});
