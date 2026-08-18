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

test.describe("Full page audit — Super Admin", () => {
  test("admin dashboard denies anonymous and every wrong role at page and API boundaries", async ({
    browser,
    page,
  }) => {
    const anonymous = await page.goto("/admin/dashboard", {
      waitUntil: "domcontentloaded",
    });
    expect(anonymous?.status()).toBe(200);
    expect(new URL(page.url()).pathname).toBe("/login");

    const anonymousApi = await page.request.get(
      "/api/dashboard/super-admin",
    );
    expect(anonymousApi.status()).toBe(401);

    for (const role of DEMO_USERS.filter((role) => role !== "super_admin")) {
      const { context } = await apiLogin(browser, role);
      await setLocale(context, "en");
      const wrongRolePage = await context.newPage();
      await wrongRolePage.goto("/admin/dashboard", {
        waitUntil: "domcontentloaded",
      });
      expect(new URL(wrongRolePage.url()).pathname, `${role} page denial`).toBe(
        ROLE_HOME[role],
      );
      const wrongRoleApi = await wrongRolePage.request.get(
        "/api/dashboard/super-admin",
      );
      expect(wrongRoleApi.status(), `${role} API denial`).toBe(403);
      await context.close();
    }
  });

  test("admin dashboard loads real data, correct actions, and admin-scoped order links", async ({
    browser,
  }) => {
    const { context } = await apiLogin(browser, "super_admin");
    await setLocale(context, "en");
    const page = await context.newPage();

    const apiResponse = await page.request.get("/api/dashboard/super-admin");
    expect(apiResponse.status()).toBe(200);
    const data = await apiResponse.json();
    expect(data.users.total).toBeGreaterThan(0);
    expect(data.branches.total).toBeGreaterThan(0);
    expect(data.orders.total).toBeGreaterThan(0);
    expect(Array.isArray(data.recent_orders)).toBe(true);
    expect(Array.isArray(data.branch_overview)).toBe(true);

    const response = await page.goto("/admin/dashboard", {
      waitUntil: "domcontentloaded",
    });
    expect(response?.status()).toBe(200);
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator(".chip-accent")).toHaveCount(8);
    await expect(page.locator(".kpi-accent")).toHaveCount(4);
    await expect(page.getByTestId("dashboard-status-bar")).toBeVisible();

    await expect(
      page.getByRole("heading", { name: /quick actions/i }),
    ).toBeVisible();
    for (const href of [
      "/admin/users/create",
      "/admin/users",
      "/admin/branches/create",
      "/admin/branches",
      "/admin/branch-manager-history",
      "/admin/activity-logs",
    ]) {
      await expect(
        page.locator(`main a[href="${href}"]`).first(),
        `quick action ${href}`,
      ).toBeVisible();
      const target = await page.request.get(href);
      expect(target.status(), `${href} direct response`).toBeLessThan(400);
    }

    await expect(
      page.locator('main a[href^="/customer/orders/"]'),
      "Super Admin recent-order links must not point at customer-only details",
    ).toHaveCount(0);
    if (data.recent_orders.length > 0) {
      await expect(
        page.locator('main a[href^="/admin/orders/"]').first(),
      ).toBeVisible();
    }

    await context.close();
  });

  test("admin dashboard is responsive, localized, themed, and runtime-clean", async ({
    browser,
  }) => {
    const { context } = await apiLogin(browser, "super_admin");
    await setLocale(context, "en");
    await context.addCookies([
      { name: "mad_theme", value: "light", url: "http://localhost:3101" },
    ]);
    const page = await context.newPage();
    const consoleErrors = trackConsoleErrors(page);
    const pageErrors: string[] = [];
    const failedRequests: string[] = [];
    const unexpectedResponses: string[] = [];

    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("requestfailed", (failedRequest) => {
      const requestUrl = new URL(failedRequest.url());
      const errorText = failedRequest.failure()?.errorText ?? "";
      if (
        requestUrl.origin === new URL(page.url()).origin &&
        !(
          requestUrl.searchParams.has("_rsc") &&
          errorText === "net::ERR_ABORTED"
        )
      ) {
        failedRequests.push(
          `${failedRequest.method()} ${failedRequest.url()} ${errorText}`,
        );
      }
    });
    page.on("response", (response) => {
      if (
        response.status() >= 400 &&
        response.url().startsWith(new URL(page.url()).origin)
      ) {
        unexpectedResponses.push(
          `${response.status()} ${response.request().method()} ${response.url()}`,
        );
      }
    });

    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 390, height: 844 },
      { width: 320, height: 800 },
    ]) {
      await page.setViewportSize(viewport);
      const response = await page.goto("/admin/dashboard", {
        waitUntil: "domcontentloaded",
      });
      expect(response?.status()).toBe(200);
      await expect(page.locator("main")).toHaveCount(1);
      await expect(page).toHaveTitle(/Super Admin/i);
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
        `horizontal overflow at ${viewport.width}px`,
      ).toBeLessThanOrEqual(1);
    }
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

    const brokenImages = await page.locator("img").evaluateAll((images) =>
      images
        .filter(
          (image) =>
            image instanceof HTMLImageElement &&
            image.complete &&
            image.naturalWidth === 0,
        )
        .map((image) => image.getAttribute("src") ?? "?"),
    );
    expect(brokenImages).toEqual([]);
    await expectNoRawKeys(page);

    await setLocale(context, "bn");
    await context.addCookies([
      { name: "mad_theme", value: "dark", url: "http://localhost:3101" },
    ]);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/admin/dashboard");
    await expect(page.locator("html")).toHaveAttribute("lang", "bn");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expectNoRawKeys(page);

    expect(realErrors(consoleErrors), "application console errors").toEqual([]);
    expect(pageErrors, "uncaught page errors").toEqual([]);
    expect(failedRequests, "failed same-origin critical requests").toEqual([]);
    expect(unexpectedResponses, "unexpected same-origin HTTP failures").toEqual([]);
    await context.close();
  });

  test("admin users denies anonymous and every wrong role at page and API boundaries", async ({
    browser,
    page,
  }) => {
    const anonymous = await page.goto("/admin/users", {
      waitUntil: "domcontentloaded",
    });
    expect(anonymous?.status()).toBe(200);
    expect(new URL(page.url()).pathname).toBe("/login");

    const anonymousApi = await page.request.get("/api/auth/users");
    expect(anonymousApi.status()).toBe(401);

    for (const role of DEMO_USERS.filter((role) => role !== "super_admin")) {
      const { context } = await apiLogin(browser, role);
      await setLocale(context, "en");
      const wrongRolePage = await context.newPage();
      await wrongRolePage.goto("/admin/users", {
        waitUntil: "domcontentloaded",
      });
      expect(new URL(wrongRolePage.url()).pathname, `${role} page denial`).toBe(
        ROLE_HOME[role],
      );
      const wrongRoleApi = await wrongRolePage.request.get("/api/auth/users");
      expect(wrongRoleApi.status(), `${role} API denial`).toBe(403);
      await context.close();
    }
  });

  test("admin users loads real paginated data and preserves filter and row-action semantics", async ({
    browser,
  }) => {
    const { context } = await apiLogin(browser, "super_admin");
    await setLocale(context, "en");
    const page = await context.newPage();

    const firstPageResponse = await page.request.get(
      "/api/auth/users?page_size=1&page=1",
    );
    expect(firstPageResponse.status()).toBe(200);
    const firstPage = await firstPageResponse.json();
    expect(firstPage.count).toBeGreaterThan(1);
    expect(firstPage.results).toHaveLength(1);

    const secondPageResponse = await page.request.get(
      "/api/auth/users?page_size=1&page=2",
    );
    expect(secondPageResponse.status()).toBe(200);
    const secondPage = await secondPageResponse.json();
    expect(secondPage.results).toHaveLength(1);
    expect(secondPage.results[0].id).not.toBe(firstPage.results[0].id);

    const blockedResponse = await page.request.get(
      "/api/auth/users?search=blocked_customer&status=blocked",
    );
    expect(blockedResponse.status()).toBe(200);
    const blocked = await blockedResponse.json();
    expect(blocked.results).toHaveLength(1);
    expect(blocked.results[0]).toMatchObject({
      username: "blocked_customer",
      role: "customer",
      status: "approved",
      is_blocked: true,
    });

    const response = await page.goto("/admin/users", {
      waitUntil: "networkidle",
    });
    expect(response?.status()).toBe(200);
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(
      page.getByRole("heading", { name: /all users/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /new user/i }),
    ).toHaveAttribute("href", "/admin/users/create");

    const search = page.getByTestId("users-search");
    const role = page.getByTestId("users-role-filter");
    const status = page.getByTestId("users-status-filter");
    await expect(search).toHaveAccessibleName(/search by name, username/i);
    await expect(role).toHaveAccessibleName(/role/i);
    await expect(status).toHaveAccessibleName(/status/i);

    const pagination = page.getByRole("navigation", { name: "Pagination" });
    await expect(pagination).toBeVisible();
    await pagination.getByRole("button", { name: "2", exact: true }).click();
    await expect(page).toHaveURL(/page=2/);
    await expect(page.locator("tbody tr").first()).toBeVisible();

    await search.fill("blocked_customer");
    await expect(page).not.toHaveURL(/page=2/);
    await expect(page).toHaveURL(/search=blocked_customer/);
    await expect(page.locator("tbody tr")).toHaveCount(1);
    const row = page.locator("tbody tr").first();
    await expect(row).toContainText("@blocked_customer");

    await role.selectOption("customer");
    await status.selectOption("blocked");
    await expect(page).toHaveURL(/role=customer/);
    await expect(page).toHaveURL(/status=blocked/);
    await expect(row).toContainText("@blocked_customer");
    await expect(row.locator("td").nth(2)).toHaveText("Blocked");

    const view = row.getByRole("link", { name: /^view$/i });
    const edit = row.getByRole("link", { name: /^edit$/i });
    await expect(view).toHaveAttribute("href", /^\/admin\/users\/\d+$/);
    await expect(edit).toHaveAttribute("href", /^\/admin\/users\/\d+\/edit$/);

    await row.getByRole("button", { name: /^delete$/i }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: /^delete$/i }),
    ).toBeVisible();
    await dialog.getByRole("button", { name: /^cancel$/i }).click();
    await expect(dialog).toHaveCount(0);
    await expect(row).toContainText("@blocked_customer");

    await page.getByTestId("users-clear-filters").click();
    await expect(page).toHaveURL(/\/admin\/users$/);
    await expect(page.locator("tbody tr").first()).toBeVisible();
    await context.close();
  });

  test("admin users is responsive, localized, themed, and runtime-clean", async ({
    browser,
  }) => {
    const { context } = await apiLogin(browser, "super_admin");
    await setLocale(context, "en");
    await context.addCookies([
      { name: "mad_theme", value: "light", url: "http://localhost:3101" },
    ]);
    const page = await context.newPage();
    const consoleErrors = trackConsoleErrors(page);
    const pageErrors: string[] = [];
    const failedRequests: string[] = [];
    const unexpectedResponses: string[] = [];
    const expectedOrigin = "http://localhost:3101";

    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("requestfailed", (failedRequest) => {
      const requestUrl = new URL(failedRequest.url());
      const errorText = failedRequest.failure()?.errorText ?? "";
      if (
        requestUrl.origin === expectedOrigin &&
        !(
          requestUrl.searchParams.has("_rsc") &&
          errorText === "net::ERR_ABORTED"
        )
      ) {
        failedRequests.push(
          `${failedRequest.method()} ${failedRequest.url()} ${errorText}`,
        );
      }
    });
    page.on("response", (auditResponse) => {
      if (
        auditResponse.status() >= 400 &&
        auditResponse.url().startsWith(expectedOrigin)
      ) {
        unexpectedResponses.push(
          `${auditResponse.status()} ${auditResponse.request().method()} ${auditResponse.url()}`,
        );
      }
    });

    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 390, height: 844 },
      { width: 320, height: 800 },
    ]) {
      await page.setViewportSize(viewport);
      const response = await page.goto("/admin/users", {
        waitUntil: "domcontentloaded",
      });
      expect(response?.status()).toBe(200);
      await expect(page.locator("main")).toHaveCount(1);
      await expect(page).toHaveTitle(/All Users/i);
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
        "content",
        /noindex/,
      );
      await expect(page.getByTestId("users-search")).toBeVisible();
      expect(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth -
            document.documentElement.clientWidth,
        ),
        `horizontal overflow at ${viewport.width}px`,
      ).toBeLessThanOrEqual(1);
    }
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

    const brokenImages = await page.locator("img").evaluateAll((images) =>
      images
        .filter(
          (image) =>
            image instanceof HTMLImageElement &&
            image.complete &&
            image.naturalWidth === 0,
        )
        .map((image) => image.getAttribute("src") ?? "?"),
    );
    expect(brokenImages).toEqual([]);
    await expectNoRawKeys(page);

    await setLocale(context, "bn");
    await context.addCookies([
      { name: "mad_theme", value: "dark", url: "http://localhost:3101" },
    ]);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/admin/users", { waitUntil: "domcontentloaded" });
    await expect(page.locator("html")).toHaveAttribute("lang", "bn");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.getByTestId("users-search")).toHaveAttribute(
      "placeholder",
      /নাম, ইউজারনেম/,
    );
    await expectNoRawKeys(page);

    expect(realErrors(consoleErrors), "application console errors").toEqual([]);
    expect(pageErrors, "uncaught page errors").toEqual([]);
    expect(failedRequests, "failed same-origin critical requests").toEqual([]);
    expect(unexpectedResponses, "unexpected same-origin HTTP failures").toEqual([]);
    await context.close();
  });

  test("admin user create, detail, and edit deny anonymous and every wrong role", async ({
    browser,
    page,
  }) => {
    const pagePaths = [
      "/admin/users/create",
      "/admin/users/8",
      "/admin/users/8/edit",
    ];

    for (const path of pagePaths) {
      const anonymous = await page.goto(path, {
        waitUntil: "domcontentloaded",
      });
      expect(anonymous?.status(), `${path} anonymous response`).toBe(200);
      expect(new URL(page.url()).pathname, `${path} anonymous denial`).toBe(
        "/login",
      );
    }

    expect(
      (await page.request.post("/api/auth/users", { data: {} })).status(),
    ).toBe(401);
    expect((await page.request.get("/api/auth/users/8")).status()).toBe(401);
    expect(
      (await page.request.patch("/api/auth/users/8", { data: {} })).status(),
    ).toBe(401);

    for (const role of DEMO_USERS.filter((role) => role !== "super_admin")) {
      const { context } = await apiLogin(browser, role);
      await setLocale(context, "en");
      const wrongRolePage = await context.newPage();

      for (const path of pagePaths) {
        await wrongRolePage.goto(path, { waitUntil: "domcontentloaded" });
        expect(
          new URL(wrongRolePage.url()).pathname,
          `${role} denial for ${path}`,
        ).toBe(ROLE_HOME[role]);
      }

      expect(
        (
          await wrongRolePage.request.post("/api/auth/users", { data: {} })
        ).status(),
        `${role} create API denial`,
      ).toBe(403);
      expect(
        (await wrongRolePage.request.get("/api/auth/users/8")).status(),
        `${role} detail API denial`,
      ).toBe(403);
      expect(
        (
          await wrongRolePage.request.patch("/api/auth/users/8", { data: {} })
        ).status(),
        `${role} edit API denial`,
      ).toBe(403);
      await context.close();
    }
  });

  test("admin user detail shows blocked state and exposes only safe, scoped actions", async ({
    browser,
  }) => {
    const { context } = await apiLogin(browser, "super_admin");
    await setLocale(context, "en");
    const page = await context.newPage();

    const userResponse = await page.request.get("/api/auth/users/12");
    expect(userResponse.status()).toBe(200);
    const user = await userResponse.json();
    expect(user).toMatchObject({
      id: 12,
      username: "blocked_customer",
      is_blocked: true,
      status: "approved",
    });

    const response = await page.goto("/admin/users/12", {
      waitUntil: "domcontentloaded",
    });
    expect(response?.status()).toBe(200);
    await expect(
      page.getByRole("heading", { name: "Blocked Customer", level: 1 }),
    ).toBeVisible();
    await expect(
      page.locator("main").getByText("Blocked", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /^edit$/i }),
    ).toHaveAttribute("href", "/admin/users/12/edit");
    await expect(
      page.getByRole("button", { name: /^deactivate$/i }),
    ).toBeVisible();

    await page.getByRole("button", { name: /^delete$/i }).click();
    const dialog = page.getByRole("dialog", { name: /delete user/i });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: /^cancel$/i }).click();
    await expect(dialog).toHaveCount(0);
    expect((await page.request.get("/api/auth/users/12")).status()).toBe(200);
    await context.close();
  });

  test("admin creates an additive audit user, renders its detail, and edits optional fields", async ({
    browser,
  }) => {
    const { context } = await apiLogin(browser, "super_admin");
    await setLocale(context, "en");
    const page = await context.newPage();
    const suffix = `${Date.now()}${test.info().workerIndex}`;
    const username = `audit_user_${suffix}`;
    const email = `${username}@example.com`;

    const createResponse = await page.goto("/admin/users/create", {
      waitUntil: "networkidle",
    });
    expect(createResponse?.status()).toBe(200);
    await expect(
      page.getByRole("heading", { name: /create new user/i }),
    ).toBeVisible();

    const submit = page.getByRole("button", { name: /create user/i });
    await submit.click();
    await expect(page.getByText("This field is required")).toHaveCount(5);

    await page.getByLabel(/^Role/).selectOption("customer");
    await page.getByLabel(/^Status/).selectOption("approved");
    await page.getByLabel(/^First name/i).fill("Audit");
    await page.getByLabel(/^Last name/i).fill("Lifecycle");
    await page.getByLabel(/^Username/i).fill(username);
    await page.getByLabel(/^Email/i).fill(email);
    await page.getByLabel(/^Address/i).fill("Audit address to clear");
    await page.getByLabel(/^Gender/i).selectOption("other");
    await page.getByLabel(/^Password/i).fill("Admin12345@##");
    await submit.click();
    await page.waitForURL(/\/admin\/users\/\d+$/, { timeout: 20_000 });

    const createdId = Number(new URL(page.url()).pathname.split("/").pop());
    expect(createdId).toBeGreaterThan(0);
    const createdResponse = await page.request.get(
      `/api/auth/users/${createdId}`,
    );
    expect(createdResponse.status()).toBe(200);
    const created = await createdResponse.json();
    expect(created).toMatchObject({
      username,
      email,
      first_name: "Audit",
      last_name: "Lifecycle",
      role: "customer",
      status: "approved",
      address: "Audit address to clear",
      gender: "other",
    });

    await expect(
      page.getByRole("heading", { name: "Audit Lifecycle", level: 1 }),
    ).toBeVisible();
    await expect(page.locator("main")).toContainText(email);
    await expect(page.locator("main")).toContainText("Audit address to clear");

    await page.goto(`/admin/users/${createdId}/edit`, {
      waitUntil: "networkidle",
    });
    await expect(
      page.getByRole("heading", { name: /edit user/i }),
    ).toBeVisible();
    await expect(page.getByLabel(/^Username/i)).toBeDisabled();
    await expect(page.getByLabel(/^Username/i)).toHaveValue(username);

    await page.getByLabel(/^First name/i).fill("Audited");
    await page.getByLabel(/^Address/i).fill("");
    await page.getByLabel(/^Gender/i).selectOption("");
    await page.getByRole("button", { name: /^save changes$/i }).click();
    await page.waitForURL(`/admin/users/${createdId}`, { timeout: 20_000 });

    const editedResponse = await page.request.get(
      `/api/auth/users/${createdId}`,
    );
    expect(editedResponse.status()).toBe(200);
    const edited = await editedResponse.json();
    expect(edited).toMatchObject({
      username,
      first_name: "Audited",
      address: "",
      gender: "",
    });
    await expect(
      page.getByRole("heading", { name: "Audited Lifecycle", level: 1 }),
    ).toBeVisible();
    await context.close();
  });

  test("admin user create, detail, and edit handle not-found, responsive, locale, theme, and runtime", async ({
    browser,
  }) => {
    const { context } = await apiLogin(browser, "super_admin");
    await setLocale(context, "en");
    await context.addCookies([
      { name: "mad_theme", value: "light", url: "http://localhost:3101" },
    ]);
    const page = await context.newPage();
    const consoleErrors = trackConsoleErrors(page);
    const pageErrors: string[] = [];
    const failedRequests: string[] = [];
    const unexpectedResponses: string[] = [];
    const expectedOrigin = "http://localhost:3101";

    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("requestfailed", (failedRequest) => {
      const requestUrl = new URL(failedRequest.url());
      const errorText = failedRequest.failure()?.errorText ?? "";
      if (
        requestUrl.origin === expectedOrigin &&
        !(
          requestUrl.searchParams.has("_rsc") &&
          errorText === "net::ERR_ABORTED"
        )
      ) {
        failedRequests.push(
          `${failedRequest.method()} ${failedRequest.url()} ${errorText}`,
        );
      }
    });
    page.on("response", (auditResponse) => {
      if (
        auditResponse.status() >= 400 &&
        auditResponse.url().startsWith(expectedOrigin)
      ) {
        unexpectedResponses.push(
          `${auditResponse.status()} ${auditResponse.request().method()} ${auditResponse.url()}`,
        );
      }
    });

    for (const path of [
      "/admin/users/create",
      "/admin/users/8",
      "/admin/users/8/edit",
    ]) {
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
    const unnamedControls = await page
      .locator("main input, main select, main textarea, main button")
      .evaluateAll((controls) =>
        controls
          .filter((control) => {
            const element = control as HTMLElement;
            const name =
              element.getAttribute("aria-label") ||
              element.getAttribute("aria-labelledby") ||
              element.closest("label")?.textContent?.trim() ||
              element.textContent?.trim();
            return !name;
          })
          .map((control) => (control as HTMLElement).outerHTML),
      );
    expect(unnamedControls, "unnamed form controls").toEqual([]);
    const brokenImages = await page.locator("img").evaluateAll((images) =>
      images
        .filter(
          (image) =>
            image instanceof HTMLImageElement &&
            image.complete &&
            image.naturalWidth === 0,
        )
        .map((image) => image.getAttribute("src") ?? "?"),
    );
    expect(brokenImages).toEqual([]);

    const missingApi = await page.request.get("/api/auth/users/999999999");
    expect(missingApi.status()).toBe(404);
    const missingPage = await page.goto("/admin/users/999999999", {
      waitUntil: "domcontentloaded",
    });
    expect(missingPage?.status()).toBe(200);
    expect(new URL(page.url()).pathname).toBe("/admin/users/999999999");
    await expect(
      page.getByRole("heading", { name: "Page not found" }),
    ).toBeVisible();
    await expect(page.getByText("404", { exact: true })).toBeVisible();

    await setLocale(context, "bn");
    await context.addCookies([
      { name: "mad_theme", value: "dark", url: "http://localhost:3101" },
    ]);
    for (const path of [
      "/admin/users/create",
      "/admin/users/8",
      "/admin/users/8/edit",
    ]) {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      await expect(page.locator("html")).toHaveAttribute("lang", "bn");
      await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
      await expectNoRawKeys(page);
    }

    expect(realErrors(consoleErrors), "application console errors").toEqual([]);
    expect(pageErrors, "uncaught page errors").toEqual([]);
    expect(failedRequests, "failed same-origin critical requests").toEqual([]);
    expect(
      unexpectedResponses.filter(
        (entry) => !entry.includes("999999999"),
      ),
      "unexpected same-origin HTTP failures",
    ).toEqual([]);
    await context.close();
  });

  test("admin activity logs enforces page RBAC and the API's intentional shared scopes", async ({
    browser,
    page,
  }) => {
    await page.goto("/admin/activity-logs", {
      waitUntil: "domcontentloaded",
    });
    expect(new URL(page.url()).pathname).toBe("/login");
    expect((await page.request.get("/api/activity-logs")).status()).toBe(401);

    for (const role of DEMO_USERS.filter((role) => role !== "super_admin")) {
      const { context } = await apiLogin(browser, role);
      await setLocale(context, "en");
      const rolePage = await context.newPage();
      await rolePage.goto("/admin/activity-logs", {
        waitUntil: "domcontentloaded",
      });
      expect(new URL(rolePage.url()).pathname, `${role} page denial`).toBe(
        ROLE_HOME[role],
      );

      const api = await rolePage.request.get("/api/activity-logs");
      if (role === "management" || role === "branch_manager") {
        expect(api.status(), `${role} intentional API scope`).toBe(200);
        const data = await api.json();
        expect(Array.isArray(data.results)).toBe(true);
        if (role === "branch_manager") {
          expect(
            data.results.every(
              (log: { manager_username: string }) =>
                log.manager_username === "branch_manager",
            ),
            "branch manager API must expose only their own activity",
          ).toBe(true);
        }
      } else {
        expect(api.status(), `${role} API denial`).toBe(403);
      }
      await context.close();
    }
  });

  test("admin activity logs renders real audit data and handles supported and malformed query filters", async ({
    browser,
  }) => {
    const { context } = await apiLogin(browser, "super_admin");
    await setLocale(context, "en");
    const page = await context.newPage();

    const apiResponse = await page.request.get("/api/activity-logs");
    expect(apiResponse.status()).toBe(200);
    const data = await apiResponse.json();
    expect(data.count).toBeGreaterThan(0);
    expect(data.results.length).toBeGreaterThan(0);
    expect(data.results[0]).toEqual(
      expect.objectContaining({
        id: expect.any(Number),
        manager_username: expect.any(String),
        activity_type: expect.stringMatching(/^(login|logout|action)$/),
        description: expect.any(String),
        timestamp: expect.any(String),
      }),
    );

    const actionResponse = await page.request.get(
      "/api/activity-logs?activity_type=action",
    );
    expect(actionResponse.status()).toBe(200);
    const actions = await actionResponse.json();
    expect(actions.results.length).toBeGreaterThan(0);
    expect(
      actions.results.every(
        (log: { activity_type: string }) => log.activity_type === "action",
      ),
    ).toBe(true);

    const malformedResponse = await page.request.get(
      "/api/activity-logs?manager=not-a-number&branch=also-invalid",
    );
    expect(malformedResponse.status()).toBe(200);

    const response = await page.goto("/admin/activity-logs", {
      waitUntil: "domcontentloaded",
    });
    expect(response?.status()).toBe(200);
    await expect(
      page.getByRole("heading", { name: /manager activity log/i }),
    ).toBeVisible();
    await expect(page.locator("tbody tr")).toHaveCount(data.results.length);
    await expect(page.locator("tbody tr").first()).toContainText(
      data.results[0].manager_name || data.results[0].manager_username,
    );
    await expect(page.locator("tbody tr").first()).toContainText(
      data.results[0].description,
    );
    await expect(page.locator("thead")).toContainText("IP");

    await page.goto("/admin/activity-logs?page=not-a-number", {
      waitUntil: "domcontentloaded",
    });
    await expect(page.locator("tbody tr").first()).toBeVisible();
    await context.close();
  });

  test("admin activity logs is responsive, localized, themed, and runtime-clean", async ({
    browser,
  }) => {
    const { context } = await apiLogin(browser, "super_admin");
    await setLocale(context, "en");
    await context.addCookies([
      { name: "mad_theme", value: "light", url: "http://localhost:3101" },
    ]);
    const page = await context.newPage();
    const consoleErrors = trackConsoleErrors(page);
    const pageErrors: string[] = [];
    const failedRequests: string[] = [];
    const unexpectedResponses: string[] = [];
    const expectedOrigin = "http://localhost:3101";

    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("requestfailed", (failedRequest) => {
      const requestUrl = new URL(failedRequest.url());
      const errorText = failedRequest.failure()?.errorText ?? "";
      if (
        requestUrl.origin === expectedOrigin &&
        !(
          requestUrl.searchParams.has("_rsc") &&
          errorText === "net::ERR_ABORTED"
        )
      ) {
        failedRequests.push(
          `${failedRequest.method()} ${failedRequest.url()} ${errorText}`,
        );
      }
    });
    page.on("response", (auditResponse) => {
      if (
        auditResponse.status() >= 400 &&
        auditResponse.url().startsWith(expectedOrigin)
      ) {
        unexpectedResponses.push(
          `${auditResponse.status()} ${auditResponse.request().method()} ${auditResponse.url()}`,
        );
      }
    });

    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 390, height: 844 },
      { width: 320, height: 800 },
    ]) {
      await page.setViewportSize(viewport);
      const response = await page.goto("/admin/activity-logs", {
        waitUntil: "domcontentloaded",
      });
      expect(response?.status()).toBe(200);
      await expect(page.locator("main")).toHaveCount(1);
      await expect(page.locator("h1")).toHaveCount(1);
      await expect(page).toHaveTitle(/Manager Activity Log/i);
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
        `horizontal overflow at ${viewport.width}px`,
      ).toBeLessThanOrEqual(1);
    }
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await expectNoRawKeys(page);

    await setLocale(context, "bn");
    await context.addCookies([
      { name: "mad_theme", value: "dark", url: "http://localhost:3101" },
    ]);
    await page.goto("/admin/activity-logs", {
      waitUntil: "domcontentloaded",
    });
    await expect(page.locator("html")).toHaveAttribute("lang", "bn");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(
      page.getByRole("heading", { name: "ম্যানেজার অ্যাক্টিভিটি লগ" }),
    ).toBeVisible();
    await expectNoRawKeys(page);

    expect(realErrors(consoleErrors), "application console errors").toEqual([]);
    expect(pageErrors, "uncaught page errors").toEqual([]);
    expect(failedRequests, "failed same-origin critical requests").toEqual([]);
    expect(unexpectedResponses, "unexpected same-origin HTTP failures").toEqual([]);
    await context.close();
  });

  test("admin manager history enforces page RBAC and intentional API scopes", async ({
    browser,
    page,
  }) => {
    await page.goto("/admin/branch-manager-history", {
      waitUntil: "domcontentloaded",
    });
    expect(new URL(page.url()).pathname).toBe("/login");
    expect((await page.request.get("/api/manager-assignments")).status()).toBe(
      401,
    );

    for (const role of DEMO_USERS.filter((role) => role !== "super_admin")) {
      const { context } = await apiLogin(browser, role);
      await setLocale(context, "en");
      const rolePage = await context.newPage();
      await rolePage.goto("/admin/branch-manager-history", {
        waitUntil: "domcontentloaded",
      });
      expect(new URL(rolePage.url()).pathname, `${role} page denial`).toBe(
        ROLE_HOME[role],
      );

      const api = await rolePage.request.get("/api/manager-assignments");
      if (role === "management" || role === "branch_manager") {
        expect(api.status(), `${role} intentional API scope`).toBe(200);
        const data = await api.json();
        expect(Array.isArray(data.results)).toBe(true);
        if (role === "branch_manager") {
          expect(
            data.results.every(
              (assignment: { manager_username: string }) =>
                assignment.manager_username === "branch_manager",
            ),
            "branch manager API must expose only their own assignments",
          ).toBe(true);
        }
      } else {
        expect(api.status(), `${role} API denial`).toBe(403);
      }
      await context.close();
    }
  });

  test("admin manager history renders real assignments and safely handles query filters", async ({
    browser,
  }) => {
    const { context } = await apiLogin(browser, "super_admin");
    await setLocale(context, "en");
    const page = await context.newPage();

    const apiResponse = await page.request.get("/api/manager-assignments");
    expect(apiResponse.status()).toBe(200);
    const data = await apiResponse.json();
    expect(data.count).toBeGreaterThan(0);
    expect(data.results.length).toBeGreaterThan(0);
    expect(data.results[0]).toEqual(
      expect.objectContaining({
        id: expect.any(Number),
        manager_username: expect.any(String),
        branch_name: expect.any(String),
        assigned_at: expect.any(String),
        is_active: expect.any(Boolean),
        duration_days: expect.any(Number),
      }),
    );

    const activeResponse = await page.request.get(
      "/api/manager-assignments?active=true",
    );
    expect(activeResponse.status()).toBe(200);
    const active = await activeResponse.json();
    expect(active.results.length).toBeGreaterThan(0);
    expect(
      active.results.every(
        (assignment: { is_active: boolean }) => assignment.is_active,
      ),
    ).toBe(true);

    const malformedResponse = await page.request.get(
      "/api/manager-assignments?manager=bad&branch=invalid",
    );
    expect(malformedResponse.status()).toBe(200);

    const response = await page.goto("/admin/branch-manager-history", {
      waitUntil: "domcontentloaded",
    });
    expect(response?.status()).toBe(200);
    await expect(
      page.getByRole("heading", { name: /manager assignment history/i }),
    ).toBeVisible();
    await expect(page.locator("tbody tr")).toHaveCount(data.results.length);
    await expect(page.locator("tbody tr").first()).toContainText(
      data.results[0].manager_name || data.results[0].manager_username,
    );
    await expect(page.locator("tbody tr").first()).toContainText(
      data.results[0].branch_name,
    );
    await expect(page.locator("tbody tr").first()).toContainText(
      data.results[0].is_active ? "Active" : "Completed",
    );

    await page.goto("/admin/branch-manager-history?page=invalid", {
      waitUntil: "domcontentloaded",
    });
    await expect(page.locator("tbody tr").first()).toBeVisible();
    await context.close();
  });

  test("admin manager history is responsive, localized, themed, and runtime-clean", async ({
    browser,
  }) => {
    const { context } = await apiLogin(browser, "super_admin");
    await setLocale(context, "en");
    await context.addCookies([
      { name: "mad_theme", value: "light", url: "http://localhost:3101" },
    ]);
    const page = await context.newPage();
    const consoleErrors = trackConsoleErrors(page);
    const pageErrors: string[] = [];
    const failedRequests: string[] = [];
    const unexpectedResponses: string[] = [];
    const expectedOrigin = "http://localhost:3101";

    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("requestfailed", (failedRequest) => {
      const requestUrl = new URL(failedRequest.url());
      const errorText = failedRequest.failure()?.errorText ?? "";
      if (
        requestUrl.origin === expectedOrigin &&
        !(
          requestUrl.searchParams.has("_rsc") &&
          errorText === "net::ERR_ABORTED"
        )
      ) {
        failedRequests.push(
          `${failedRequest.method()} ${failedRequest.url()} ${errorText}`,
        );
      }
    });
    page.on("response", (auditResponse) => {
      if (
        auditResponse.status() >= 400 &&
        auditResponse.url().startsWith(expectedOrigin)
      ) {
        unexpectedResponses.push(
          `${auditResponse.status()} ${auditResponse.request().method()} ${auditResponse.url()}`,
        );
      }
    });

    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 390, height: 844 },
      { width: 320, height: 800 },
    ]) {
      await page.setViewportSize(viewport);
      const response = await page.goto("/admin/branch-manager-history", {
        waitUntil: "domcontentloaded",
      });
      expect(response?.status()).toBe(200);
      await expect(page.locator("main")).toHaveCount(1);
      await expect(page.locator("h1")).toHaveCount(1);
      await expect(page).toHaveTitle(/Manager Assignment History/i);
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
        `horizontal overflow at ${viewport.width}px`,
      ).toBeLessThanOrEqual(1);
    }
    await expectNoRawKeys(page);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

    await setLocale(context, "bn");
    await context.addCookies([
      { name: "mad_theme", value: "dark", url: "http://localhost:3101" },
    ]);
    await page.goto("/admin/branch-manager-history", {
      waitUntil: "domcontentloaded",
    });
    await expect(page.locator("html")).toHaveAttribute("lang", "bn");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(
      page.getByRole("heading", { name: "ম্যানেজার অ্যাসাইনমেন্ট ইতিহাস" }),
    ).toBeVisible();
    await expectNoRawKeys(page);

    expect(realErrors(consoleErrors), "application console errors").toEqual([]);
    expect(pageErrors, "uncaught page errors").toEqual([]);
    expect(failedRequests, "failed same-origin critical requests").toEqual([]);
    expect(unexpectedResponses, "unexpected same-origin HTTP failures").toEqual([]);
    await context.close();
  });

  test("admin branch pages enforce page and mutation boundaries for every wrong role", async ({
    browser,
    page,
  }) => {
    const paths = [
      "/admin/branches",
      "/admin/branches/create",
      "/admin/branches/1",
      "/admin/branches/1/edit",
    ];
    for (const path of paths) {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      expect(new URL(page.url()).pathname, `${path} anonymous denial`).toBe(
        "/login",
      );
    }
    expect((await page.request.get("/api/branches")).status()).toBe(401);
    expect((await page.request.get("/api/branches/1")).status()).toBe(401);
    expect(
      (await page.request.post("/api/branches", { data: {} })).status(),
    ).toBe(401);
    expect(
      (await page.request.patch("/api/branches/1", { data: {} })).status(),
    ).toBe(401);

    for (const role of DEMO_USERS.filter((role) => role !== "super_admin")) {
      const { context } = await apiLogin(browser, role);
      await setLocale(context, "en");
      const rolePage = await context.newPage();
      for (const path of paths) {
        await rolePage.goto(path, { waitUntil: "domcontentloaded" });
        expect(
          new URL(rolePage.url()).pathname,
          `${role} denial for ${path}`,
        ).toBe(ROLE_HOME[role]);
      }

      expect((await rolePage.request.get("/api/branches")).status()).toBe(200);
      expect((await rolePage.request.get("/api/branches/1")).status()).toBe(200);
      expect(
        (await rolePage.request.post("/api/branches", { data: {} })).status(),
        `${role} create denial`,
      ).toBe(403);
      expect(
        (
          await rolePage.request.patch("/api/branches/1", { data: {} })
        ).status(),
        `${role} edit denial`,
      ).toBe(403);
      await context.close();
    }
  });

  test("admin branch list and detail render real data with safe action semantics", async ({
    browser,
  }) => {
    const { context } = await apiLogin(browser, "super_admin");
    await setLocale(context, "en");
    const page = await context.newPage();
    const listResponse = await page.request.get(
      "/api/branches?page_size=100",
    );
    expect(listResponse.status()).toBe(200);
    const data = await listResponse.json();
    expect(data.count).toBeGreaterThanOrEqual(3);

    await page.goto("/admin/branches", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /^branches$/i })).toBeVisible();
    await expect(page.locator("tbody tr")).toHaveCount(data.results.length);
    await expect(
      page.getByRole("link", { name: /new branch/i }),
    ).toHaveAttribute("href", "/admin/branches/create");

    const first = data.results[0];
    const row = page.locator("tbody tr").filter({ hasText: first.name });
    await expect(row).toHaveCount(1);
    await expect(row.getByRole("link", { name: /^view$/i })).toHaveAttribute(
      "href",
      `/admin/branches/${first.id}`,
    );
    await expect(row.getByRole("link", { name: /^edit$/i })).toHaveAttribute(
      "href",
      `/admin/branches/${first.id}/edit`,
    );
    await row.getByRole("button", { name: /^delete$/i }).click();
    const rowDialog = page.getByRole("dialog", { name: /delete branch/i });
    await expect(rowDialog).toContainText(first.name);
    await expect(rowDialog).toContainText(/archiv/i);
    await rowDialog.getByRole("button", { name: /^cancel$/i }).click();
    expect((await page.request.get(`/api/branches/${first.id}`)).status()).toBe(
      200,
    );

    await page.goto(`/admin/branches/${first.id}`, {
      waitUntil: "domcontentloaded",
    });
    await expect(
      page.getByRole("heading", { name: first.name, level: 1 }),
    ).toBeVisible();
    await expect(page.locator("main")).toContainText(first.address);
    await expect(page.locator("main")).toContainText(first.phone);
    await expect(
      page.getByRole("link", { name: /^edit$/i }),
    ).toHaveAttribute("href", `/admin/branches/${first.id}/edit`);
    await expect(page.getByLabel(/manager/i)).toBeVisible();

    await page.getByTestId("branch-delete").click();
    const detailDialog = page.getByRole("dialog", {
      name: /delete branch/i,
    });
    await expect(detailDialog).toContainText(first.name);
    await detailDialog.getByRole("button", { name: /^cancel$/i }).click();
    expect((await page.request.get(`/api/branches/${first.id}`)).status()).toBe(
      200,
    );
    await context.close();
  });

  test("admin creates an inactive audit branch then edits and reactivates it without deletion", async ({
    browser,
  }) => {
    const { context } = await apiLogin(browser, "super_admin");
    await setLocale(context, "en");
    const page = await context.newPage();
    const suffix = `${Date.now()}${test.info().workerIndex}`;
    const name = `Audit Branch ${suffix}`;
    const email = `audit-branch-${suffix}@example.com`;

    await page.goto("/admin/branches/create", { waitUntil: "networkidle" });
    const create = page.getByRole("button", { name: /^create branch$/i });
    await create.click();
    await expect(page.getByText("This field is required")).toHaveCount(2);

    await page.getByLabel(/^Branch name/i).fill(name);
    await page.getByLabel(/^Phone/i).fill("01812345678");
    await page.getByLabel(/^Address/i).fill("Audit branch address");
    await page.getByLabel(/^Email/i).fill(email);
    await page.getByLabel(/^Brand type/i).selectOption("cheez");
    await page.getByLabel(/^Branch active/i).uncheck();
    await create.click();
    await page.waitForURL("/admin/branches", { timeout: 20_000 });

    const row = page.locator("tbody tr").filter({ hasText: name });
    await expect(row).toHaveCount(1);
    const viewHref = await row
      .getByRole("link", { name: /^view$/i })
      .getAttribute("href");
    expect(viewHref).toMatch(/^\/admin\/branches\/\d+$/);
    const branchId = Number(viewHref?.split("/").pop());
    const createdResponse = await page.request.get(`/api/branches/${branchId}`);
    expect(createdResponse.status()).toBe(200);
    const created = await createdResponse.json();
    expect(created).toMatchObject({
      name,
      email,
      brand_type: "cheez",
      is_active: false,
    });

    const { context: customerContext } = await apiLogin(browser, "customer");
    const customerPage = await customerContext.newPage();
    const customerList = await customerPage.request.get(
      `/api/branches?search=${encodeURIComponent(name)}`,
    );
    expect(customerList.status()).toBe(200);
    expect((await customerList.json()).results).toHaveLength(0);
    expect(
      (await customerPage.request.get(`/api/branches/${branchId}`)).status(),
      "customer must not bypass active-branch visibility with a direct ID",
    ).toBe(404);
    await customerContext.close();

    await page.goto(`/admin/branches/${branchId}/edit`, {
      waitUntil: "networkidle",
    });
    await page.getByLabel(/^Email/i).fill("");
    await page.getByLabel(/^Branch active/i).check();
    await page.getByRole("button", { name: /^save changes$/i }).click();
    await page.waitForURL("/admin/branches", { timeout: 20_000 });

    const editedResponse = await page.request.get(`/api/branches/${branchId}`);
    expect(editedResponse.status()).toBe(200);
    expect(await editedResponse.json()).toMatchObject({
      name,
      email: "",
      is_active: true,
    });
    await context.close();
  });

  test("admin branch pages handle not-found, responsiveness, locale, theme, and runtime", async ({
    browser,
  }) => {
    const { context } = await apiLogin(browser, "super_admin");
    await setLocale(context, "en");
    await context.addCookies([
      { name: "mad_theme", value: "light", url: "http://localhost:3101" },
    ]);
    const page = await context.newPage();
    const consoleErrors = trackConsoleErrors(page);
    const paths = [
      "/admin/branches",
      "/admin/branches/create",
      "/admin/branches/1",
      "/admin/branches/1/edit",
    ];

    for (const path of paths) {
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

    expect((await page.request.get("/api/branches/999999999")).status()).toBe(
      404,
    );
    await page.goto("/admin/branches/999999999", {
      waitUntil: "domcontentloaded",
    });
    await expect(
      page.getByRole("heading", { name: "Page not found" }),
    ).toBeVisible();

    await setLocale(context, "bn");
    await context.addCookies([
      { name: "mad_theme", value: "dark", url: "http://localhost:3101" },
    ]);
    for (const path of paths) {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      await expect(page.locator("html")).toHaveAttribute("lang", "bn");
      await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
      await expectNoRawKeys(page);
    }
    expect(realErrors(consoleErrors), "application console errors").toEqual([]);
    await context.close();
  });

  test("admin categories protects the page and every mutation boundary", async ({
    browser,
    page,
  }) => {
    await page.goto("/admin/categories", { waitUntil: "domcontentloaded" });
    expect(new URL(page.url()).pathname).toBe("/login");
    expect((await page.request.get("/api/categories")).status()).toBe(401);
    expect(
      (await page.request.post("/api/categories", { data: {} })).status(),
    ).toBe(401);

    for (const role of DEMO_USERS.filter((role) => role !== "super_admin")) {
      const { context } = await apiLogin(browser, role);
      await setLocale(context, "en");
      const rolePage = await context.newPage();
      await rolePage.goto("/admin/categories", {
        waitUntil: "domcontentloaded",
      });
      expect(new URL(rolePage.url()).pathname, `${role} page denial`).toBe(
        ROLE_HOME[role],
      );
      expect((await rolePage.request.get("/api/categories")).status()).toBe(200);
      expect(
        (
          await rolePage.request.post("/api/categories", {
            data: { name: "Forbidden audit category" },
          })
        ).status(),
        `${role} create denial`,
      ).toBe(403);
      expect(
        (
          await rolePage.request.patch("/api/categories/1", {
            data: { name: "Forbidden" },
          })
        ).status(),
        `${role} edit denial`,
      ).toBe(403);
      expect(
        (
          await rolePage.request.post("/api/categories/1/status", {
            data: { is_active: false },
          })
        ).status(),
        `${role} status denial`,
      ).toBe(403);
      await context.close();
    }
  });

  test("admin categories renders real scopes, creates additively, and keeps destructive actions cancel-only", async ({
    browser,
  }) => {
    const { context } = await apiLogin(browser, "super_admin");
    await setLocale(context, "en");
    const page = await context.newPage();
    const suffix = `${Date.now()}${test.info().workerIndex}`;
    const name = `Audit Category ${suffix}`;

    const apiResponse = await page.request.get("/api/categories?page_size=200");
    expect(apiResponse.status()).toBe(200);
    const data = await apiResponse.json();
    expect(data.count).toBeGreaterThan(0);

    const malformed = await page.request.get(
      "/api/categories?branch_id=not-a-number",
    );
    expect(malformed.status()).toBe(200);

    await page.goto("/admin/categories", { waitUntil: "networkidle" });
    await expect(
      page.getByRole("heading", { name: /^product categories$/i }),
    ).toBeVisible();
    await expect(page.locator("tbody tr")).toHaveCount(data.results.length);
    await expect(page.getByLabel(/^Branch$/i)).toBeVisible();
    await expect(page.getByLabel(/^Category name$/i)).toBeVisible();
    await expect(page.getByLabel(/^Description$/i)).toBeVisible();

    await page.getByLabel(/^Branch$/i).selectOption("global");
    await page.getByLabel(/^Category name$/i).fill(name);
    await page.getByLabel(/^Description$/i).fill("Audit-only category");
    await page.getByRole("button", { name: /^create category$/i }).click();
    await expect(page.getByText(/category created/i)).toBeVisible();
    const row = page.locator("tbody tr").filter({ hasText: name });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText(/main branch|global/i);
    await expect(row).toContainText("Active");

    const createdSearch = await page.request.get(
      `/api/categories?search=${encodeURIComponent(name)}`,
    );
    expect(createdSearch.status()).toBe(200);
    const created = await createdSearch.json();
    expect(created.results).toHaveLength(1);
    const categoryId = created.results[0].id;

    await page.getByTestId(`category-deactivate-${categoryId}`).click();
    const deactivate = page.getByRole("dialog", {
      name: /deactivate category/i,
    });
    await expect(deactivate).toContainText(name);
    await deactivate.getByRole("button", { name: /^cancel$/i }).click();

    await page.getByTestId(`category-delete-${categoryId}`).click();
    const deleteDialog = page.getByRole("dialog", {
      name: /delete category/i,
    });
    await expect(deleteDialog).toContainText(name);
    await expect(deleteDialog).toContainText(/permanently deleted/i);
    await deleteDialog.getByRole("button", { name: /^cancel$/i }).click();
    expect((await page.request.get(`/api/categories/${categoryId}`)).status()).toBe(
      200,
    );
    await context.close();
  });

  test("admin categories is responsive, localized, themed, and runtime-clean", async ({
    browser,
  }) => {
    const { context } = await apiLogin(browser, "super_admin");
    await setLocale(context, "en");
    await context.addCookies([
      { name: "mad_theme", value: "light", url: "http://localhost:3101" },
    ]);
    const page = await context.newPage();
    const consoleErrors = trackConsoleErrors(page);
    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 390, height: 844 },
      { width: 320, height: 800 },
    ]) {
      await page.setViewportSize(viewport);
      const response = await page.goto("/admin/categories", {
        waitUntil: "domcontentloaded",
      });
      expect(response?.status()).toBe(200);
      await expect(page.locator("main")).toHaveCount(1);
      await expect(page.locator("h1")).toHaveCount(1);
      await expect(page).toHaveTitle(/Categories/i);
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
        `horizontal overflow at ${viewport.width}px`,
      ).toBeLessThanOrEqual(1);
    }
    await expectNoRawKeys(page);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

    await setLocale(context, "bn");
    await context.addCookies([
      { name: "mad_theme", value: "dark", url: "http://localhost:3101" },
    ]);
    await page.goto("/admin/categories", { waitUntil: "domcontentloaded" });
    await expect(page.locator("html")).toHaveAttribute("lang", "bn");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expectNoRawKeys(page);
    expect(realErrors(consoleErrors), "application console errors").toEqual([]);
    await context.close();
  });

  test("admin complaints protects its page while preserving each role's scoped API", async ({
    browser,
    page,
  }) => {
    await page.goto("/admin/complaints", { waitUntil: "domcontentloaded" });
    expect(new URL(page.url()).pathname).toBe("/login");
    expect((await page.request.get("/api/complaints")).status()).toBe(401);

    for (const role of DEMO_USERS.filter((role) => role !== "super_admin")) {
      const { context } = await apiLogin(browser, role);
      await setLocale(context, "en");
      const rolePage = await context.newPage();
      await rolePage.goto("/admin/complaints", {
        waitUntil: "domcontentloaded",
      });
      expect(new URL(rolePage.url()).pathname, `${role} page denial`).toBe(
        ROLE_HOME[role],
      );
      const api = await rolePage.request.get("/api/complaints?page_size=100");
      expect(api.status(), `${role} scoped API`).toBe(200);
      const data = await api.json();
      expect(Array.isArray(data.results)).toBe(true);
      await context.close();
    }
  });

  test("admin complaints renders real records and keeps all, inbox, sent, and status filters exact", async ({
    browser,
  }) => {
    const { context } = await apiLogin(browser, "super_admin");
    await setLocale(context, "en");
    const page = await context.newPage();

    const allResponse = await page.request.get(
      "/api/complaints?page_size=100",
    );
    expect(allResponse.status()).toBe(200);
    const all = await allResponse.json();
    expect(all.count).toBeGreaterThan(0);

    const inboxResponse = await page.request.get(
      "/api/complaints?box=inbox&page_size=100",
    );
    expect(inboxResponse.status()).toBe(200);
    const inbox = await inboxResponse.json();
    expect(inbox.results.length).toBeGreaterThan(0);
    expect(
      inbox.results.every(
        (complaint: { recipient_role: string }) =>
          complaint.recipient_role === "super_admin",
      ),
      "Super Admin inbox must contain only complaints addressed to Super Admin",
    ).toBe(true);

    const pendingResponse = await page.request.get(
      "/api/complaints?status=pending&page_size=100",
    );
    expect(pendingResponse.status()).toBe(200);
    const pending = await pendingResponse.json();
    expect(pending.results.length).toBeGreaterThan(0);
    expect(
      pending.results.every(
        (complaint: { status: string }) => complaint.status === "pending",
      ),
    ).toBe(true);

    const response = await page.goto("/admin/complaints", {
      waitUntil: "domcontentloaded",
    });
    expect(response?.status()).toBe(200);
    await expect(
      page.getByRole("heading", { name: /^complaints$/i }),
    ).toBeVisible();
    await expect(page.locator("main ul > li")).toHaveCount(all.results.length);
    await expect(
      page.getByRole("link", { name: /new complaint/i }),
    ).toHaveAttribute("href", "/complaints/new");

    const first = all.results[0];
    await expect(
      page.locator(`main a[href="/complaints/${first.id}"]`),
    ).toContainText(first.subject);
    await expect(
      page.getByRole("link", { name: /^inbox$/i }),
    ).toHaveAttribute("href", "/admin/complaints?box=inbox");
    await page.getByRole("link", { name: /^inbox$/i }).click();
    await expect(page).toHaveURL(/box=inbox/);
    await expect(page.locator("main ul > li")).toHaveCount(
      inbox.results.length,
    );
    for (const complaint of inbox.results) {
      await expect(page.locator(`a[href="/complaints/${complaint.id}"]`)).toBeVisible();
    }

    await expect(
      page.getByRole("link", { name: /^pending$/i }),
    ).toHaveAttribute(
      "href",
      "/admin/complaints?box=inbox&status=pending",
    );
    await context.close();
  });

  test("admin complaints is responsive, localized, themed, and runtime-clean", async ({
    browser,
  }) => {
    const { context } = await apiLogin(browser, "super_admin");
    await setLocale(context, "en");
    await context.addCookies([
      { name: "mad_theme", value: "light", url: "http://localhost:3101" },
    ]);
    const page = await context.newPage();
    const consoleErrors = trackConsoleErrors(page);
    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 390, height: 844 },
      { width: 320, height: 800 },
    ]) {
      await page.setViewportSize(viewport);
      const response = await page.goto("/admin/complaints", {
        waitUntil: "domcontentloaded",
      });
      expect(response?.status()).toBe(200);
      await expect(page.locator("main")).toHaveCount(1);
      await expect(page.locator("h1")).toHaveCount(1);
      await expect(page).toHaveTitle(/Complaints/i);
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
        `horizontal overflow at ${viewport.width}px`,
      ).toBeLessThanOrEqual(1);
    }
    await expectNoRawKeys(page);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await setLocale(context, "bn");
    await context.addCookies([
      { name: "mad_theme", value: "dark", url: "http://localhost:3101" },
    ]);
    await page.goto("/admin/complaints", { waitUntil: "domcontentloaded" });
    await expect(page.locator("html")).toHaveAttribute("lang", "bn");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expectNoRawKeys(page);
    expect(realErrors(consoleErrors), "application console errors").toEqual([]);
    await context.close();
  });

  test("admin customer and blocked-customer pages protect all mutation boundaries", async ({
    browser,
    page,
  }) => {
    for (const path of ["/admin/customers", "/admin/customers/blocked"]) {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      expect(new URL(page.url()).pathname, `${path} anonymous denial`).toBe(
        "/login",
      );
    }
    expect(
      (
        await page.request.post("/api/auth/users/8/block", {
          data: { reason: "forbidden" },
        })
      ).status(),
    ).toBe(401);
    expect(
      (await page.request.post("/api/auth/users/12/unblock")).status(),
    ).toBe(401);

    for (const role of DEMO_USERS.filter((role) => role !== "super_admin")) {
      const { context } = await apiLogin(browser, role);
      await setLocale(context, "en");
      const rolePage = await context.newPage();
      for (const path of ["/admin/customers", "/admin/customers/blocked"]) {
        await rolePage.goto(path, { waitUntil: "domcontentloaded" });
        expect(new URL(rolePage.url()).pathname, `${role} ${path}`).toBe(
          ROLE_HOME[role],
        );
      }
      expect(
        (
          await rolePage.request.post("/api/auth/users/8/block", {
            data: { reason: "forbidden" },
          })
        ).status(),
        `${role} block denial`,
      ).toBe(403);
      expect(
        (
          await rolePage.request.post("/api/auth/users/12/unblock")
        ).status(),
        `${role} unblock denial`,
      ).toBe(403);
      await context.close();
    }
  });

  test("admin customer pages render real account state and support a reversible audit-only block cycle", async ({
    browser,
  }) => {
    const { context } = await apiLogin(browser, "super_admin");
    await setLocale(context, "en");
    const page = await context.newPage();

    const customersResponse = await page.request.get(
      "/api/auth/users?role=customer&page_size=200",
    );
    expect(customersResponse.status()).toBe(200);
    const customers = await customersResponse.json();
    expect(customers.count).toBeGreaterThan(0);
    const blockedResponse = await page.request.get(
      "/api/auth/users?role=customer&status=blocked&page_size=200",
    );
    expect(blockedResponse.status()).toBe(200);
    const blocked = await blockedResponse.json();
    expect(blocked.results.length).toBeGreaterThan(0);

    await page.goto("/admin/customers", { waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("heading", { name: /^customer accounts$/i }),
    ).toBeVisible();
    await expect(page.locator("tbody tr")).toHaveCount(customers.count);
    await expect(
      page.getByRole("link", { name: /blocked list/i }),
    ).toHaveAttribute("href", "/admin/customers/blocked");

    const activeRow = page
      .locator("tbody tr")
      .filter({ hasText: "@customer" })
      .first();
    await activeRow.getByRole("button", { name: /^block$/i }).click();
    const reason = activeRow.getByPlaceholder(/reason/i);
    await expect(reason).toBeVisible();
    await expect(reason).toHaveAccessibleName(/reason/i);
    await activeRow.getByRole("button", { name: /^block$/i }).click();
    await expect(activeRow).toContainText(/enter a block reason/i);

    await page.goto("/admin/customers/blocked", {
      waitUntil: "domcontentloaded",
    });
    await expect(
      page.getByRole("heading", { name: /^blocked customers$/i }),
    ).toBeVisible();
    await expect(page.locator("tbody tr")).toHaveCount(blocked.results.length);
    await expect(page.locator("tbody")).toContainText("@blocked_customer");
    await expect(
      page.getByRole("link", { name: /all customers/i }),
    ).toHaveAttribute("href", "/admin/customers");

    const suffix = `${Date.now()}${test.info().workerIndex}`;
    const createdResponse = await page.request.post("/api/auth/users", {
      data: {
        username: `audit_block_${suffix}`,
        email: `audit-block-${suffix}@example.com`,
        first_name: "Audit",
        last_name: "Block Cycle",
        role: "customer",
        status: "approved",
        password: "Admin12345@##",
      },
    });
    expect(createdResponse.status()).toBe(201);
    const created = await createdResponse.json();
    const blockResponse = await page.request.post(
      `/api/auth/users/${created.id}/block`,
      { data: { reason: "Temporary isolated audit block" } },
    );
    expect(blockResponse.status()).toBe(200);
    expect(await blockResponse.json()).toMatchObject({
      is_blocked: true,
      blocked_reason: "Temporary isolated audit block",
    });

    await page.reload({ waitUntil: "domcontentloaded" });
    const auditRow = page.locator("tbody tr").filter({ hasText: created.username });
    await expect(auditRow).toHaveCount(1);
    await expect(auditRow).toContainText("Temporary isolated audit block");

    const unblockResponse = await page.request.post(
      `/api/auth/users/${created.id}/unblock`,
    );
    expect(unblockResponse.status()).toBe(200);
    expect(await unblockResponse.json()).toMatchObject({
      is_blocked: false,
      blocked_reason: "",
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(
      page.locator("tbody tr").filter({ hasText: created.username }),
    ).toHaveCount(0);
    expect(
      (await page.request.get(`/api/auth/users/${created.id}`)).status(),
      "audit-only customer remains after reversible block cycle",
    ).toBe(200);
    await context.close();
  });

  test("admin customer pages are responsive, localized, themed, and runtime-clean", async ({
    browser,
  }) => {
    const { context } = await apiLogin(browser, "super_admin");
    await setLocale(context, "en");
    await context.addCookies([
      { name: "mad_theme", value: "light", url: "http://localhost:3101" },
    ]);
    const page = await context.newPage();
    const consoleErrors = trackConsoleErrors(page);
    for (const path of ["/admin/customers", "/admin/customers/blocked"]) {
      for (const viewport of [
        { width: 1440, height: 900 },
        { width: 390, height: 844 },
        { width: 320, height: 800 },
      ]) {
        await page.setViewportSize(viewport);
        const response = await page.goto(path, {
          waitUntil: "domcontentloaded",
        });
        expect(response?.status(), `${path} ${viewport.width}px`).toBe(200);
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
    for (const path of ["/admin/customers", "/admin/customers/blocked"]) {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      await expect(page.locator("html")).toHaveAttribute("lang", "bn");
      await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
      await expectNoRawKeys(page);
    }
    expect(realErrors(consoleErrors), "application console errors").toEqual([]);
    await context.close();
  });

  test("admin delivery areas protects its page and preserves branch-manager API scope", async ({
    browser,
    page,
  }) => {
    await page.goto("/admin/delivery-areas", {
      waitUntil: "domcontentloaded",
    });
    expect(new URL(page.url()).pathname).toBe("/login");
    expect((await page.request.get("/api/delivery-areas")).status()).toBe(401);

    for (const role of DEMO_USERS.filter((role) => role !== "super_admin")) {
      const { context } = await apiLogin(browser, role);
      await setLocale(context, "en");
      const rolePage = await context.newPage();
      await rolePage.goto("/admin/delivery-areas", {
        waitUntil: "domcontentloaded",
      });
      expect(new URL(rolePage.url()).pathname, `${role} page denial`).toBe(
        ROLE_HOME[role],
      );
      const api = await rolePage.request.get("/api/delivery-areas");
      expect(api.status(), `${role} API scope`).toBe(
        role === "branch_manager" ? 200 : 403,
      );
      await context.close();
    }
  });

  test("admin delivery areas renders real data, creates additively, edits safely, and reverses hold state", async ({
    browser,
  }) => {
    const { context } = await apiLogin(browser, "super_admin");
    await setLocale(context, "en");
    const page = await context.newPage();
    const suffix = `${Date.now()}${test.info().workerIndex}`;
    const name = `Audit Area ${suffix}`;

    const apiResponse = await page.request.get("/api/delivery-areas");
    expect(apiResponse.status()).toBe(200);
    const data = await apiResponse.json();
    expect(data.count).toBeGreaterThan(0);
    const heldResponse = await page.request.get(
      "/api/delivery-areas?status=held",
    );
    expect(heldResponse.status()).toBe(200);
    const held = await heldResponse.json();
    expect(held.results.length).toBeGreaterThan(0);
    expect(
      held.results.every((area: { is_held: boolean }) => area.is_held),
    ).toBe(true);

    await page.goto("/admin/delivery-areas", { waitUntil: "networkidle" });
    await expect(
      page.getByRole("heading", { name: /delivery areas/i, level: 1 }),
    ).toBeVisible();
    await expect(page.locator("tbody tr")).toHaveCount(data.results.length);
    await expect(
      page.getByRole("combobox", { name: /filter by branch/i }),
    ).toBeVisible();
    await expect(page.getByRole("textbox", { name: /^Area name/i })).toHaveCount(0);
    const addLink = page.getByRole("link", { name: /add delivery area/i });
    await expect(addLink).toHaveAttribute("href", "/admin/delivery-areas/new");

    const firstRow = page.locator("tbody tr").first();
    await firstRow.getByRole("link", { name: /^edit$/i }).click();
    await expect(page).toHaveURL(/\/admin\/delivery-areas\/\d+\/edit/);
    await expect(page.getByRole("textbox", { name: /area name/i })).toBeVisible();
    await expect(page.getByRole("spinbutton", { name: /delivery time/i })).toBeVisible();
    await expect(page.getByRole("textbox", { name: /delivery charge/i })).toBeVisible();
    await page.getByRole("link", { name: /^cancel$/i }).click();
    await expect(page).toHaveURL(/\/admin\/delivery-areas/);

    await addLink.click();
    await expect(page).toHaveURL(/\/admin\/delivery-areas\/new/);
    await page.getByRole("combobox", { name: /^Branch$/i }).selectOption({ index: 1 });
    await page.getByRole("textbox", { name: /^Area name/i }).fill(name);
    await page.getByRole("spinbutton", { name: /delivery time/i }).fill("37");
    await page.getByRole("textbox", { name: /delivery charge/i }).fill("55");
    await page.getByRole("button", { name: /create delivery area/i }).click();
    await expect(page.getByText(/delivery area created/i)).toBeVisible();
    const auditRow = page.locator("tbody tr").filter({ hasText: name });
    await expect(auditRow).toHaveCount(1);
    await expect(auditRow).toContainText("37");
    await expect(auditRow).toContainText("৳55");

    const refreshed = await page.request.get(
      `/api/delivery-areas?search=${encodeURIComponent(name)}`,
    );
    const created = (await refreshed.json()).results.find(
      (area: { name: string }) => area.name === name,
    );
    expect(created).toBeTruthy();
    await auditRow.getByRole("button", { name: /hold delivery/i }).click();
    await page
      .getByRole("dialog", { name: new RegExp(name) })
      .getByRole("button", { name: /hold delivery/i })
      .click();
    await expect(auditRow).toContainText(/On Hold/i);
    let heldAudit = await (
      await page.request.get(
        `/api/delivery-areas?status=held&search=${encodeURIComponent(name)}`,
      )
    ).json();
    expect(
      heldAudit.results.some((area: { id: number }) => area.id === created.id),
    ).toBe(true);

    await auditRow.getByRole("button", { name: /resume delivery/i }).click();
    await page
      .getByRole("dialog", { name: new RegExp(name) })
      .getByRole("button", { name: /resume delivery/i })
      .click();
    await expect(auditRow).toContainText("Available");
    heldAudit = await (
      await page.request.get(
        `/api/delivery-areas?status=held&search=${encodeURIComponent(name)}`,
      )
    ).json();
    expect(
      heldAudit.results.some((area: { id: number }) => area.id === created.id),
    ).toBe(false);
    await context.close();
  });

  test("admin delivery areas is responsive, localized, themed, and runtime-clean", async ({
    browser,
  }) => {
    const { context } = await apiLogin(browser, "super_admin");
    await setLocale(context, "en");
    await context.addCookies([
      { name: "mad_theme", value: "light", url: "http://localhost:3101" },
    ]);
    const page = await context.newPage();
    const consoleErrors = trackConsoleErrors(page);
    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 390, height: 844 },
      { width: 320, height: 800 },
    ]) {
      await page.setViewportSize(viewport);
      const response = await page.goto("/admin/delivery-areas", {
        waitUntil: "domcontentloaded",
      });
      expect(response?.status()).toBe(200);
      await expect(page.locator("main")).toHaveCount(1);
      await expect(page.locator("h1")).toHaveCount(1);
      await expect(page).toHaveTitle(/Delivery Areas/i);
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
        `horizontal overflow at ${viewport.width}px`,
      ).toBeLessThanOrEqual(1);
    }
    await expectNoRawKeys(page);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await setLocale(context, "bn");
    await context.addCookies([
      { name: "mad_theme", value: "dark", url: "http://localhost:3101" },
    ]);
    await page.goto("/admin/delivery-areas", {
      waitUntil: "domcontentloaded",
    });
    await expect(page.locator("html")).toHaveAttribute("lang", "bn");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expectNoRawKeys(page);
    expect(realErrors(consoleErrors), "application console errors").toEqual([]);
    await context.close();
  });

  test("admin notices protects its page and applies exact compose/delete scopes", async ({
    browser,
    page,
  }) => {
    await page.goto("/admin/notices", { waitUntil: "domcontentloaded" });
    expect(new URL(page.url()).pathname).toBe("/login");
    expect((await page.request.get("/api/notices")).status()).toBe(401);

    for (const role of DEMO_USERS.filter((role) => role !== "super_admin")) {
      const { context } = await apiLogin(browser, role);
      await setLocale(context, "en");
      const rolePage = await context.newPage();
      await rolePage.goto("/admin/notices", { waitUntil: "domcontentloaded" });
      expect(new URL(rolePage.url()).pathname, `${role} page denial`).toBe(
        ROLE_HOME[role],
      );
      expect((await rolePage.request.get("/api/notices")).status()).toBe(200);
      const publish = await rolePage.request.post("/api/notices", {
        data: { title: "Forbidden", audience: "all" },
      });
      expect(publish.status(), `${role} publish scope`).toBe(
        role === "marketing" ? 201 : 403,
      );
      expect(
        (await rolePage.request.delete("/api/notices/1")).status(),
        `${role} delete denial`,
      ).toBe(403);
      await context.close();
    }
  });

  test("admin notices renders real broadcasts, publishes additively, and cancels deletion", async ({
    browser,
  }) => {
    const { context } = await apiLogin(browser, "super_admin");
    await setLocale(context, "en");
    const page = await context.newPage();
    const suffix = `${Date.now()}${test.info().workerIndex}`;
    const title = `Audit Notice ${suffix}`;

    const beforeResponse = await page.request.get("/api/notices?page_size=100");
    expect(beforeResponse.status()).toBe(200);
    const before = await beforeResponse.json();
    expect(before.count).toBeGreaterThan(0);

    await page.goto("/admin/notices", { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: /^notices$/i })).toBeVisible();
    await expect(page.locator("main ul > li")).toHaveCount(before.results.length);
    await expect(page.getByLabel(/^Title$/i)).toBeVisible();
    await expect(page.getByLabel(/^Audience$/i)).toBeVisible();
    await expect(page.getByLabel(/^Body$/i)).toBeVisible();

    await page.getByLabel(/^Title$/i).fill(title);
    await page.getByLabel(/^Audience$/i).selectOption("customer");
    await page.getByLabel(/^Body$/i).fill("Audit-only customer notice");
    await page.getByRole("button", { name: /^publish$/i }).click();
    await expect(page.getByText(/notice published/i)).toBeVisible();
    await page.reload({ waitUntil: "domcontentloaded" });
    const notice = page.locator("main li").filter({ hasText: title });
    await expect(notice).toHaveCount(1);
    await expect(notice).toContainText("Customer");

    const customer = await apiLogin(browser, "customer");
    const customerNotices = await customer.req.get("/api/notices?page_size=100");
    expect(customerNotices.status()).toBe(200);
    expect(
      (await customerNotices.json()).results.some(
        (item: { title: string }) => item.title === title,
      ),
    ).toBe(true);
    await customer.context.close();

    const rider = await apiLogin(browser, "rider");
    const riderNotices = await rider.req.get("/api/notices?page_size=100");
    expect(riderNotices.status()).toBe(200);
    expect(
      (await riderNotices.json()).results.some(
        (item: { title: string }) => item.title === title,
      ),
    ).toBe(false);
    await rider.context.close();

    await notice.getByRole("button", { name: /^delete$/i }).click();
    const dialog = page.getByRole("dialog", { name: /delete notice/i });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: /^cancel$/i }).click();
    await expect(notice).toHaveCount(1);
    await context.close();
  });

  test("admin notices is responsive, localized, themed, and runtime-clean", async ({
    browser,
  }) => {
    const { context } = await apiLogin(browser, "super_admin");
    await setLocale(context, "en");
    await context.addCookies([
      { name: "mad_theme", value: "light", url: "http://localhost:3101" },
    ]);
    const page = await context.newPage();
    const consoleErrors = trackConsoleErrors(page);
    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 390, height: 844 },
      { width: 320, height: 800 },
    ]) {
      await page.setViewportSize(viewport);
      const response = await page.goto("/admin/notices", {
        waitUntil: "domcontentloaded",
      });
      expect(response?.status()).toBe(200);
      await expect(page.locator("main")).toHaveCount(1);
      await expect(page.locator("h1")).toHaveCount(1);
      await expect(page).toHaveTitle(/Notices/i);
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
        `horizontal overflow at ${viewport.width}px`,
      ).toBeLessThanOrEqual(1);
    }
    await expectNoRawKeys(page);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await setLocale(context, "bn");
    await context.addCookies([
      { name: "mad_theme", value: "dark", url: "http://localhost:3101" },
    ]);
    await page.goto("/admin/notices", { waitUntil: "domcontentloaded" });
    await expect(page.locator("html")).toHaveAttribute("lang", "bn");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expectNoRawKeys(page);
    expect(realErrors(consoleErrors), "application console errors").toEqual([]);
    await context.close();
  });

  test("admin notifications protects its page while the inbox API remains role-shared", async ({
    browser,
    page,
  }) => {
    await page.goto("/admin/notifications", {
      waitUntil: "domcontentloaded",
    });
    expect(new URL(page.url()).pathname).toBe("/login");
    expect((await page.request.get("/api/notifications")).status()).toBe(401);

    for (const role of DEMO_USERS.filter((role) => role !== "super_admin")) {
      const { context } = await apiLogin(browser, role);
      await setLocale(context, "en");
      const rolePage = await context.newPage();
      await rolePage.goto("/admin/notifications", {
        waitUntil: "domcontentloaded",
      });
      expect(new URL(rolePage.url()).pathname, `${role} page denial`).toBe(
        ROLE_HOME[role],
      );

      // Notifications are a shared authenticated API; each role's own inbox
      // page consumes this same endpoint, which scopes rows by the session user.
      expect(
        (await rolePage.request.get("/api/notifications?page_size=1")).status(),
        `${role} own-inbox API access`,
      ).toBe(200);
      await context.close();
    }
  });

  test("admin notifications renders real items, filters them, and opens complaint links in the admin scope", async ({
    browser,
  }) => {
    const { context } = await apiLogin(browser, "super_admin");
    await setLocale(context, "en");
    const page = await context.newPage();
    const customer = await apiLogin(browser, "customer");
    const branchManager = await apiLogin(browser, "branch_manager");
    const suffix = `${Date.now()}${test.info().workerIndex}`;
    const branchSubject = `Admin notification route ${suffix}`;
    const adminSubject = `Admin notification dedupe ${suffix}`;

    const branchComplaintResponse = await customer.req.post("/api/complaints", {
      data: {
        recipient_role: "branch_manager",
        category: "service",
        subject: branchSubject,
        message: "Audit-only complaint for notification routing",
      },
    });
    expect(branchComplaintResponse.status()).toBe(201);
    const branchComplaint = await branchComplaintResponse.json();

    const directAdminComplaintResponse = await customer.req.post(
      "/api/complaints",
      {
        data: {
          recipient_role: "super_admin",
          category: "service",
          subject: adminSubject,
          message: "Audit-only complaint for notification deduplication",
        },
      },
    );
    expect(directAdminComplaintResponse.status()).toBe(201);
    const directAdminComplaint = await directAdminComplaintResponse.json();

    const adminInboxResponse = await page.request.get(
      "/api/notifications?page_size=100",
    );
    expect(adminInboxResponse.status()).toBe(200);
    const adminInbox = await adminInboxResponse.json();
    const routedAdminItems = adminInbox.results.filter(
      (item: { body: string }) => item.body === branchSubject,
    );
    expect(routedAdminItems).toHaveLength(1);
    expect(routedAdminItems[0].link).toBe(
      `/complaints/${branchComplaint.id}`,
    );
    const directAdminItems = adminInbox.results.filter(
      (item: { body: string }) => item.body === adminSubject,
    );
    expect(directAdminItems).toHaveLength(1);
    expect(directAdminItems[0].link).toBe(
      `/complaints/${directAdminComplaint.id}`,
    );
    expect(
      adminInbox.results
        .filter(
          (item: { type: string; link: string | null }) =>
            item.type === "complaint" && item.link,
        )
        .every(
          (item: { link: string }) =>
            /^\/complaints\/\d+$/.test(item.link),
        ),
      "legacy complaint notification links are normalized",
    ).toBe(true);

    const branchInbox = await (
      await branchManager.req.get("/api/notifications?page_size=100")
    ).json();
    const routedBranchItems = branchInbox.results.filter(
      (item: { body: string }) => item.body === branchSubject,
    );
    expect(routedBranchItems).toHaveLength(1);
    expect(routedBranchItems[0].link).toBe(
      `/complaints/${branchComplaint.id}`,
    );

    await page.goto("/admin/notifications", { waitUntil: "networkidle" });
    await expect(
      page.getByRole("heading", { name: /^notifications$/i }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /^all$/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await page.getByRole("button", { name: /^unread$/i }).click();
    await expect(
      page.getByRole("button", { name: /^unread$/i }),
    ).toHaveAttribute("aria-pressed", "true");
    const freshItem = page.locator("main li").filter({ hasText: branchSubject });
    await expect(freshItem).toHaveCount(1);

    // Only the audit-created row is mutated: opening it marks it read and must
    // navigate to the canonical shared detail route, never a nonexistent
    // role-prefixed detail route.
    await freshItem.getByRole("button").click();
    await expect(page).toHaveURL(
      new RegExp(`/complaints/${branchComplaint.id}$`),
    );
    await expect(
      page.getByRole("heading", { name: branchSubject }),
    ).toBeVisible();

    await page.goto("/admin/notifications", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: /^read$/i }).click();
    await expect(
      page.locator("main li").filter({ hasText: branchSubject }),
    ).toHaveCount(1);

    await customer.context.close();
    await branchManager.context.close();
    await context.close();
  });

  test("admin notifications is responsive, localized, themed, and runtime-clean", async ({
    browser,
  }) => {
    const { context } = await apiLogin(browser, "super_admin");
    await setLocale(context, "en");
    await context.addCookies([
      { name: "mad_theme", value: "light", url: "http://localhost:3101" },
    ]);
    const page = await context.newPage();
    const consoleErrors = trackConsoleErrors(page);
    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 390, height: 844 },
      { width: 320, height: 800 },
    ]) {
      await page.setViewportSize(viewport);
      const response = await page.goto("/admin/notifications", {
        waitUntil: "domcontentloaded",
      });
      expect(response?.status()).toBe(200);
      await expect(page.locator("main")).toHaveCount(1);
      await expect(page.locator("h1")).toHaveCount(1);
      await expect(page).toHaveTitle(/Notifications/i);
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
        `horizontal overflow at ${viewport.width}px`,
      ).toBeLessThanOrEqual(1);
    }
    await expectNoRawKeys(page);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await setLocale(context, "bn");
    await context.addCookies([
      { name: "mad_theme", value: "dark", url: "http://localhost:3101" },
    ]);
    await page.goto("/admin/notifications", {
      waitUntil: "domcontentloaded",
    });
    await expect(page.locator("html")).toHaveAttribute("lang", "bn");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expectNoRawKeys(page);
    expect(realErrors(consoleErrors), "application console errors").toEqual([]);
    await context.close();
  });

  test("admin orders protects its page and preserves each role's API scope", async ({
    browser,
    page,
  }) => {
    await page.goto("/admin/orders", { waitUntil: "domcontentloaded" });
    expect(new URL(page.url()).pathname).toBe("/login");
    expect((await page.request.get("/api/orders")).status()).toBe(401);

    const admin = await apiLogin(browser, "super_admin");
    const adminOrders = await (
      await admin.req.get("/api/orders?page_size=100")
    ).json();

    for (const role of DEMO_USERS.filter((role) => role !== "super_admin")) {
      const { context, req } = await apiLogin(browser, role);
      await setLocale(context, "en");
      const rolePage = await context.newPage();
      await rolePage.goto("/admin/orders", { waitUntil: "domcontentloaded" });
      expect(new URL(rolePage.url()).pathname, `${role} page denial`).toBe(
        ROLE_HOME[role],
      );

      const response = await req.get("/api/orders?page_size=100");
      expect(response.status(), `${role} scoped order API`).toBe(200);
      const scoped = await response.json();
      if (role === "management" || role === "accounts") {
        expect(scoped.count, `${role} oversight scope`).toBe(adminOrders.count);
      } else if (role === "marketing") {
        expect(scoped.count, "Marketing has no order-data scope").toBe(0);
      } else {
        const me = await (await req.get("/api/auth/me")).json();
        if (role === "customer") {
          expect(
            scoped.results.every(
              (order: { customer: number }) => order.customer === me.id,
            ),
            "Customer sees only own orders",
          ).toBe(true);
        }
        if (role === "rider") {
          expect(
            scoped.results.every(
              (order: { rider: number | null }) => order.rider === me.id,
            ),
            "Rider sees only assigned orders",
          ).toBe(true);
        }
        if (role === "branch_manager") {
          const dashboard = await (
            await req.get("/api/dashboard/branch-manager")
          ).json();
          expect(
            scoped.results.every(
              (order: { branch: number }) =>
                order.branch === dashboard.branch.id,
            ),
            "Branch Manager sees only own-branch orders",
          ).toBe(true);
        }
      }

      if (role !== "customer") {
        expect(
          (
            await req.post("/api/orders", {
              data: {
                branch_id: 1,
                payment_method: "cash",
                delivery_address: "Forbidden audit order",
                items: [{ product_id: 1, quantity: 1 }],
              },
            })
          ).status(),
          `${role} order-create boundary`,
        ).toBe(403);
      }
      await context.close();
    }
    await admin.context.close();
  });

  test("admin orders renders every real order with exact details and handles malformed filters", async ({
    browser,
  }) => {
    const { context } = await apiLogin(browser, "super_admin");
    await setLocale(context, "en");
    const page = await context.newPage();

    const response = await page.request.get("/api/orders?page_size=100");
    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data.count).toBeGreaterThan(0);
    expect(data.results).toHaveLength(data.count);
    expect(new Set(data.results.map((order: { branch: number }) => order.branch)).size).toBeGreaterThan(0);

    const malformed = await page.request.get(
      "/api/orders?branch=not-a-number&page_size=100",
    );
    expect(malformed.status()).toBe(200);
    expect((await malformed.json()).count).toBe(data.count);

    const pending = await page.request.get(
      "/api/orders?status=pending&page_size=100",
    );
    expect(pending.status()).toBe(200);
    expect(
      (await pending.json()).results.every(
        (order: { status: string }) => order.status === "pending",
      ),
    ).toBe(true);

    await page.goto("/admin/orders", { waitUntil: "networkidle" });
    await expect(
      page.getByRole("heading", { name: /^orders$/i }),
    ).toBeVisible();
    await expect(page.locator("thead th")).toHaveCount(7);
    await expect(page.locator("tbody tr")).toHaveCount(data.results.length);
    for (const order of data.results as Array<{
      id: number;
      order_number: string | null;
      customer_name: string;
      branch_name: string;
      status_display: string;
      payment_method_display: string;
    }>) {
      const row = page.locator("tbody tr").filter({
        has: page.locator(`a[href="/admin/orders/${order.id}"]`),
      });
      await expect(row).toHaveCount(1);
      await expect(row).toContainText(
        order.order_number ?? `#${order.id}`,
      );
      await expect(row).toContainText(order.customer_name);
      await expect(row).toContainText(order.branch_name);
    }
    await context.close();
  });

  test("admin orders is responsive, localized, themed, and runtime-clean", async ({
    browser,
  }) => {
    const { context } = await apiLogin(browser, "super_admin");
    await setLocale(context, "en");
    await context.addCookies([
      { name: "mad_theme", value: "light", url: "http://localhost:3101" },
    ]);
    const page = await context.newPage();
    const consoleErrors = trackConsoleErrors(page);
    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 390, height: 844 },
      { width: 320, height: 800 },
    ]) {
      await page.setViewportSize(viewport);
      const response = await page.goto("/admin/orders", {
        waitUntil: "domcontentloaded",
      });
      expect(response?.status()).toBe(200);
      await expect(page.locator("main")).toHaveCount(1);
      await expect(page.locator("h1")).toHaveCount(1);
      await expect(page).toHaveTitle(/Orders/i);
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
        `horizontal overflow at ${viewport.width}px`,
      ).toBeLessThanOrEqual(1);
    }
    await expectNoRawKeys(page);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await setLocale(context, "bn");
    await context.addCookies([
      { name: "mad_theme", value: "dark", url: "http://localhost:3101" },
    ]);
    await page.goto("/admin/orders", { waitUntil: "domcontentloaded" });
    await expect(page.locator("html")).toHaveAttribute("lang", "bn");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expectNoRawKeys(page);
    expect(realErrors(consoleErrors), "application console errors").toEqual([]);
    await context.close();
  });

  test("admin order detail protects its page and preserves shared API record scopes", async ({
    browser,
    page,
  }) => {
    const admin = await apiLogin(browser, "super_admin");
    const allOrders = await (
      await admin.req.get("/api/orders?page_size=100")
    ).json();
    const orderId = allOrders.results[0].id as number;

    await page.goto(`/admin/orders/${orderId}`, {
      waitUntil: "domcontentloaded",
    });
    expect(new URL(page.url()).pathname).toBe("/login");
    expect((await page.request.get(`/api/orders/${orderId}`)).status()).toBe(
      401,
    );

    for (const role of DEMO_USERS.filter((role) => role !== "super_admin")) {
      const { context, req } = await apiLogin(browser, role);
      await setLocale(context, "en");
      const rolePage = await context.newPage();
      await rolePage.goto(`/admin/orders/${orderId}`, {
        waitUntil: "domcontentloaded",
      });
      expect(new URL(rolePage.url()).pathname, `${role} page denial`).toBe(
        ROLE_HOME[role],
      );

      const scopedListResponse = await req.get("/api/orders?page_size=100");
      expect(scopedListResponse.status()).toBe(200);
      const scopedList = await scopedListResponse.json();
      const canRead = scopedList.results.some(
        (order: { id: number }) => order.id === orderId,
      );
      const detailStatus = (await req.get(`/api/orders/${orderId}`)).status();
      expect(detailStatus, `${role} detail matches list scope`).toBe(
        canRead ? 200 : role === "marketing" ? 403 : 404,
      );
      await context.close();
    }
    await admin.context.close();
  });

  test("admin order detail renders a complete real record and controlled not-found states", async ({
    browser,
  }) => {
    const { context } = await apiLogin(browser, "super_admin");
    await setLocale(context, "en");
    const page = await context.newPage();
    const list = await (
      await page.request.get("/api/orders?page_size=100")
    ).json();
    const summary = list.results.find(
      (order: { status: string }) => order.status !== "cancelled",
    );
    expect(summary).toBeTruthy();

    const detailResponse = await page.request.get(`/api/orders/${summary.id}`);
    expect(detailResponse.status()).toBe(200);
    const order = await detailResponse.json();
    expect(order.items.length).toBeGreaterThan(0);

    const malformed = await page.request.get("/api/orders/not-a-number");
    expect(malformed.status()).toBe(404);
    const missing = await page.request.get("/api/orders/999999999");
    expect(missing.status()).toBe(404);

    const response = await page.goto(`/admin/orders/${order.id}`, {
      waitUntil: "networkidle",
    });
    expect(response?.status()).toBe(200);
    await expect(
      page.getByRole("heading", { name: /order detail/i, level: 1 }),
    ).toBeVisible();
    await expect(page.getByTestId("order-number")).toHaveText(
      order.order_number,
    );
    await expect(
      page.getByRole("link", { name: /back to orders/i }),
    ).toHaveAttribute("href", "/admin/orders");
    await expect(page.locator("ol li")).toHaveCount(7);
    await expect(
      page
        .locator("main")
        .getByText(order.customer_name, { exact: true })
        .last(),
    ).toBeVisible();
    await expect(page.getByText(order.delivery_address, { exact: true })).toBeVisible();
    await expect(page.getByText(order.branch_name).first()).toBeVisible();
    for (const item of order.items as Array<{ product_name: string }>) {
      await expect(
        page.getByText(item.product_name, { exact: true }).first(),
      ).toBeVisible();
    }
    await expect(
      page.getByRole("button", { name: /accept|prepare|ready|cancel|deliver/i }),
      "Super Admin detail remains read-only",
    ).toHaveCount(0);

    await page.goto("/admin/orders/999999999", {
      waitUntil: "domcontentloaded",
    });
    await expect(
      page.getByRole("heading", { name: /page not found/i }),
    ).toBeVisible();
    await context.close();
  });

  test("admin order detail is responsive, localized, themed, and runtime-clean", async ({
    browser,
  }) => {
    const { context } = await apiLogin(browser, "super_admin");
    await setLocale(context, "en");
    await context.addCookies([
      { name: "mad_theme", value: "light", url: "http://localhost:3101" },
    ]);
    const page = await context.newPage();
    const consoleErrors = trackConsoleErrors(page);
    const list = await (
      await page.request.get("/api/orders?page_size=100")
    ).json();
    const orderId = list.results.find(
      (order: { status: string }) => order.status !== "cancelled",
    ).id;

    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 390, height: 844 },
      { width: 320, height: 800 },
    ]) {
      await page.setViewportSize(viewport);
      const response = await page.goto(`/admin/orders/${orderId}`, {
        waitUntil: "domcontentloaded",
      });
      expect(response?.status()).toBe(200);
      await expect(page.locator("main")).toHaveCount(1);
      await expect(page.locator("h1")).toHaveCount(1);
      await expect(page).toHaveTitle(/Order Detail/i);
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
        `horizontal overflow at ${viewport.width}px`,
      ).toBeLessThanOrEqual(1);
    }
    const brokenImages = await page.locator("img").evaluateAll((images) =>
      images
        .filter(
          (image) =>
            image instanceof HTMLImageElement &&
            image.complete &&
            image.naturalWidth === 0,
        )
        .map((image) => image.getAttribute("src") ?? "?"),
    );
    expect(brokenImages).toEqual([]);
    await expectNoRawKeys(page);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await setLocale(context, "bn");
    await context.addCookies([
      { name: "mad_theme", value: "dark", url: "http://localhost:3101" },
    ]);
    await page.goto(`/admin/orders/${orderId}`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.locator("html")).toHaveAttribute("lang", "bn");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expectNoRawKeys(page);
    expect(realErrors(consoleErrors), "application console errors").toEqual([]);
    await context.close();
  });

  test("admin product-family pages and governance mutations are Super Admin-only", async ({
    browser,
    page,
  }) => {
    const admin = await apiLogin(browser, "super_admin");
    const products = await (
      await admin.req.get("/api/products?page_size=100")
    ).json();
    const productId = products.results[0].id as number;
    await admin.context.close();

    const paths = [
      "/admin/products",
      "/admin/products/create",
      `/admin/products/${productId}/edit`,
      "/admin/products/deactivated",
    ];
    for (const path of paths) {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      expect(new URL(page.url()).pathname, `${path} anonymous denial`).toBe(
        "/login",
      );
    }
    expect((await page.request.get("/api/products")).status()).toBe(401);

    for (const role of DEMO_USERS.filter((role) => role !== "super_admin")) {
      const { context, req } = await apiLogin(browser, role);
      await setLocale(context, "en");
      const rolePage = await context.newPage();
      for (const path of paths) {
        await rolePage.goto(path, { waitUntil: "domcontentloaded" });
        expect(
          new URL(rolePage.url()).pathname,
          `${role} denial for ${path}`,
        ).toBe(ROLE_HOME[role]);
      }
      expect(
        (await req.post(`/api/products/${productId}/hold`)).status(),
        `${role} hold denial`,
      ).toBe(403);
      expect(
        (await req.post(`/api/products/${productId}/unhold`)).status(),
        `${role} unhold denial`,
      ).toBe(403);
      expect(
        (await req.delete(`/api/products/${productId}`)).status(),
        `${role} delete denial`,
      ).toBe(403);
      await context.close();
    }
  });

  test("admin product list and deactivated list render exact real data without destructive actions", async ({
    browser,
  }) => {
    const { context } = await apiLogin(browser, "super_admin");
    await setLocale(context, "en");
    const page = await context.newPage();
    const allResponse = await page.request.get("/api/products?page_size=100");
    expect(allResponse.status()).toBe(200);
    const all = await allResponse.json();
    expect(all.count).toBeGreaterThan(0);
    expect(all.results).toHaveLength(all.count);

    const firstPage = await page.request.get("/api/products?page_size=1");
    expect(firstPage.status()).toBe(200);
    expect((await firstPage.json()).results).toHaveLength(1);

    const malformed = await page.request.get(
      "/api/products?branch_id=bad&category=invalid&page_size=100",
    );
    expect(malformed.status()).toBe(200);
    expect((await malformed.json()).count).toBe(all.count);

    await page.goto("/admin/products", { waitUntil: "networkidle" });
    await expect(
      page.getByRole("heading", { name: /products/i, level: 1 }),
    ).toBeVisible();
    // The list is SERVER-PAGINATED at 10 rows. It previously rendered every
    // product in one page, which is what this assertion used to check; the
    // contract now is "one page of at most 10, and the true total is reported".
    const PAGE_SIZE = 10;
    const table = page.getByTestId("responsive-table");
    const rows = table.locator("tbody tr");
    await expect(rows).toHaveCount(Math.min(PAGE_SIZE, all.results.length));
    await expect(page.getByText(String(all.count), { exact: false }).first()).toBeVisible();
    await expect(
      page.getByRole("link", { name: /deactivated list/i }),
    ).toHaveAttribute("href", "/admin/products/deactivated");
    await expect(
      page.getByRole("link", { name: /add product/i }),
    ).toHaveAttribute("href", "/admin/products/create");

    // Every product is still REACHABLE and still carries its branch + edit link
    // — now found through the server-side search rather than one giant page.
    for (const product of (all.results as Array<{
      id: number;
      name: string;
      branch_name: string;
    }>).slice(0, 5)) {
      await page.goto(`/admin/products?search=${encodeURIComponent(product.name)}`, {
        waitUntil: "domcontentloaded",
      });
      const row = table.locator("tbody tr").filter({ hasText: product.name });
      await expect(row).toHaveCount(1);
      await expect(row).toContainText(product.branch_name);
      // Edit now lives inside the row's compact action menu.
      await row.getByTestId(`product-actions-${product.id}`).click();
      await expect(
        table.getByTestId(`product-edit-${product.id}`),
      ).toHaveAttribute("href", `/admin/products/${product.id}/edit`);
    }

    await page.goto("/admin/products", { waitUntil: "domcontentloaded" });
    const firstName = (await rows.first().locator("td").first().innerText()).trim();
    const firstId = Number(
      (await rows.first().locator("[data-testid^=\"product-actions-\"]").getAttribute("data-testid"))!
        .replace("product-actions-", ""),
    );
    await table.getByTestId(`product-actions-${firstId}`).click();
    await table.getByTestId(`product-delete-${firstId}`).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(firstName);
    await dialog.getByRole("button", { name: /^cancel$/i }).click();
    await expect(rows).toHaveCount(Math.min(PAGE_SIZE, all.results.length));

    const deactivated = all.results.filter(
      (product: { is_available: boolean; held_by_admin: boolean }) =>
        !product.is_available || product.held_by_admin,
    );
    await page.goto("/admin/products/deactivated", {
      waitUntil: "domcontentloaded",
    });
    await expect(
      page.getByRole("heading", { name: /deactivated products/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /all products/i }),
    ).toHaveAttribute("href", "/admin/products");
    // This list is server-paginated too, and it deliberately ALSO carries
    // soft-deleted products (the admin has to be able to find one after
    // deleting it), which the /api/products list excludes. So the contract is
    // "each expected product is findable here", not a single global count.
    const deactivatedTable = page.getByTestId("responsive-table");
    if (deactivated.length > 0) {
      const rows = await deactivatedTable.locator("tbody tr").count();
      expect(rows, "one page of at most 10").toBeGreaterThan(0);
      expect(rows).toBeLessThanOrEqual(10);
      for (const product of deactivated.slice(0, 3) as Array<{ name: string }>) {
        await page.goto(
          `/admin/products/deactivated?search=${encodeURIComponent(product.name)}`,
          { waitUntil: "domcontentloaded" },
        );
        await expect(
          deactivatedTable.locator("tbody tr").filter({ hasText: product.name }),
        ).toHaveCount(1);
      }
    } else {
      await expect(deactivatedTable.locator("tbody tr")).toHaveCount(0);
      await expect(page.getByText(/no deactivated products/i)).toBeVisible();
    }
    await context.close();
  });

  test("admin creates a valid additive product through the full form", async ({
    browser,
  }) => {
    const { context } = await apiLogin(browser, "super_admin");
    await setLocale(context, "en");
    const page = await context.newPage();
    const name = `Audit Product ${Date.now()}${test.info().workerIndex}`;
    const branches = await (
      await page.request.get("/api/branches?page_size=100")
    ).json();
    const branch =
      branches.results.find(
        (item: { name: string }) => item.name === "Cheez Gulshan",
      ) ?? branches.results[0];

    await page.goto("/admin/products/create", {
      waitUntil: "domcontentloaded",
    });
    await expect(
      page.getByRole("heading", { name: /new product/i }),
    ).toBeVisible();
    await page.getByLabel(/^Branch/i).selectOption(String(branch.id));
    await page.getByLabel(/^Product name/i).fill(name);
    await page.getByLabel(/^Category/i).selectOption({ index: 1 });
    await page.getByTestId("variation-name").fill("Regular");
    await page.getByTestId("variation-price").fill("321");
    await page.getByRole("button", { name: /add product/i }).click();
    await expect(page).toHaveURL(/\/admin\/products$/);
    // Search for it: the list is paginated at 10 and sorted by name, so a new
    // product is not necessarily on page 1. Scoped to the table view because
    // ResponsiveDataView also renders a (CSS-hidden) mobile tree.
    await page.goto(`/admin/products?search=${encodeURIComponent(name)}`, {
      waitUntil: "domcontentloaded",
    });
    await expect(
      page.getByTestId("responsive-table").getByText(name, { exact: true }),
    ).toBeVisible();

    const createdList = await (
      await page.request.get(
        `/api/products?branch_id=${branch.id}&page_size=100`,
      )
    ).json();
    const created = createdList.results.find(
      (product: { name: string }) => product.name === name,
    );
    expect(created).toBeTruthy();
    expect(created.variations).toHaveLength(1);
    expect(created.variations[0].price).toBe("321.00");
    expect(created.variations[0].is_default).toBe(true);
    await context.close();
  });

  test("admin edits an additive product and direct-ID reads enforce product visibility", async ({
    browser,
  }) => {
    const { context } = await apiLogin(browser, "super_admin");
    await setLocale(context, "en");
    const page = await context.newPage();
    const branches = await (
      await page.request.get("/api/branches?page_size=100")
    ).json();
    const foreignBranch =
      branches.results.find(
        (branch: { name: string }) => branch.name === "Cheez Gulshan",
      ) ?? branches.results[0];
    const categories = await (
      await page.request.get(
        `/api/categories?branch_id=${foreignBranch.id}&page_size=100`,
      )
    ).json();
    const originalName = `Audit Edit Product ${Date.now()}${test.info().workerIndex}`;
    const create = await page.request.post("/api/products", {
      multipart: {
        branch_id: String(foreignBranch.id),
        name: originalName,
        category: String(categories.results[0].id),
        brand: "cheez",
        variation_type: "THICK",
        is_available: "false",
        variations: JSON.stringify([
          {
            name: "Regular",
            price: 432,
            isDefault: true,
            isEnabled: true,
          },
        ]),
      },
    });
    expect(create.status()).toBe(201);
    const product = await create.json();

    const malformed = await page.request.get("/api/products/not-a-number");
    expect(malformed.status()).toBe(404);

    const customer = await apiLogin(browser, "customer");
    const customerList = await (
      await customer.req.get(
        `/api/products?branch_id=${foreignBranch.id}&page_size=100`,
      )
    ).json();
    expect(
      customerList.results.some(
        (item: { id: number }) => item.id === product.id,
      ),
      "unavailable product hidden from customer list",
    ).toBe(false);
    expect(
      (await customer.req.get(`/api/products/${product.id}`)).status(),
      "direct ID cannot bypass customer product visibility",
    ).toBe(404);
    await customer.context.close();

    const branchManager = await apiLogin(browser, "branch_manager");
    expect(
      (await branchManager.req.get(`/api/products/${product.id}`)).status(),
      "Branch Manager cannot read a foreign-branch product directly",
    ).toBe(403);
    await branchManager.context.close();

    const editedName = `${originalName} Edited`;
    await page.goto(`/admin/products/${product.id}/edit`, {
      waitUntil: "domcontentloaded",
    });
    await expect(
      page.getByRole("heading", { name: /edit product/i }),
    ).toBeVisible();
    await expect(page.getByLabel(/^Branch/i)).toBeDisabled();
    await page.getByLabel(/^Product name/i).fill(editedName);
    await page.getByLabel(/^Description/i).fill("Audit-only edited description");
    await page.getByRole("button", { name: /^save changes$/i }).click();
    await expect(page).toHaveURL(/\/admin\/products$/);
    const updated = await (
      await page.request.get(`/api/products/${product.id}`)
    ).json();
    expect(updated.name).toBe(editedName);
    expect(updated.description).toBe("Audit-only edited description");
    expect(updated.is_available).toBe(false);

    await page.goto("/admin/products/not-a-number/edit", {
      waitUntil: "domcontentloaded",
    });
    await expect(
      page.getByRole("heading", { name: /page not found/i }),
    ).toBeVisible();
    await context.close();
  });

  test("admin product family is responsive, localized, themed, and runtime-clean", async ({
    browser,
  }) => {
    const { context } = await apiLogin(browser, "super_admin");
    await setLocale(context, "en");
    await context.addCookies([
      { name: "mad_theme", value: "light", url: "http://localhost:3101" },
    ]);
    const page = await context.newPage();
    const consoleErrors = trackConsoleErrors(page);
    const products = await (
      await page.request.get("/api/products?page_size=100")
    ).json();
    const paths = [
      "/admin/products",
      "/admin/products/create",
      `/admin/products/${products.results[0].id}/edit`,
      "/admin/products/deactivated",
    ];
    for (const path of paths) {
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
    for (const path of paths) {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      await expect(page.locator("html")).toHaveAttribute("lang", "bn");
      await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
      await expectNoRawKeys(page);
    }
    expect(realErrors(consoleErrors), "application console errors").toEqual([]);
    await context.close();
  });

  test("admin report-family pages and dashboard API are Super Admin-only", async ({
    browser,
    page,
  }) => {
    const paths = [
      "/admin/reports",
      "/admin/reports/attendance",
      "/admin/reports/cancelled-orders",
      "/admin/reports/orders",
      "/admin/reports/sales",
    ];
    for (const path of paths) {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      expect(new URL(page.url()).pathname, `${path} anonymous denial`).toBe(
        "/login",
      );
    }
    expect(
      (await page.request.get("/api/dashboard/super-admin")).status(),
    ).toBe(401);

    for (const role of DEMO_USERS.filter((role) => role !== "super_admin")) {
      const { context } = await apiLogin(browser, role);
      await setLocale(context, "en");
      const rolePage = await context.newPage();
      for (const path of paths) {
        await rolePage.goto(path, { waitUntil: "domcontentloaded" });
        expect(
          new URL(rolePage.url()).pathname,
          `${role} denial for ${path}`,
        ).toBe(ROLE_HOME[role]);
      }
      expect(
        (await rolePage.request.get("/api/dashboard/super-admin")).status(),
        `${role} report data denial`,
      ).toBe(403);
      await context.close();
    }
  });

  test("admin report family renders exact live aggregates, ranges, and empty states", async ({
    browser,
  }) => {
    const { context } = await apiLogin(browser, "super_admin");
    await setLocale(context, "en");
    const page = await context.newPage();
    const dashboard = await (
      await page.request.get("/api/dashboard/super-admin")
    ).json();
    const orders = await (
      await page.request.get("/api/orders?page_size=100")
    ).json();

    await page.goto("/admin/reports", { waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("heading", { name: /^reports$/i }),
    ).toBeVisible();
    for (const href of [
      "/admin/reports/sales",
      "/admin/reports/orders",
      "/admin/reports/cancelled-orders",
      "/admin/reports/attendance",
    ]) {
      await expect(page.locator(`main a[href="${href}"]`)).toBeVisible();
    }
    await expect(page.locator(".kpi-accent")).toHaveCount(4);
    if (dashboard.branch_performance.length > 0) {
      await expect(page.locator("tbody tr")).toHaveCount(
        dashboard.branch_performance.length,
      );
      for (const branch of dashboard.branch_performance as Array<{
        branch__name: string;
      }>) {
        await expect(page.getByText(branch.branch__name, { exact: true })).toBeVisible();
      }
    }

    await page.goto("/admin/reports/orders", {
      waitUntil: "domcontentloaded",
    });
    await expect(
      page.getByRole("heading", { name: /today's order report/i }),
    ).toBeVisible();
    await expect(page.locator(".kpi-accent")).toHaveCount(4);
    await expect(page.locator("tbody tr")).toHaveCount(orders.results.length);

    const cancelled = orders.results.filter(
      (order: { status: string }) => order.status === "cancelled",
    );
    await page.goto("/admin/reports/cancelled-orders?range=month", {
      waitUntil: "domcontentloaded",
    });
    for (const range of ["today", "week", "month"]) {
      await expect(
        page.locator(
          `a[href="/admin/reports/cancelled-orders?range=${range}"]`,
        ),
      ).toBeVisible();
    }
    await expect(page.locator("tbody tr")).toHaveCount(cancelled.length);

    const delivered = orders.results.filter(
      (order: { status: string }) => order.status === "delivered",
    );
    await page.goto("/admin/reports/sales?range=month", {
      waitUntil: "domcontentloaded",
    });
    await expect(
      page.getByRole("heading", { name: /sales report/i }),
    ).toBeVisible();
    await expect(page.locator(".kpi-accent")).toHaveCount(3);
    for (const range of ["today", "week", "month"]) {
      await expect(
        page.locator(`a[href="/admin/reports/sales?range=${range}"]`),
      ).toBeVisible();
    }
    if (delivered.length > 0) {
      for (const branchName of new Set(
        delivered.map(
          (order: { branch_name: string }) => order.branch_name,
        ),
      )) {
        await expect(
          page.getByText(branchName as string, { exact: true }),
        ).toBeVisible();
      }
    }

    await page.goto("/admin/reports/attendance", {
      waitUntil: "domcontentloaded",
    });
    await expect(
      page.getByRole("heading", { name: /attendance report/i }),
    ).toBeVisible();
    await expect(page.locator("tbody tr")).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: /^no data yet$/i }),
    ).toHaveCount(2);
    await context.close();
  });

  test("admin report family is responsive, localized, themed, and runtime-clean", async ({
    browser,
  }) => {
    const { context } = await apiLogin(browser, "super_admin");
    await setLocale(context, "en");
    await context.addCookies([
      { name: "mad_theme", value: "light", url: "http://localhost:3101" },
    ]);
    const page = await context.newPage();
    const consoleErrors = trackConsoleErrors(page);
    const paths = [
      "/admin/reports",
      "/admin/reports/attendance",
      "/admin/reports/cancelled-orders?range=week",
      "/admin/reports/orders",
      "/admin/reports/sales?range=week",
    ];
    for (const path of paths) {
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
    for (const path of paths) {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      await expect(page.locator("html")).toHaveAttribute("lang", "bn");
      await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
      await expectNoRawKeys(page);
    }
    expect(realErrors(consoleErrors), "application console errors").toEqual([]);
    await context.close();
  });

  test("admin rewards page and every reward-governance API are Super Admin-only", async ({
    browser,
    page,
  }) => {
    await page.goto("/admin/rewards", { waitUntil: "domcontentloaded" });
    expect(new URL(page.url()).pathname).toBe("/login");
    expect((await page.request.get("/api/admin/rewards")).status()).toBe(401);
    expect((await page.request.get("/api/admin/reward-rules")).status()).toBe(
      401,
    );

    for (const role of DEMO_USERS.filter((role) => role !== "super_admin")) {
      const { context, req } = await apiLogin(browser, role);
      await setLocale(context, "en");
      const rolePage = await context.newPage();
      await rolePage.goto("/admin/rewards", {
        waitUntil: "domcontentloaded",
      });
      expect(new URL(rolePage.url()).pathname, `${role} page denial`).toBe(
        ROLE_HOME[role],
      );
      expect(
        (await req.get("/api/admin/rewards")).status(),
        `${role} config denial`,
      ).toBe(403);
      expect(
        (await req.get("/api/admin/reward-rules")).status(),
        `${role} rule-list denial`,
      ).toBe(403);
      expect(
        (
          await req.post("/api/admin/rewards/status", {
            data: { is_active: false },
          })
        ).status(),
        `${role} program-status denial`,
      ).toBe(403);
      await context.close();
    }
  });

  test("admin rewards renders real config and rules with accessible, cancel-safe controls", async ({
    browser,
  }) => {
    const { context } = await apiLogin(browser, "super_admin");
    await setLocale(context, "en");
    const page = await context.newPage();
    const config = await (
      await page.request.get("/api/admin/rewards")
    ).json();
    const rules = await (
      await page.request.get("/api/admin/reward-rules")
    ).json();

    const malformed = await page.request.get(
      "/api/admin/reward-rules/not-a-number",
    );
    expect(malformed.status()).toBe(404);

    await page.goto("/admin/rewards", { waitUntil: "networkidle" });
    await expect(
      page.getByRole("heading", { name: /reward settings/i }),
    ).toBeVisible();
    await expect(page.getByTestId("reward-program-toggle")).toBeVisible();
    await expect(page.getByLabel(/value per coin/i)).toHaveValue(
      config.coin_value_tk,
    );
    await expect(page.getByLabel(/minimum.*redeem/i)).toHaveValue(
      String(config.min_redeem_coins),
    );
    for (const rule of config.rules as Array<{ key: string; coins: number }>) {
      const input = page.locator(`input[data-reward-key="${rule.key}"]`);
      await expect(input).toHaveAccessibleName(/\S+/);
      await expect(input).toHaveValue(String(rule.coins));
    }
    await expect(page.locator('[data-testid^="reward-rule-"]')).not.toHaveCount(
      0,
    );
    for (const rule of rules.results as Array<{ id: number; name: string }>) {
      await expect(page.getByTestId(`reward-rule-${rule.id}`)).toContainText(
        rule.name,
      );
    }

    if (config.program_active) {
      await page.getByTestId("reward-deactivate").click();
      const pauseDialog = page.getByRole("dialog", {
        name: /pause the reward programme/i,
      });
      await expect(pauseDialog).toBeVisible();
      await pauseDialog.getByRole("button", { name: /^cancel$/i }).click();
      await expect(page.getByTestId("reward-status-active")).toBeVisible();
    }

    await page.getByTestId("reward-rule-new").click();
    const form = page.getByTestId("reward-rule-form");
    await expect(form).toBeVisible();
    await expect(form.getByTestId("reward-rule-name")).toHaveAccessibleName(
      /rule name/i,
    );
    await form.getByRole("button", { name: /^cancel$/i }).click();
    await expect(form).toHaveCount(0);

    if (rules.results.length > 0) {
      const first = rules.results[0];
      await page.getByTestId(`reward-rule-delete-${first.id}`).click();
      const deleteDialog = page.getByRole("dialog", {
        name: /delete reward rule/i,
      });
      await expect(deleteDialog).toBeVisible();
      await deleteDialog.getByRole("button", { name: /^cancel$/i }).click();
      await expect(page.getByTestId(`reward-rule-${first.id}`)).toBeVisible();
    }
    await context.close();
  });

  test("admin rewards is responsive, localized, themed, and runtime-clean", async ({
    browser,
  }) => {
    const { context } = await apiLogin(browser, "super_admin");
    await setLocale(context, "en");
    await context.addCookies([
      { name: "mad_theme", value: "light", url: "http://localhost:3101" },
    ]);
    const page = await context.newPage();
    const consoleErrors = trackConsoleErrors(page);
    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 390, height: 844 },
      { width: 320, height: 800 },
    ]) {
      await page.setViewportSize(viewport);
      const response = await page.goto("/admin/rewards", {
        waitUntil: "domcontentloaded",
      });
      expect(response?.status()).toBe(200);
      await expect(page.locator("main")).toHaveCount(1);
      await expect(page.locator("h1")).toHaveCount(1);
      await expect(page).toHaveTitle(/Reward Settings/i);
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
        `horizontal overflow at ${viewport.width}px`,
      ).toBeLessThanOrEqual(1);
    }
    await expectNoRawKeys(page);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await setLocale(context, "bn");
    await context.addCookies([
      { name: "mad_theme", value: "dark", url: "http://localhost:3101" },
    ]);
    await page.goto("/admin/rewards", { waitUntil: "domcontentloaded" });
    await expect(page.locator("html")).toHaveAttribute("lang", "bn");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expectNoRawKeys(page);
    expect(realErrors(consoleErrors), "application console errors").toEqual([]);
    await context.close();
  });

  test("admin settings and staff pages enforce Super Admin boundaries", async ({
    browser,
    page,
  }) => {
    const paths = [
      "/admin/settings",
      "/admin/settings/delivery-fees",
      "/admin/staff",
    ];
    for (const path of paths) {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      expect(new URL(page.url()).pathname, `${path} anonymous denial`).toBe(
        "/login",
      );
    }
    for (const endpoint of [
      "/api/admin/settings/logo",
      "/api/admin/settings/delivery-fees",
    ]) {
      expect((await page.request.get(endpoint)).status()).toBe(401);
    }

    for (const role of DEMO_USERS.filter((role) => role !== "super_admin")) {
      const { context, req } = await apiLogin(browser, role);
      await setLocale(context, "en");
      const rolePage = await context.newPage();
      for (const path of paths) {
        await rolePage.goto(path, { waitUntil: "domcontentloaded" });
        expect(
          new URL(rolePage.url()).pathname,
          `${role} denial for ${path}`,
        ).toBe(ROLE_HOME[role]);
      }
      for (const endpoint of [
        "/api/admin/settings/logo",
        "/api/admin/settings/delivery-fees",
      ]) {
        expect(
          (await req.get(endpoint)).status(),
          `${role} denial for ${endpoint}`,
        ).toBe(403);
      }
      await context.close();
    }
  });

  test("admin settings and staff render exact live data with accessible, mutation-safe controls", async ({
    browser,
  }) => {
    const { context } = await apiLogin(browser, "super_admin");
    await setLocale(context, "en");
    const page = await context.newPage();
    const fee = await (
      await page.request.get("/api/admin/settings/delivery-fees")
    ).json();
    const earnings = await (
      await page.request.get("/api/accounts/rider-earnings?page_size=100")
    ).json();
    const users = await (
      await page.request.get("/api/auth/users?page_size=100")
    ).json();
    const expectedStaff = users.results.filter(
      (user: { role: string }) =>
        !["super_admin", "customer"].includes(user.role),
    );

    await page.goto("/admin/settings", { waitUntil: "domcontentloaded" });
    for (const href of [
      "/profile",
      "/change-password",
      "/admin/settings/delivery-fees",
    ]) {
      await expect(page.locator(`main a[href="${href}"]`)).toBeVisible();
    }
    const logoInput = page.getByLabel(/logo image/i);
    await expect(logoInput).toHaveAttribute(
      "accept",
      "image/png,image/jpeg,image/webp,image/avif",
    );
    await page.getByRole("button", { name: /upload logo/i }).click();
    await expect(page.getByText(/select an image first/i)).toBeVisible();
    const removeLogo = page.getByRole("button", { name: /^remove$/i });
    if (await removeLogo.count()) {
      await removeLogo.click();
      const dialog = page.getByRole("dialog", { name: /remove.*logo/i });
      await expect(dialog).toBeVisible();
      await dialog.getByRole("button", { name: /^cancel$/i }).click();
      await expect(page.getByAltText(/current logo/i)).toBeVisible();
    }

    await page.goto("/admin/settings/delivery-fees", {
      waitUntil: "domcontentloaded",
    });
    const commission = page.getByLabel(/commission per delivery/i);
    await expect(commission).toHaveValue(fee.commission_per_delivery);
    await expect(page.locator(".kpi-accent")).toHaveCount(3);
    await expect(page.locator("main li")).toHaveCount(earnings.results.length);
    await commission.fill("-1");
    await page.getByRole("button", { name: /^save$/i }).click();
    await expect(page.getByText(/enter a valid amount/i)).toBeVisible();
    const feeAfterInvalidSubmit = await page.request.get(
      "/api/admin/settings/delivery-fees",
    );
    expect(feeAfterInvalidSubmit.status()).toBe(200);
    expect(
      (await feeAfterInvalidSubmit.json()).commission_per_delivery,
    ).toBe(fee.commission_per_delivery);

    await page.goto("/admin/staff", { waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("heading", { name: /staff directory/i }),
    ).toBeVisible();
    await expect(page.locator("tbody tr")).toHaveCount(expectedStaff.length);
    for (const user of expectedStaff as Array<{
      username: string;
      email: string;
    }>) {
      const row = page.locator("tbody tr", {
        hasText: `@${user.username}`,
      });
      await expect(row).toHaveCount(1);
      await expect(row).toContainText(user.email);
    }
    await context.close();
  });

  test("admin settings and staff are responsive, localized, themed, and runtime-clean", async ({
    browser,
  }) => {
    const { context } = await apiLogin(browser, "super_admin");
    await setLocale(context, "en");
    await context.addCookies([
      { name: "mad_theme", value: "light", url: "http://localhost:3101" },
    ]);
    const page = await context.newPage();
    const consoleErrors = trackConsoleErrors(page);
    const paths = [
      "/admin/settings",
      "/admin/settings/delivery-fees",
      "/admin/staff",
    ];
    for (const path of paths) {
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
    for (const path of paths) {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      await expect(page.locator("html")).toHaveAttribute("lang", "bn");
      await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
      await expectNoRawKeys(page);
    }
    expect(realErrors(consoleErrors), "application console errors").toEqual([]);
    await context.close();
  });
});
