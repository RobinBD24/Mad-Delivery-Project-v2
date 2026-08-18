import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { createActionURL } from "../node_modules/@auth/core/lib/utils/env.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function parseEnv(source) {
  return Object.fromEntries(
    source
      .split(/\r?\n/)
      .map((line) => line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*["']?([^"'#]*)/))
      .filter(Boolean)
      .map((match) => [match[1], match[2].trim()]),
  );
}

test("Auth.js sign-out URL follows the incoming request origin", async () => {
  const runtimeEnv = parseEnv(await readFile(path.join(projectRoot, ".env"), "utf8"));
  const headers = new Headers({
    host: "development.example:4310",
    "x-forwarded-host": "development.example:4310",
    "x-forwarded-proto": "http",
  });

  const signOutUrl = createActionURL("signout", "http", headers, runtimeEnv, {
    basePath: "/api/auth",
  });

  assert.equal(signOutUrl.origin, "http://development.example:4310");
  assert.equal(signOutUrl.pathname, "/api/auth/signout");
});
