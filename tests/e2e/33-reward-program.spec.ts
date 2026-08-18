import { test, expect } from "@playwright/test";

import { newSession, apiLogin, API_BASE } from "./helpers";

/**
 * PHASE G — reward programme activation / deactivation.
 *
 * Pausing must stop FUTURE earning and redemption while leaving every existing
 * balance and ledger entry intact and readable. Only a super admin may switch
 * it, and repeating the current state is a 409 conflict rather than a silent
 * no-op. These tests always restore the programme to ACTIVE so they cannot
 * leak state into other specs.
 */

async function setActive(
  req: Awaited<ReturnType<typeof newSession>>["req"],
  isActive: boolean,
) {
  return req.post(`${API_BASE}/api/admin/rewards/status/`, { data: { is_active: isActive } });
}

test.describe("Phase G — reward programme switch", () => {
  test.afterEach(async ({ browser }) => {
    // Leave the programme ACTIVE regardless of how a test ended.
    const admin = await newSession(browser, "super_admin");
    const cfg = await (await admin.req.get(`${API_BASE}/api/admin/rewards/`)).json();
    if (!cfg.program_active) await setActive(admin.req, true);
    await admin.context.close();
  });

  test("super admin can pause and re-activate; state persists", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");

    const off = await setActive(admin.req, false);
    expect(off.status()).toBe(200);
    expect((await off.json()).programActive).toBe(false);
    expect((await (await admin.req.get(`${API_BASE}/api/admin/rewards/`)).json()).program_active).toBe(false);

    const on = await setActive(admin.req, true);
    expect(on.status()).toBe(200);
    expect((await (await admin.req.get(`${API_BASE}/api/admin/rewards/`)).json()).program_active).toBe(true);
  });

  test("repeating the current state returns 409", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    expect((await setActive(admin.req, false)).status()).toBe(200);
    expect((await setActive(admin.req, false)).status(), "duplicate pause → conflict").toBe(409);
    expect((await setActive(admin.req, true)).status()).toBe(200);
    expect((await setActive(admin.req, true)).status(), "duplicate activate → conflict").toBe(409);
  });

  test("only a super admin may switch the programme", async ({ browser }) => {
    for (const role of ["customer", "rider", "branch_manager", "accounts", "marketing", "management"]) {
      const s = await apiLogin(browser, role);
      const res = await s.req.post(`${API_BASE}/api/admin/rewards/status/`, { data: { is_active: false } });
      expect(res.status(), `${role} refused`).toBeGreaterThanOrEqual(403);
      await s.context.close();
    }
  });

  test("while paused: redemption is blocked, balance and history are preserved", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    const customer = await newSession(browser, "customer");

    const before = await (await customer.req.get(`${API_BASE}/api/customer/rewards/`)).json();
    const balanceBefore = before.balance;

    expect((await setActive(admin.req, false)).status()).toBe(200);

    const paused = await (await customer.req.get(`${API_BASE}/api/customer/rewards/`)).json();
    expect(paused.program_active, "customer is told rewards are paused").toBe(false);
    expect(paused.balance, "balance preserved while paused").toBe(balanceBefore);

    // Redemption must be refused (not silently accepted).
    const redeem = await customer.req.post(`${API_BASE}/api/customer/rewards/`, { data: { coins: 100000 } });
    expect(redeem.status(), "redemption blocked while paused").toBe(400);

    // History still readable.
    expect(Array.isArray(paused.ledger ?? paused.entries ?? []), "ledger still readable").toBe(true);

    expect((await setActive(admin.req, true)).status()).toBe(200);
    const after = await (await customer.req.get(`${API_BASE}/api/customer/rewards/`)).json();
    expect(after.balance, "balance unchanged by the pause cycle").toBe(balanceBefore);
  });

  test("the admin UI shows the status and offers the opposite action", async ({ browser }) => {
    const admin = await newSession(browser, "super_admin");
    await admin.page.goto("/admin/rewards");
    await expect(admin.page.getByTestId("reward-program-toggle")).toBeVisible();
    // Active by default → shows Active badge + a pause action.
    await expect(admin.page.getByTestId("reward-status-active")).toBeVisible();
    await expect(admin.page.getByTestId("reward-deactivate")).toBeVisible();

    // Pause via the API, reload → paused badge, activate action, and a notice.
    await setActive(admin.req, false);
    await admin.page.reload();
    await expect(admin.page.getByTestId("reward-status-paused")).toBeVisible();
    await expect(admin.page.getByTestId("reward-activate")).toBeVisible();
    await expect(admin.page.getByTestId("reward-paused-notice")).toBeVisible();

    // Leave the programme switched ON: pausing is global state, and a later
    // spec that expects a delivered order to earn coins would otherwise be
    // reading this test's leftovers rather than its own behaviour.
    await setActive(admin.req, true);
    await admin.page.reload();
    await expect(admin.page.getByTestId("reward-status-active")).toBeVisible();
  });
});
