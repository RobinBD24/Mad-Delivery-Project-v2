import assert from "node:assert/strict";
import { access, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { ensureIsolatedTestDatabaseFile } from "../../scripts/ensure-test-db.mjs";

const projectRoot = process.cwd();
const fixtureDirectory = path.join(
  projectRoot,
  "test-artifacts",
  "full-page-audit",
  "test-db-setup-fixture",
);
const fixtureDatabase = path.join(fixtureDirectory, "nested", "test.db");

test.beforeEach(async () => {
  await rm(fixtureDirectory, { recursive: true, force: true });
  await mkdir(fixtureDirectory, { recursive: true });
});

test.after(async () => {
  await rm(fixtureDirectory, { recursive: true, force: true });
});

test("creates a missing isolated SQLite file and is idempotent", async () => {
  await ensureIsolatedTestDatabaseFile({
    projectRoot,
    databasePath: fixtureDatabase,
  });
  await access(fixtureDatabase);

  await ensureIsolatedTestDatabaseFile({
    projectRoot,
    databasePath: fixtureDatabase,
  });
  await access(fixtureDatabase);
});

test("refuses to create a database outside the project root", async () => {
  await assert.rejects(
    ensureIsolatedTestDatabaseFile({
      projectRoot,
      databasePath: path.join(path.dirname(projectRoot), "outside-test.db"),
    }),
    /must stay inside the project root/,
  );
});

