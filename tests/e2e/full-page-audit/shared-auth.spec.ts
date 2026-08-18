import { expect, test } from "@playwright/test";

import {
  apiLogin,
  DEMO_USERS,
  expectNoRawKeys,
  PASSWORD,
  realErrors,
  setLocale,
  trackConsoleErrors,
} from "../helpers";

test.describe("Full page audit — shared authenticated pages", () => {
  test("change-password denies anonymous page and API access", async ({
    page,
  }) => {
    const response = await page.goto("/change-password", {
      waitUntil: "domcontentloaded",
    });
    expect(response?.status()).toBe(200);
    expect(new URL(page.url()).pathname).toBe("/login");

    const apiResponse = await page.request.post("/api/auth/change-password", {
      data: {
        old_password: PASSWORD,
        new_password: "Audit12345@##",
      },
    });
    expect(apiResponse.status()).toBe(401);
  });

  test("change-password is available to every authenticated role", async ({
    browser,
  }) => {
    for (const role of DEMO_USERS) {
      const { context } = await apiLogin(browser, role);
      const page = await context.newPage();
      const consoleErrors = trackConsoleErrors(page);

      const response = await page.goto("/change-password", {
        waitUntil: "domcontentloaded",
      });
      expect(response?.status(), `${role} page response`).toBe(200);
      expect(new URL(page.url()).pathname, `${role} final URL`).toBe(
        "/change-password",
      );
      await expect(page.getByTestId("dashboard-sidebar")).toBeVisible();
      await expect(page.getByTestId("dashboard-topbar")).toBeVisible();
      await expect(page.locator("main")).toHaveCount(1);
      await expect(page.locator("h1")).toHaveCount(1);
      await expect(page.locator('input[name="old_password"]')).toBeVisible();
      await expect(page.locator('input[name="new_password"]')).toBeVisible();
      await expect(page.locator('input[name="confirm_password"]')).toBeVisible();
      await expectNoRawKeys(page);
      expect(realErrors(consoleErrors), `${role} console errors`).toEqual([]);

      await context.close();
    }
  });

  test("change-password is responsive and changes an audit-only customer's password", async ({
    browser,
    request,
  }) => {
    const unique = Date.now();
    const username = `audit_password_${unique}`;
    const suffix = String(unique).slice(-8);
    const registration = await request.post("/api/auth/register/customer", {
      data: {
        first_name: "Audit",
        last_name: "Password",
        username,
        phone: `018${suffix}`,
        email: `${username}@example.com`,
        password: PASSWORD,
        password_confirm: PASSWORD,
      },
    });
    expect(registration.status()).toBe(201);

    const { context } = await apiLogin(browser, username);
    await setLocale(context, "en");
    const page = await context.newPage();
    const consoleErrors = trackConsoleErrors(page);
    const pageErrors: string[] = [];
    const failedRequests: string[] = [];
    const completedServerActions: string[] = [];
    const unexpectedResponses: string[] = [];

    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("requestfailed", (failedRequest) => {
      const requestUrl = new URL(failedRequest.url());
      const errorText = failedRequest.failure()?.errorText ?? "";
      if (
        requestUrl.origin === new URL(page.url()).origin &&
        failedRequest.method() === "POST" &&
        failedRequest.resourceType() === "fetch" &&
        Boolean(failedRequest.headers()["next-action"]) &&
        errorText === "net::ERR_ABORTED"
      ) {
        completedServerActions.push(failedRequest.url());
        return;
      }
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
      { width: 320, height: 568 },
    ]) {
      await page.setViewportSize(viewport);
      const response = await page.goto("/change-password", {
        waitUntil: "domcontentloaded",
      });
      expect(response?.status()).toBe(200);
      await expect(page).toHaveTitle(/Change Password/i);
      const overflow = await page.evaluate(() => {
        const clientWidth = document.documentElement.clientWidth;
        return {
          delta: document.documentElement.scrollWidth - clientWidth,
          elements: [...document.querySelectorAll<HTMLElement>("body *")]
            .map((element) => {
              const rect = element.getBoundingClientRect();
              return {
                tag: element.tagName.toLowerCase(),
                testId: element.dataset.testid ?? "",
                className: element.className,
                left: Math.round(rect.left),
                right: Math.round(rect.right),
                width: Math.round(rect.width),
              };
            })
            .filter((element) => element.right > clientWidth + 1)
            .slice(0, 12),
        };
      });
      expect(
        overflow.delta,
        `horizontal overflow at ${viewport.width}px: ${JSON.stringify(overflow.elements)}`,
      ).toBeLessThanOrEqual(1);
    }

    for (const name of [
      "old_password",
      "new_password",
      "confirm_password",
    ]) {
      const input = page.locator(`input[name="${name}"]`);
      expect(
        await input.evaluate(
          (element) =>
            Boolean(
              (element as HTMLInputElement).labels?.length ||
                element.getAttribute("aria-label")?.trim() ||
                element.getAttribute("aria-labelledby")?.trim(),
            ),
        ),
        `${name} needs an accessible name`,
      ).toBe(true);
    }

    await page.locator('input[name="old_password"]').fill("Wrong12345@##");
    await page.locator('input[name="new_password"]').fill("Audit12345@##");
    await page
      .locator('input[name="confirm_password"]')
      .fill("Audit12345@##");
    await page.locator('button[type="submit"]').click();
    await expect(page.getByText(/current password is incorrect/i)).toBeVisible();

    await page.locator('input[name="old_password"]').fill(PASSWORD);
    await page.locator('input[name="new_password"]').fill("Audit12345@##");
    await page
      .locator('input[name="confirm_password"]')
      .fill("Audit12345@##");
    await page.locator('button[type="submit"]').click();
    await expect(page.getByText(/password changed successfully/i)).toBeVisible();

    const restore = await page.request.post("/api/auth/change-password", {
      data: {
        old_password: "Audit12345@##",
        new_password: PASSWORD,
      },
    });
    expect(restore.status()).toBe(200);

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
    expect(realErrors(consoleErrors), "application console errors").toEqual([]);
    expect(pageErrors, "uncaught page errors").toEqual([]);
    expect(failedRequests, "failed same-origin critical requests").toEqual([]);
    expect(unexpectedResponses, "unexpected same-origin HTTP failures").toEqual([]);
    expect(
      completedServerActions.every(
        (url) => url === "http://localhost:3101/change-password",
      ),
      "only the two asserted change-password Server Actions may close their RSC streams",
    ).toBe(true);
    expect(completedServerActions.length).toBeLessThanOrEqual(2);

    await context.close();
  });

  test("change-password renders Bangla in the persisted dark theme", async ({
    browser,
  }) => {
    const { context } = await apiLogin(browser, "customer");
    await setLocale(context, "bn");
    await context.addCookies([
      { name: "mad_theme", value: "dark", url: "http://localhost:3101" },
    ]);
    const page = await context.newPage();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/change-password");

    await expect(page.locator("html")).toHaveAttribute("lang", "bn");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.locator("h1")).not.toHaveText(/Change Password/i);
    await expectNoRawKeys(page);

    await context.close();
  });

  test("complaint detail denies anonymous and unrelated viewers", async ({
    browser,
    page,
  }) => {
    const anonymous = await page.goto("/complaints/1", {
      waitUntil: "domcontentloaded",
    });
    expect(anonymous?.status()).toBe(200);
    expect(new URL(page.url()).pathname).toBe("/login");

    const { context } = await apiLogin(browser, "marketing");
    await setLocale(context, "en");
    const unrelatedPage = await context.newPage();
    const unrelated = await unrelatedPage.goto("/complaints/1", {
      waitUntil: "domcontentloaded",
    });
    // notFound() is rendered through Next.js' streamed App Router boundary,
    // whose outer document response is 200 even though the boundary is a 404.
    expect(unrelated?.status()).toBe(200);
    expect(new URL(unrelatedPage.url()).pathname).toBe("/complaints/1");
    await expect(unrelatedPage.getByText(/page not found/i)).toBeVisible();

    const apiResponse = await unrelatedPage.request.get("/api/complaints/1");
    expect(apiResponse.status()).toBe(403);
    await context.close();
  });

  test("complaint detail is visible to its owner, recipient, and super admin with scoped controls", async ({
    browser,
  }) => {
    const viewers = [
      {
        role: "customer",
        backHref: "/customer/complaints",
        canHandle: false,
      },
      {
        role: "branch_manager",
        backHref: "/branch-manager/complaints",
        canHandle: true,
      },
      {
        role: "super_admin",
        backHref: "/admin/complaints",
        canHandle: true,
      },
    ] as const;

    for (const viewer of viewers) {
      const { context } = await apiLogin(browser, viewer.role);
      await setLocale(context, "en");
      const page = await context.newPage();
      const response = await page.goto("/complaints/1", {
        waitUntil: "domcontentloaded",
      });
      expect(response?.status(), `${viewer.role} page response`).toBe(200);
      await expect(page.locator("h1")).toHaveText("খাবার ঠান্ডা ছিল");
      await expect(
        page.getByRole("link", { name: /back to complaints/i }),
      ).toHaveAttribute("href", viewer.backHref);
      const statusControls = page.getByText(/change status/i);
      if (viewer.canHandle) {
        await expect(statusControls).toBeVisible();
      } else {
        await expect(statusControls).toHaveCount(0);
      }
      const apiResponse = await page.request.get("/api/complaints/1");
      expect(apiResponse.status()).toBe(200);
      await context.close();
    }
  });

  test("complaint detail is responsive, accessible, localized, and runtime-clean", async ({
    browser,
  }) => {
    const { context } = await apiLogin(browser, "customer");
    await setLocale(context, "en");
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
      { width: 320, height: 568 },
    ]) {
      await page.setViewportSize(viewport);
      const response = await page.goto("/complaints/1", {
        waitUntil: "domcontentloaded",
      });
      expect(response?.status()).toBe(200);
      await expect(page.locator("main")).toHaveCount(1);
      await expect(page.locator("h1")).toHaveCount(1);
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
        "content",
        /noindex/,
      );
      const overflow = await page.evaluate(() => {
        const clientWidth = document.documentElement.clientWidth;
        return {
          delta: document.documentElement.scrollWidth - clientWidth,
          elements: [...document.querySelectorAll<HTMLElement>("body *")]
            .map((element) => {
              const rect = element.getBoundingClientRect();
              return {
                tag: element.tagName.toLowerCase(),
                testId: element.dataset.testid ?? "",
                className: element.className,
                left: Math.round(rect.left),
                right: Math.round(rect.right),
                width: Math.round(rect.width),
              };
            })
            .filter((element) => element.right > clientWidth + 1)
            .slice(0, 12),
        };
      });
      expect(
        overflow.delta,
        `horizontal overflow at ${viewport.width}px: ${JSON.stringify(overflow.elements)}`,
      ).toBeLessThanOrEqual(1);
    }

    const reply = page.locator("form textarea");
    await expect(reply).toBeVisible();
    expect(
      await reply.evaluate(
        (element) =>
          Boolean(
            (element as HTMLTextAreaElement).labels?.length ||
              element.getAttribute("aria-label")?.trim() ||
              element.getAttribute("aria-labelledby")?.trim(),
          ),
      ),
      "reply textarea needs an accessible name",
    ).toBe(true);
    await reply.fill("   ");
    await page.getByRole("button", { name: /^send$/i }).click();
    await expect(page.getByText(/enter the details/i)).toBeVisible();

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
    expect(realErrors(consoleErrors), "application console errors").toEqual([]);
    expect(pageErrors, "uncaught page errors").toEqual([]);
    expect(failedRequests, "failed same-origin critical requests").toEqual([]);
    expect(unexpectedResponses, "unexpected same-origin HTTP failures").toEqual([]);
    await context.close();

    const bangla = await apiLogin(browser, "branch_manager");
    await setLocale(bangla.context, "bn");
    await bangla.context.addCookies([
      { name: "mad_theme", value: "dark", url: "http://localhost:3101" },
    ]);
    const banglaPage = await bangla.context.newPage();
    await banglaPage.setViewportSize({ width: 390, height: 844 });
    await banglaPage.goto("/complaints/1");
    await expect(banglaPage.locator("html")).toHaveAttribute("lang", "bn");
    await expect(banglaPage.locator("html")).toHaveAttribute(
      "data-theme",
      "dark",
    );
    await expect(
      banglaPage.getByRole("heading", {
        level: 2,
        name: "কথোপকথন",
      }),
    ).toBeVisible();
    await expectNoRawKeys(banglaPage);
    await bangla.context.close();
  });

  test("new complaint denies anonymous page and API access", async ({ page }) => {
    const response = await page.goto("/complaints/new", {
      waitUntil: "domcontentloaded",
    });
    expect(response?.status()).toBe(200);
    expect(new URL(page.url()).pathname).toBe("/login");

    const apiResponse = await page.request.post("/api/complaints", {
      data: {
        recipient_role: "super_admin",
        category: "service",
        subject: "Unauthorized audit complaint",
        message: "This must not be created.",
      },
    });
    expect(apiResponse.status()).toBe(401);
  });

  test("new complaint form is available to every authenticated role", async ({
    browser,
  }) => {
    for (const role of DEMO_USERS) {
      const { context } = await apiLogin(browser, role);
      await setLocale(context, "en");
      const page = await context.newPage();
      const response = await page.goto("/complaints/new", {
        waitUntil: "domcontentloaded",
      });
      expect(response?.status(), `${role} page response`).toBe(200);
      expect(new URL(page.url()).pathname, `${role} final URL`).toBe(
        "/complaints/new",
      );
      await expect(
        page.getByRole("heading", { level: 1, name: /new complaint/i }),
      ).toBeVisible();
      await expect(page.locator("form")).toBeVisible();
      await expectNoRawKeys(page);
      await context.close();
    }
  });

  test("new complaint is responsive, accessible, localized, and submits through the UI", async ({
    browser,
  }) => {
    const { context } = await apiLogin(browser, "customer");
    await setLocale(context, "en");
    const page = await context.newPage();
    const consoleErrors = trackConsoleErrors(page);
    const pageErrors: string[] = [];
    const failedRequests: string[] = [];
    const completedServerActions: string[] = [];
    const unexpectedResponses: string[] = [];

    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("requestfailed", (failedRequest) => {
      const requestUrl = new URL(failedRequest.url());
      const errorText = failedRequest.failure()?.errorText ?? "";
      if (
        requestUrl.origin === new URL(page.url()).origin &&
        failedRequest.method() === "POST" &&
        failedRequest.resourceType() === "fetch" &&
        Boolean(failedRequest.headers()["next-action"]) &&
        errorText === "net::ERR_ABORTED"
      ) {
        completedServerActions.push(failedRequest.url());
        return;
      }
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
      { width: 320, height: 568 },
    ]) {
      await page.setViewportSize(viewport);
      const response = await page.goto("/complaints/new", {
        waitUntil: "domcontentloaded",
      });
      expect(response?.status()).toBe(200);
      await expect(page.locator("main")).toHaveCount(1);
      await expect(page.locator("h1")).toHaveCount(1);
      await expect(page).toHaveTitle(/New Complaint/i);
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

    const unnamedControls = await page
      .locator("form select, form input, form textarea")
      .evaluateAll((controls) =>
        controls
          .filter((control) => {
            const element = control as
              | HTMLInputElement
              | HTMLSelectElement
              | HTMLTextAreaElement;
            return (
              element.getClientRects().length > 0 &&
              !(
                element.labels?.length ||
                element.getAttribute("aria-label")?.trim() ||
                element.getAttribute("aria-labelledby")?.trim()
              )
            );
          })
          .map((control) => control.tagName.toLowerCase()),
      );
    expect(
      unnamedControls,
      "every visible complaint form control needs an accessible name",
    ).toEqual([]);

    await page.getByRole("button", { name: /submit complaint/i }).click();
    await expect(page.locator("p.text-red-600")).toHaveCount(4);
    expect(new URL(page.url()).pathname).toBe("/complaints/new");

    const subject = `Audit complaint ${Date.now()}`;
    const selects = page.locator("form select");
    await selects.nth(0).selectOption("branch_manager");
    await selects.nth(1).selectOption("service");
    await page.locator("form input").fill(subject);
    await page.locator("form textarea").fill("Audit complaint body");
    await page.getByRole("button", { name: /submit complaint/i }).click();
    await page.waitForURL(/\/complaints\/\d+$/, { timeout: 20_000 });
    await expect(page.locator("h1")).toHaveText(subject);

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
    expect(realErrors(consoleErrors), "application console errors").toEqual([]);
    expect(pageErrors, "uncaught page errors").toEqual([]);
    expect(failedRequests, "failed same-origin critical requests").toEqual([]);
    expect(unexpectedResponses, "unexpected same-origin HTTP failures").toEqual([]);
    expect(
      completedServerActions.every(
        (url) => url === "http://localhost:3101/complaints/new",
      ),
      "only the asserted complaint submission action may close its RSC stream",
    ).toBe(true);
    expect(completedServerActions.length).toBeLessThanOrEqual(1);
    await context.close();

    const bangla = await apiLogin(browser, "customer");
    await setLocale(bangla.context, "bn");
    await bangla.context.addCookies([
      { name: "mad_theme", value: "dark", url: "http://localhost:3101" },
    ]);
    const banglaPage = await bangla.context.newPage();
    await banglaPage.setViewportSize({ width: 390, height: 844 });
    await banglaPage.goto("/complaints/new");
    await expect(banglaPage.locator("html")).toHaveAttribute("lang", "bn");
    await expect(banglaPage.locator("html")).toHaveAttribute(
      "data-theme",
      "dark",
    );
    await expectNoRawKeys(banglaPage);
    await bangla.context.close();
  });

  test("profile denies anonymous page and API access", async ({ page }) => {
    const response = await page.goto("/profile", {
      waitUntil: "domcontentloaded",
    });
    expect(response?.status()).toBe(200);
    expect(new URL(page.url()).pathname).toBe("/login");

    const getProfile = await page.request.get("/api/auth/profile");
    expect(getProfile.status()).toBe(401);
    const updateProfile = await page.request.patch("/api/auth/profile", {
      data: { first_name: "Unauthorized" },
    });
    expect(updateProfile.status()).toBe(401);
  });

  test("profile is available to every authenticated role", async ({ browser }) => {
    for (const role of DEMO_USERS) {
      const { context } = await apiLogin(browser, role);
      await setLocale(context, "en");
      const page = await context.newPage();
      const consoleErrors = trackConsoleErrors(page);
      const response = await page.goto("/profile", {
        waitUntil: "domcontentloaded",
      });
      expect(response?.status(), `${role} page response`).toBe(200);
      expect(new URL(page.url()).pathname, `${role} final URL`).toBe("/profile");
      await expect(
        page.getByRole("heading", { level: 1, name: /my profile/i }),
      ).toBeVisible();
      await expect(page.getByTestId("dashboard-sidebar")).toBeVisible();
      await expect(page.getByTestId("dashboard-topbar")).toBeVisible();
      await expect(page.locator("form")).toBeVisible();
      await expectNoRawKeys(page);
      expect(realErrors(consoleErrors), `${role} console errors`).toEqual([]);
      await context.close();
    }
  });

  test("profile is responsive, accessible, and safely updates an audit-only customer", async ({
    browser,
    request,
  }) => {
    const unique = Date.now();
    const username = `audit_profile_${unique}`;
    const suffix = String(unique).slice(-8);
    const original = {
      first_name: "Audit",
      last_name: "Profile",
      email: `${username}@example.com`,
      phone: `019${suffix}`,
      address: "Original audit address",
    };
    const registration = await request.post("/api/auth/register/customer", {
      data: {
        ...original,
        username,
        password: PASSWORD,
        password_confirm: PASSWORD,
      },
    });
    expect(registration.status()).toBe(201);

    const { context } = await apiLogin(browser, username);
    await setLocale(context, "en");
    const page = await context.newPage();
    const consoleErrors = trackConsoleErrors(page);
    const pageErrors: string[] = [];
    const failedRequests: string[] = [];
    const completedServerActions: string[] = [];
    const unexpectedResponses: string[] = [];

    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("requestfailed", (failedRequest) => {
      const requestUrl = new URL(failedRequest.url());
      const errorText = failedRequest.failure()?.errorText ?? "";
      if (
        requestUrl.origin === new URL(page.url()).origin &&
        failedRequest.method() === "POST" &&
        failedRequest.resourceType() === "fetch" &&
        Boolean(failedRequest.headers()["next-action"]) &&
        errorText === "net::ERR_ABORTED"
      ) {
        completedServerActions.push(failedRequest.url());
        return;
      }
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
      { width: 320, height: 568 },
    ]) {
      await page.setViewportSize(viewport);
      const response = await page.goto("/profile", {
        waitUntil: "domcontentloaded",
      });
      expect(response?.status()).toBe(200);
      await expect(page.locator("main")).toHaveCount(1);
      await expect(page.locator("h1")).toHaveCount(1);
      await expect(page).toHaveTitle(/My Profile/i);
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

    const unnamedControls = await page
      .locator("form input:not([type=hidden]), form select, form textarea")
      .evaluateAll((controls) =>
        controls
          .filter((control) => {
            const element = control as
              | HTMLInputElement
              | HTMLSelectElement
              | HTMLTextAreaElement;
            return !(
              element.labels?.length ||
              element.getAttribute("aria-label")?.trim() ||
              element.getAttribute("aria-labelledby")?.trim()
            );
          })
          .map((control) => {
            const element = control as HTMLInputElement;
            return `${element.tagName.toLowerCase()}[name="${element.name}"]`;
          }),
      );
    expect(unnamedControls, "profile form controls need accessible names").toEqual(
      [],
    );

    await page.locator('input[name="profile_photo"]').setInputFiles({
      name: "not-an-image.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("not an image"),
    });
    await expect(page.getByText(/upload an image file only/i)).toBeVisible();
    await expect(page.locator('input[name="profile_photo"]')).toHaveValue("");

    await page.locator('input[name="first_name"]').fill("Updated");
    await page.locator('input[name="last_name"]').fill("Audit");
    await page
      .locator('textarea[name="address"]')
      .fill("Updated audit-only address");
    await page.getByRole("button", { name: /update profile/i }).click();
    await expect(page.getByText(/profile updated successfully/i)).toBeVisible();

    const profileResponse = await page.request.get("/api/auth/profile");
    expect(profileResponse.status()).toBe(200);
    const updated = await profileResponse.json();
    expect(updated.first_name).toBe("Updated");
    expect(updated.last_name).toBe("Audit");
    expect(updated.address).toBe("Updated audit-only address");

    const restore = await page.request.patch("/api/auth/profile", {
      data: original,
    });
    expect(restore.status()).toBe(200);

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
    expect(realErrors(consoleErrors), "application console errors").toEqual([]);
    expect(pageErrors, "uncaught page errors").toEqual([]);
    expect(failedRequests, "failed same-origin critical requests").toEqual([]);
    expect(unexpectedResponses, "unexpected same-origin HTTP failures").toEqual([]);
    expect(
      completedServerActions.every(
        (url) => url === "http://localhost:3101/profile",
      ),
      "only the asserted profile update action may close its RSC stream",
    ).toBe(true);
    expect(completedServerActions.length).toBeLessThanOrEqual(1);
    await context.close();
  });

  test("profile renders Bangla in the persisted dark theme", async ({
    browser,
  }) => {
    const { context } = await apiLogin(browser, "customer");
    await setLocale(context, "bn");
    await context.addCookies([
      { name: "mad_theme", value: "dark", url: "http://localhost:3101" },
    ]);
    const page = await context.newPage();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/profile");

    await expect(page.locator("html")).toHaveAttribute("lang", "bn");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.locator("h1")).not.toHaveText(/My Profile/i);
    await expectNoRawKeys(page);
    await context.close();
  });
});
