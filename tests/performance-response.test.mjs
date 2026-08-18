import test from "node:test";
import assert from "node:assert/strict";

const baseUrl = process.env.PERF_BASE_URL ?? "http://127.0.0.1:3102";
const testPassword = process.env.PERF_TEST_PASSWORD ?? "Admin12345@##";

function mergeCookies(target, headers) {
  for (const value of headers.getSetCookie()) {
    const pair = value.split(";", 1)[0];
    const separator = pair.indexOf("=");
    target.set(pair.slice(0, separator), pair.slice(separator + 1));
  }
}

function cookieHeader(cookies) {
  return [...cookies].map(([name, value]) => `${name}=${value}`).join("; ");
}

async function authenticatedCookies(username) {
  const cookies = new Map();
  const csrfResponse = await fetch(`${baseUrl}/api/auth/csrf`);
  mergeCookies(cookies, csrfResponse.headers);
  const { csrfToken } = await csrfResponse.json();

  const loginResponse = await fetch(`${baseUrl}/api/auth/callback/credentials`, {
    method: "POST",
    redirect: "manual",
    headers: {
      cookie: cookieHeader(cookies),
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      csrfToken,
      username,
      password: testPassword,
      callbackUrl: "/",
      redirect: "false",
    }),
  });
  mergeCookies(cookies, loginResponse.headers);

  assert.ok(
    [...cookies.keys()].some((name) => name.includes("session-token")),
    `login must issue session cookie; received status ${loginResponse.status}`,
  );
  return cookieHeader(cookies);
}

test("login does not serialize the application dictionary", async () => {
  const response = await fetch(`${baseUrl}/login`);
  assert.equal(response.status, 200);

  const html = await response.text();
  assert.equal(
    html.includes('\\"pendingPayments\\"'),
    false,
    "login HTML must not contain unrelated branch-dashboard translations",
  );
  assert.ok(
    Buffer.byteLength(html) < 100_000,
    `login HTML must stay below 100KB; received ${Buffer.byteLength(html)} bytes`,
  );
});

test("dashboard rendering does not depend on a public-origin self-fetch", async () => {
  const cookie = await authenticatedCookies("branch_manager");
  const response = await fetch(`${baseUrl}/branch-manager/dashboard`, {
    headers: {
      cookie,
      "x-forwarded-host": "unreachable.invalid",
      "x-forwarded-proto": "http",
    },
    signal: AbortSignal.timeout(5_000),
  });

  assert.equal(response.status, 200);
  assert.match(await response.text(), /live-board-loading|live-board/);
});
