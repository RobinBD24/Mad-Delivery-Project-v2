import { expect, test } from "@playwright/test";

import {
  apiLogin,
  DEMO_USERS,
  expectNoRawKeys,
  realErrors,
  ROLE_HOME,
  setLocale,
  trackConsoleErrors,
} from "../helpers";

const OPERATIONS_PAGES = [
  "/branch-manager/dashboard",
  "/branch-manager/reports",
  "/branch-manager/attendance",
  "/branch-manager/duty-history",
  "/branch-manager/riders",
];

test.describe("Full page audit — Branch Manager operations", () => {
  test("operations pages and private APIs enforce their role boundaries", async ({
    browser,
    page,
  }) => {
    for (const path of OPERATIONS_PAGES) {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      expect(new URL(page.url()).pathname, `${path} anonymous denial`).toBe(
        "/login",
      );
    }
    for (const endpoint of [
      "/api/dashboard/branch-manager",
      "/api/dashboard/branch-manager/live",
      "/api/branch-manager/duty-chats",
      "/api/manager-assignments",
      "/api/activity-logs",
      "/api/riders/branch",
    ]) {
      expect((await page.request.get(endpoint)).status(), endpoint).toBe(401);
    }

    for (const role of DEMO_USERS.filter((role) => role !== "branch_manager")) {
      const { context, req } = await apiLogin(browser, role);
      await setLocale(context, "en");
      const rolePage = await context.newPage();
      for (const path of OPERATIONS_PAGES) {
        await rolePage.goto(path, { waitUntil: "domcontentloaded" });
        await expect(
          rolePage,
          `${role} denial for ${path}`,
        ).toHaveURL(new RegExp(`${ROLE_HOME[role]}$`));
      }

      const dashboardStatus = (
        await req.get("/api/dashboard/branch-manager")
      ).status();
      expect(dashboardStatus, `${role} dashboard API`).toBe(
        role === "super_admin" ? 200 : 403,
      );
      expect(
        (await req.get("/api/branch-manager/duty-chats")).status(),
        `${role} duty chats`,
      ).toBe(403);
      expect(
        (await req.get("/api/riders/branch")).status(),
        `${role} branch riders`,
      ).toBe(role === "super_admin" ? 200 : 403);
      expect(
        (await req.get("/api/manager-assignments")).status(),
        `${role} manager history`,
      ).toBe(
        role === "super_admin" || role === "management" ? 200 : 403,
      );
      await context.close();
    }
  });

  test("dashboard, reports, attendance, duty history, and riders match own-branch data", async ({
    browser,
  }) => {
    const { context } = await apiLogin(browser, "branch_manager");
    await setLocale(context, "en");
    const page = await context.newPage();
    const dashboard = await (
      await page.request.get("/api/dashboard/branch-manager")
    ).json();
    const live = await (
      await page.request.get("/api/dashboard/branch-manager/live")
    ).json();
    expect(dashboard.branch.id).toBe(live.branch.id);

    await page.goto("/branch-manager/dashboard", {
      waitUntil: "domcontentloaded",
    });
    await expect(
      page.getByRole("heading", { name: dashboard.branch.name }),
    ).toBeVisible();
    await expect(page.getByTestId("bm-branch-name")).toHaveText(
      dashboard.branch.name,
    );
    await expect(page.getByTestId("live-board")).toBeVisible();
    await expect(page.locator(".chip-accent")).toHaveCount(6);
    await expect(page.locator(".kpi-accent")).toHaveCount(4);
    for (const href of [
      "/branch-manager/catalog",
      "/branch-manager/orders",
    ]) {
      await expect(page.locator(`main a[href="${href}"]`).first()).toBeVisible();
    }
    for (const order of dashboard.recent_orders as Array<{ id: number }>) {
      await expect(
        page.locator(`main a[href="/branch-manager/orders/${order.id}"]`),
      ).toBeVisible();
    }

    await page.goto("/branch-manager/reports", {
      waitUntil: "domcontentloaded",
    });
    await expect(page.locator("main")).toContainText(dashboard.branch.name);
    await expect(page.locator("tbody tr")).toHaveCount(
      dashboard.popular_items.length,
    );
    for (const item of dashboard.popular_items as Array<{
      product__name: string;
    }>) {
      await expect(
        page.getByText(item.product__name, { exact: true }),
      ).toBeVisible();
    }

    const employees = await (
      await page.request.get("/api/employees?status=active&page_size=200")
    ).json();
    await page.goto("/branch-manager/attendance", {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByTestId("att-date")).toBeVisible();
    await expect(page.getByTestId("att-row")).toHaveCount(
      employees.results.length,
    );
    await expect(
      page.getByTestId("att-role-filter").locator('option[value="others"]'),
    ).toHaveCount(1);
    const selectedDate = await page.getByTestId("att-date").inputValue();
    const attendance = await (
      await page.request.get(
        `/api/employee-attendance?from=${selectedDate}&to=${selectedDate}`,
      )
    ).json();
    await expect(page.getByTestId("att-summary")).toContainText(
      `Total: ${attendance.summary.total}`,
    );

    const assignments = await (
      await page.request.get("/api/manager-assignments?page_size=100")
    ).json();
    const logs = await (
      await page.request.get("/api/activity-logs?page_size=100")
    ).json();
    await page.goto("/branch-manager/duty-history", {
      waitUntil: "domcontentloaded",
    });
    await expect(page.locator("tbody").nth(0).locator("tr")).toHaveCount(
      assignments.results.length,
    );
    await expect(page.locator("tbody").nth(1).locator("tr")).toHaveCount(
      logs.results.length,
    );

    const riders = await (await page.request.get("/api/riders/branch")).json();
    const dutyChats = await (
      await page.request.get("/api/branch-manager/duty-chats")
    ).json();
    await page.goto("/branch-manager/riders", {
      waitUntil: "domcontentloaded",
    });
    await expect(page.locator("tbody tr")).toHaveCount(riders.length);
    await expect(page.getByTestId("online-rider")).toHaveCount(
      dutyChats.results.length,
    );
    for (const rider of riders as Array<{ rider_name: string }>) {
      await expect(
        page.getByText(rider.rider_name, { exact: true }).last(),
      ).toBeVisible();
    }
    await context.close();
  });

  test("operations list filters reject malformed identifiers without escaping scope", async ({
    browser,
  }) => {
    const { context } = await apiLogin(browser, "branch_manager");
    const page = await context.newPage();
    const employeesBefore = await page.request.get(
      "/api/employees?page_size=200",
    );
    expect(employeesBefore.status()).toBe(200);
    const malformedEmployees = await page.request.get(
      "/api/employees?team_id=not-a-number&branch_id=also-bad&join_from=wrong&join_to=also-wrong&page_size=200",
    );
    expect(malformedEmployees.status()).toBe(200);
    expect((await malformedEmployees.json()).count).toBe(
      (await employeesBefore.json()).count,
    );

    const attendanceBefore = await page.request.get(
      "/api/employee-attendance?page_size=200",
    );
    expect(attendanceBefore.status()).toBe(200);
    const malformedAttendance = await page.request.get(
      "/api/employee-attendance?employee_id=bad&team_id=nope&branch_id=invalid&from=wrong&to=also-wrong&page_size=200",
    );
    expect(malformedAttendance.status()).toBe(200);
    expect((await malformedAttendance.json()).count).toBe(
      (await attendanceBefore.json()).count,
    );
    await context.close();
  });

  test("operations pages are responsive, localized, themed, and runtime-clean", async ({
    browser,
  }) => {
    const { context } = await apiLogin(browser, "branch_manager");
    await setLocale(context, "en");
    await context.addCookies([
      { name: "mad_theme", value: "light", url: "http://localhost:3101" },
    ]);
    const page = await context.newPage();
    const consoleErrors = trackConsoleErrors(page);
    for (const path of OPERATIONS_PAGES) {
      for (const viewport of [
        { width: 1440, height: 900 },
        { width: 390, height: 844 },
        { width: 320, height: 800 },
      ]) {
        await page.setViewportSize(viewport);
        const response = await page.goto(path, {
          waitUntil: "domcontentloaded",
        });
        expect(response?.status(), `${path} at ${viewport.width}px`).toBe(200);
        await expect(page.locator("main")).toHaveCount(1);
        await expect(page.locator("h1")).toHaveCount(1);
        await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
          "content",
          /noindex/,
        );
        expect(
          await page.evaluate(
            () =>
              document.documentElement.scrollWidth -
              document.documentElement.clientWidth,
          ),
          `${path} horizontal overflow at ${viewport.width}px`,
        ).toBeLessThanOrEqual(1);
      }
      await expectNoRawKeys(page);
    }
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await setLocale(context, "bn");
    await context.addCookies([
      { name: "mad_theme", value: "dark", url: "http://localhost:3101" },
    ]);
    for (const path of OPERATIONS_PAGES) {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      await expect(page.locator("html")).toHaveAttribute("lang", "bn");
      await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
      await expectNoRawKeys(page);
    }
    expect(realErrors(consoleErrors), "application console errors").toEqual([]);
    await context.close();
  });
});
