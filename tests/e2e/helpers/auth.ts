import {
  expect,
  type Page,
  type Browser,
  type BrowserContext,
  type APIRequestContext,
} from "@playwright/test";
import { PASSWORD, ROLE_HOME } from "./users";
import { E2E_ORIGIN } from "./routes";

/**
 * Headless (no-UI) login via the Auth.js credentials callback. Yields an
 * authenticated request context WITHOUT loading/hydrating any page — much
 * lighter than `newSession`, so helpers that only need API access (e.g. driving
 * an order through the BM pipeline) don't add UI-login load that flakes under
 * sustained full-suite pressure. UI-behavior tests still use `newSession`.
 */
export async function apiLogin(
  browser: Browser,
  username: string,
): Promise<{ context: BrowserContext; req: APIRequestContext }> {
  const context = await browser.newContext();
  const req = context.request;
  const { csrfToken } = await (await req.get("/api/auth/csrf")).json();
  await req.post("/api/auth/callback/credentials", {
    form: { csrfToken, username, password: PASSWORD, callbackUrl: "/", redirect: "false" },
    maxRedirects: 0,
  });
  return { context, req };
}

/** Set the UI language cookie before any navigation. */
export async function setLocale(context: BrowserContext, locale: "en" | "bn"): Promise<void> {
  await context.addCookies([
    { name: "mad_locale", value: locale, url: E2E_ORIGIN },
  ]);
}

/** UI login; waits for the role dashboard. Throws (fails the test) if it doesn't land. */
export async function login(page: Page, username: string): Promise<void> {
  await page.goto("/login");
  const submit = page.locator('button[type="submit"]');
  // The submit button is disabled until the CONTROLLED inputs are valid
  // (`disabled={!canSubmit || pending}`). A `fill()` that lands BEFORE React
  // hydrates is dropped — no onChange listener is attached yet — so the button
  // stays disabled and the click times out (a real, load-dependent flake seen in
  // full-suite runs). Re-apply the values until React has registered them (the
  // button enables). This synchronizes on hydration; it does not mask a product
  // defect — a human types after the page is interactive, and login itself is
  // unchanged.
  await expect(async () => {
    await page.fill('input[name="identifier"]', username);
    await page.fill('input[name="password"]', PASSWORD);
    await expect(submit).toBeEnabled({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  // A single click can be swallowed if it lands during a React hydration reflow
  // that re-creates the button (a load-dependent flake on this shared box). Drive
  // to the OUTCOME instead: click, and if we are still on /login a while later,
  // the click did not take — click again. This synchronizes on the sign-in
  // actually happening; it never accepts a login that did not occur, because the
  // form action itself is unchanged and a wrong credential would still error.
  //
  // The inner wait is 12s and the outer 45s because the sign-in server action is
  // genuinely CPU-heavy under load (bcrypt.compare + Auth.js signIn + the SSR of
  // a heavier landing page), and this box is shared: a correct sign-in can take
  // >5s when the host is busy, and treating that as a swallowed click would
  // re-submit needlessly. Longer patience for a slow-but-correct sign-in is not
  // a weakened assertion — the destination is still asserted exactly below.
  await expect(async () => {
    if (page.url().includes("/login")) await submit.click();
    await expect(page).not.toHaveURL(/\/login(\?|$)/, { timeout: 12_000 });
  }).toPass({ timeout: 45_000 });
  const home = ROLE_HOME[username];
  if (home) {
    // 30s, not 20s: the customer landing page (the public storefront, with its
    // branch coverage and menu sections) is a heavy SSR render, and on this
    // shared box its first paint after the post-sign-in redirect can
    // legitimately run long.
    //
    // Matched on the parsed PATHNAME, not a `**${home}` glob: the customer's
    // home is now "/", and a glob/regex built from that string matches far too
    // much. The pathname comparison is exact for every role.
    await page.waitForURL((url) => url.pathname === home, { timeout: 30_000 });
    expect(new URL(page.url()).pathname, `${username} lands on ${home}`).toBe(home);
  }
}

/**
 * Fresh browser context (default English locale for deterministic Latin text/digits)
 * with the given role logged in. Returns the context, page and its request client.
 */
export async function newSession(browser: Browser, username: string, locale: "en" | "bn" = "en") {
  const context = await browser.newContext();
  await setLocale(context, locale);
  const page = await context.newPage();
  await login(page, username);
  return { context, page, req: page.request };
}

/**
 * Open the topbar user menu and log out; asserts return to /login.
 *
 * Selectors are stable testids, NOT the display name — other tests rename the
 * seeded users (10-profile-image-upload writes "QA Tester"), which used to make
 * the name-based lookup miss in full-suite runs.
 *
 * The topbar logout is `<form action={logoutAction}>` → `signOut({ redirectTo:
 * "/login" })`, which clears the session cookie (`Set-Cookie … Max-Age=0`).
 *
 * The intermittent "session cookie must be cleared by signOut" failure was NOT
 * a jar-timing flake — it was a real auth defect: the Auth.js `auth()` route
 * middleware re-issued (rolled) the session cookie on EVERY request, so an RSC
 * prefetch of a protected nav link, in flight during signOut, resurrected the
 * just-cleared cookie and the user stayed logged in. Fixed in `proxy.ts` by
 * making the middleware read-only w.r.t. the session cookie (it strips any
 * Set-Cookie it would otherwise roll). The `expect.poll` below remains only as
 * a lightweight synchronization on the browser's async cookie-jar commit — the
 * cookie now goes and stays gone (see tests/e2e/*logout* + zz diagnostics).
 */
export async function logout(page: Page): Promise<void> {
  await page.getByTestId("profile-menu-trigger").click();
  await page.getByTestId("logout-button").click();
  await page.waitForURL("**/login**", { timeout: 15_000 });
  await expect(page).toHaveURL(/\/login/);
  await expect
    .poll(async () => (await page.context().cookies()).some((c) => c.name.includes("session-token")), {
      timeout: 10_000,
    })
    .toBe(false);
}
