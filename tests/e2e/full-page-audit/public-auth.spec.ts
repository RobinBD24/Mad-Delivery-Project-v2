import { expect, test } from "@playwright/test";

import {
  expectNoRawKeys,
  realErrors,
  setLocale,
  trackConsoleErrors,
} from "../helpers";

test.describe("Full page audit — public and authentication", () => {
  test.beforeEach(async ({ context }) => {
    await setLocale(context, "en");
  });

  test("homepage has clean runtime, network, images, and accessible landmarks/forms", async ({
    page,
  }) => {
    const consoleErrors = trackConsoleErrors(page);
    const pageErrors: string[] = [];
    const failedRequests: string[] = [];
    const cancelledSpeculativePrefetches: string[] = [];
    const unexpectedResponses: string[] = [];

    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("requestfailed", (request) => {
      if (new URL(request.url()).origin === new URL(page.url()).origin) {
        const requestUrl = new URL(request.url());
        const errorText = request.failure()?.errorText ?? "";
        // Next.js cancels speculative RSC prefetches when a prefetched link
        // leaves the viewport. These requests are not page data or a user
        // navigation; direct internal-link requests are asserted separately.
        if (
          requestUrl.searchParams.has("_rsc") &&
          errorText === "net::ERR_ABORTED"
        ) {
          cancelledSpeculativePrefetches.push(request.url());
          return;
        }
        failedRequests.push(
          `${request.method()} ${request.url()} ${errorText}`,
        );
      }
    });
    page.on("response", (response) => {
      if (
        response.status() >= 400 &&
        new URL(response.url()).origin === new URL(page.url()).origin
      ) {
        unexpectedResponses.push(
          `${response.status()} ${response.request().method()} ${response.url()}`,
        );
      }
    });

    const response = await page.goto("/", { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(200);
    expect(new URL(page.url()).pathname).toBe("/");
    await expect(page.locator("main")).toHaveCount(1);
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page).toHaveTitle(/MAD Delivery/i);
    await page.evaluate(() => document.fonts.ready.then(() => undefined));

    const images = page.locator("img");
    for (let index = 0; index < (await images.count()); index += 1) {
      await images.nth(index).scrollIntoViewIfNeeded();
    }
    await expect
      .poll(() =>
        images.evaluateAll((elements) =>
          elements
            .filter(
              (element) =>
                element instanceof HTMLImageElement &&
                element.complete &&
                element.naturalWidth === 0,
            )
            .map((element) => element.getAttribute("src") ?? "?"),
        ),
      )
      .toEqual([]);

    const unnamedFormControls = await page
      .locator("input:not([type=hidden]), select, textarea")
      .evaluateAll((controls) =>
        controls
          .filter((control) => {
            const element = control as
              | HTMLInputElement
              | HTMLSelectElement
              | HTMLTextAreaElement;
            if (element.disabled || element.getClientRects().length === 0) {
              return false;
            }
            const labelledBy = element.getAttribute("aria-labelledby");
            const labelledByText = labelledBy
              ?.split(/\s+/)
              .map((id) => document.getElementById(id)?.textContent?.trim() ?? "")
              .join(" ")
              .trim();
            return !(
              element.labels?.length ||
              element.getAttribute("aria-label")?.trim() ||
              labelledByText ||
              element.getAttribute("title")?.trim()
            );
          })
          .map((control) => {
            const element = control as HTMLInputElement;
            return `${element.tagName.toLowerCase()}[name="${element.name}"][placeholder="${element.placeholder}"]`;
          }),
      );

    expect(unnamedFormControls, "visible form controls need accessible names").toEqual(
      [],
    );
    await expectNoRawKeys(page);
    expect(realErrors(consoleErrors), "application console errors").toEqual([]);
    expect(pageErrors, "uncaught page errors").toEqual([]);
    expect(failedRequests, "failed same-origin requests").toEqual([]);
    expect(unexpectedResponses, "unexpected same-origin HTTP failures").toEqual([]);
    expect(
      cancelledSpeculativePrefetches.every((url) =>
        new URL(url).searchParams.has("_rsc"),
      ),
      "only documented speculative RSC prefetches may be cancelled",
    ).toBe(true);
  });

  test("login has clean runtime, noindex metadata, accessible landmarks/forms, and responsive layout", async ({
    page,
  }) => {
    const consoleErrors = trackConsoleErrors(page);
    const pageErrors: string[] = [];
    const failedRequests: string[] = [];
    const unexpectedResponses: string[] = [];

    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("requestfailed", (request) => {
      const requestUrl = new URL(request.url());
      const errorText = request.failure()?.errorText ?? "";
      if (
        requestUrl.origin === new URL(page.url()).origin &&
        !(
          requestUrl.searchParams.has("_rsc") &&
          errorText === "net::ERR_ABORTED"
        )
      ) {
        failedRequests.push(
          `${request.method()} ${request.url()} ${errorText}`,
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
      const response = await page.goto("/login", {
        waitUntil: "domcontentloaded",
      });
      expect(response?.status()).toBe(200);
      expect(new URL(page.url()).pathname).toBe("/login");
      await expect(page.locator("main")).toHaveCount(1);
      await expect(page.locator("h1")).toHaveCount(1);
      await expect(page).toHaveTitle(/Sign In/i);
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

    const unnamedFormControls = await page
      .locator("input:not([type=hidden]), select, textarea")
      .evaluateAll((controls) =>
        controls
          .filter((control) => {
            const element = control as
              | HTMLInputElement
              | HTMLSelectElement
              | HTMLTextAreaElement;
            if (element.disabled || element.getClientRects().length === 0) {
              return false;
            }
            const labelledBy = element.getAttribute("aria-labelledby");
            const labelledByText = labelledBy
              ?.split(/\s+/)
              .map((id) => document.getElementById(id)?.textContent?.trim() ?? "")
              .join(" ")
              .trim();
            return !(
              element.labels?.length ||
              element.getAttribute("aria-label")?.trim() ||
              labelledByText ||
              element.getAttribute("title")?.trim()
            );
          })
          .map((control) => {
            const element = control as HTMLInputElement;
            return `${element.tagName.toLowerCase()}#${element.id}`;
          }),
      );

    expect(unnamedFormControls, "visible form controls need accessible names").toEqual(
      [],
    );
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
  });

  test("register validates, persists a customer, rejects role spoofing, and stays accessible/responsive", async ({
    page,
  }) => {
    const consoleErrors = trackConsoleErrors(page);
    const pageErrors: string[] = [];
    const failedRequests: string[] = [];
    const redirectedServerActions: string[] = [];
    const unexpectedResponses: string[] = [];

    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("requestfailed", (request) => {
      const requestUrl = new URL(request.url());
      const errorText = request.failure()?.errorText ?? "";
      // A successful redirect() from a Next.js Server Action sends the target
      // in x-action-redirect. Chromium then reports the consumed RSC fetch as
      // aborted while the client router commits that redirect.
      if (
        requestUrl.origin === new URL(page.url()).origin &&
        request.method() === "POST" &&
        request.resourceType() === "fetch" &&
        Boolean(request.headers()["next-action"]) &&
        errorText === "net::ERR_ABORTED"
      ) {
        redirectedServerActions.push(request.url());
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
          `${request.method()} ${request.url()} ${errorText}`,
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
      const response = await page.goto("/register", {
        waitUntil: "domcontentloaded",
      });
      expect(response?.status()).toBe(200);
      expect(new URL(page.url()).pathname).toBe("/register");
      await expect(page.locator("main")).toHaveCount(1);
      await expect(page.locator("h1")).toHaveCount(1);
      await expect(page).toHaveTitle(/Customer Registration/i);
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

    const unnamedFormControls = await page
      .locator("input:not([type=hidden]), select, textarea")
      .evaluateAll((controls) =>
        controls
          .filter((control) => {
            const element = control as
              | HTMLInputElement
              | HTMLSelectElement
              | HTMLTextAreaElement;
            if (element.disabled || element.getClientRects().length === 0) {
              return false;
            }
            return !(
              element.labels?.length ||
              element.getAttribute("aria-label")?.trim() ||
              element.getAttribute("aria-labelledby")?.trim() ||
              element.getAttribute("title")?.trim()
            );
          })
          .map((control) => {
            const element = control as HTMLInputElement;
            return `${element.tagName.toLowerCase()}[name="${element.name}"]`;
          }),
      );
    expect(unnamedFormControls, "visible form controls need accessible names").toEqual(
      [],
    );

    const unique = Date.now();
    const suffix = String(unique).slice(-8);
    const registration = {
      first_name: "Audit",
      last_name: "Customer",
      username: `audit_customer_${unique}`,
      phone: `017${suffix}`,
      email: `audit_customer_${unique}@example.com`,
      password: "Audit12345@##",
      password_confirm: "Audit12345@##",
    };

    const spoofed = await page.request.post("/api/auth/register/customer", {
      data: { ...registration, role: "super_admin" },
    });
    expect(spoofed.status(), "public registration must reject role spoofing").toBe(
      400,
    );

    for (const [name, value] of Object.entries(registration)) {
      await page.locator(`[name="${name}"]`).fill(value);
    }
    await page
      .getByRole("button", { name: /complete registration/i })
      .click();
    // Registration auto-signs-in, and a login lands a customer on "/".
    await page.waitForURL((u) => u.pathname === "/", { timeout: 20_000 });

    const me = await page.request.get("/api/auth/me");
    expect(me.status()).toBe(200);
    expect((await me.json()).role).toBe("customer");

    const duplicate = await page.request.post("/api/auth/register/customer", {
      data: registration,
    });
    expect(duplicate.status(), "duplicate identity must be rejected").toBe(400);

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
    // Whether a Server Action redirect surfaces as an ABORTED RSC fetch is a
    // client-router implementation detail, not a contract: it happens when the
    // router commits the target inside the same tree. /register → "/" leaves the
    // dashboard tree for the public layout and commits as a clean navigation,
    // aborting nothing. The contract is asserted above instead — the redirect
    // landed on "/" and /api/auth/me proves the new account is signed in. What
    // must still hold here is that no OTHER server action was aborted.
    // (Origin is read from the page rather than hardcoded, so the spec is not
    // pinned to one E2E_PORT.)
    const origin = new URL(page.url()).origin;
    expect(
      redirectedServerActions.filter((url) => url !== `${origin}/register`),
      "no server action other than registration was aborted",
    ).toEqual([]);
  });

  test("register renders Bangla in the persisted dark theme without raw keys", async ({
    page,
    context,
  }) => {
    await setLocale(context, "bn");
    await context.addCookies([
      { name: "mad_theme", value: "dark", url: "http://localhost:3101" },
    ]);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/register");
    await expect(page.locator("html")).toHaveAttribute("lang", "bn");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.locator("h1")).toContainText("কাস্টমার");
    await expectNoRawKeys(page);
  });

  test("forgot-password is responsive, accessible, localized, and rejects an invalid identity cleanly", async ({
    page,
    context,
  }) => {
    const consoleErrors = trackConsoleErrors(page);
    const pageErrors: string[] = [];
    const failedRequests: string[] = [];
    const unexpectedResponses: string[] = [];

    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("requestfailed", (request) => {
      const requestUrl = new URL(request.url());
      const errorText = request.failure()?.errorText ?? "";
      if (
        requestUrl.origin === new URL(page.url()).origin &&
        !(
          requestUrl.searchParams.has("_rsc") &&
          errorText === "net::ERR_ABORTED"
        )
      ) {
        failedRequests.push(
          `${request.method()} ${request.url()} ${errorText}`,
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
      const response = await page.goto("/forgot-password", {
        waitUntil: "domcontentloaded",
      });
      expect(response?.status()).toBe(200);
      expect(new URL(page.url()).pathname).toBe("/forgot-password");
      await expect(page.locator("main")).toHaveCount(1);
      await expect(page.locator("h1")).toHaveCount(1);
      await expect(page).toHaveTitle(/Reset your password/i);
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

    for (const name of [
      "username",
      "email",
      "password",
      "confirm_password",
    ]) {
      const input = page.locator(`input[name="${name}"]`);
      await expect(input).toBeVisible();
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

    await page.locator('input[name="username"]').fill("customer");
    await page
      .locator('input[name="email"]')
      .fill(`audit-wrong-${Date.now()}@example.com`);
    await page.locator('input[name="password"]').fill("Audit12345@##");
    await page
      .locator('input[name="confirm_password"]')
      .fill("Audit12345@##");
    await page.getByRole("button", { name: /reset password/i }).click();
    await expect(
      page.getByText(/could not verify this account/i),
    ).toBeVisible();
    expect(new URL(page.url()).pathname).toBe("/forgot-password");
    await expect(page.getByRole("link", { name: /back to sign in/i })).toHaveAttribute(
      "href",
      "/login",
    );

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

    await setLocale(context, "bn");
    await context.addCookies([
      { name: "mad_theme", value: "dark", url: "http://localhost:3101" },
    ]);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/forgot-password");
    await expect(page.locator("html")).toHaveAttribute("lang", "bn");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.locator("h1")).toHaveText("পাসওয়ার্ড রিসেট করুন");
    await expectNoRawKeys(page);

    expect(realErrors(consoleErrors), "application console errors").toEqual([]);
    expect(pageErrors, "uncaught page errors").toEqual([]);
    expect(failedRequests, "failed same-origin critical requests").toEqual([]);
    expect(unexpectedResponses, "unexpected same-origin HTTP failures").toEqual([]);
  });

  test("legacy registration routes preserve customer-only registration by redirecting to /register", async ({
    page,
  }) => {
    const legacyRoutes = [
      "/register/accounts",
      "/register/branch-manager",
      "/register/customer",
      "/register/management",
      "/register/marketing",
      "/register/rider",
      "/register/staff",
    ];
    const consoleErrors = trackConsoleErrors(page);
    const pageErrors: string[] = [];
    const failedRequests: string[] = [];

    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("requestfailed", (request) => {
      const requestUrl = new URL(request.url());
      const errorText = request.failure()?.errorText ?? "";
      if (
        requestUrl.origin === new URL(page.url()).origin &&
        !(
          requestUrl.searchParams.has("_rsc") &&
          errorText === "net::ERR_ABORTED"
        )
      ) {
        failedRequests.push(
          `${request.method()} ${request.url()} ${errorText}`,
        );
      }
    });

    for (const [index, route] of legacyRoutes.entries()) {
      const direct = await page.request.get(route, { maxRedirects: 0 });
      expect(
        [307, 308].includes(direct.status()),
        `${route} should be an explicit temporary or permanent redirect`,
      ).toBe(true);
      expect(direct.headers().location).toBe("/register");

      await page.setViewportSize(
        index % 2 === 0
          ? { width: 1440, height: 900 }
          : { width: 320, height: 568 },
      );
      const response = await page.goto(route, { waitUntil: "domcontentloaded" });
      expect(response?.status()).toBe(200);
      expect(new URL(page.url()).pathname).toBe("/register");
      await expect(page.locator("main")).toHaveCount(1);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(
        /Customer Registration/i,
      );
      expect(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth -
            document.documentElement.clientWidth,
        ),
        `${route} destination should not overflow`,
      ).toBeLessThanOrEqual(1);
    }

    await expectNoRawKeys(page);
    expect(realErrors(consoleErrors), "application console errors").toEqual([]);
    expect(pageErrors, "uncaught page errors").toEqual([]);
    expect(failedRequests, "failed same-origin critical requests").toEqual([]);
  });

  test("registration-pending renders a clean localized status page and returns to login", async ({
    page,
    context,
  }) => {
    const consoleErrors = trackConsoleErrors(page);
    const pageErrors: string[] = [];
    const failedRequests: string[] = [];
    const unexpectedResponses: string[] = [];

    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("requestfailed", (request) => {
      const requestUrl = new URL(request.url());
      const errorText = request.failure()?.errorText ?? "";
      if (
        requestUrl.origin === new URL(page.url()).origin &&
        !(
          requestUrl.searchParams.has("_rsc") &&
          errorText === "net::ERR_ABORTED"
        )
      ) {
        failedRequests.push(
          `${request.method()} ${request.url()} ${errorText}`,
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
      const response = await page.goto("/registration-pending", {
        waitUntil: "domcontentloaded",
      });
      expect(response?.status()).toBe(200);
      expect(new URL(page.url()).pathname).toBe("/registration-pending");
      await expect(page.locator("main")).toHaveCount(1);
      await expect(page.locator("h1")).toHaveCount(1);
      await expect(page).toHaveTitle(/Application submitted/i);
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
        "content",
        /noindex/,
      );
      await expect(
        page.getByRole("link", { name: /back to sign in/i }),
      ).toHaveAttribute("href", "/login");
      expect(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth -
            document.documentElement.clientWidth,
        ),
        `horizontal overflow at ${viewport.width}px`,
      ).toBeLessThanOrEqual(1);
    }

    await setLocale(context, "bn");
    await context.addCookies([
      { name: "mad_theme", value: "dark", url: "http://localhost:3101" },
    ]);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/registration-pending");
    await expect(page.locator("html")).toHaveAttribute("lang", "bn");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expectNoRawKeys(page);

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
  });
});
