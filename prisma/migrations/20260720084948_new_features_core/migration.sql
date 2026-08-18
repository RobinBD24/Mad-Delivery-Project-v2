-- New features core (req #4 product soft-delete, #8 global category scope,
-- #15 unique order number). Additive + data-preserving. Dev = SQLite; the
-- SQLite-specific backfill (strftime/substr) has a Postgres equivalent noted
-- below for the production deploy.

-- ── #15: unique, immutable, human-readable order number ────────────────
ALTER TABLE "Order" ADD COLUMN "orderNumber" TEXT;

-- ── #4: super-admin product soft delete (history-safe) ─────────────────
ALTER TABLE "Product" ADD COLUMN "deletedAt" DATETIME;
ALTER TABLE "Product" ADD COLUMN "deletedById" INTEGER;

-- ── #15: per-day monotonic counter backing the order number ────────────
CREATE TABLE "OrderNumberCounter" (
    "dateKey" TEXT NOT NULL PRIMARY KEY,
    "seq" INTEGER NOT NULL DEFAULT 0
);

-- ── #8: Category.branchId → nullable (NULL = global "Main Branch") + a
--        normalizedName used for scoped duplicate prevention ─────────────
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Category" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "branchId" INTEGER,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Category_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Category" ("branchId", "createdAt", "description", "id", "isActive", "name", "updatedAt") SELECT "branchId", "createdAt", "description", "id", "isActive", "name", "updatedAt" FROM "Category";
DROP TABLE "Category";
ALTER TABLE "new_Category" RENAME TO "Category";
CREATE INDEX "Category_branchId_idx" ON "Category"("branchId");
CREATE INDEX "Category_normalizedName_idx" ON "Category"("normalizedName");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- Unique index on the order number (multiple NULLs allowed pre-backfill in SQLite).
CREATE UNIQUE INDEX "Order_orderNumber_key" ON "Order"("orderNumber");

-- ── Backfill: normalized category names (lower(trim)) ──────────────────
UPDATE "Category" SET "normalizedName" = lower(trim("name")) WHERE "normalizedName" = '';

-- ── Backfill: deterministic, collision-safe order numbers ──────────────
-- Per-UTC-day 1-based sequence ordered by (createdAt, id). Matches the runtime
-- generator's format ORD-YYYYMMDD-000001 and UTC date key.
-- NOTE: Prisma stores SQLite DateTime as epoch-MILLISECONDS, so the date key is
--   strftime('%Y%m%d', "createdAt"/1000, 'unixepoch').
-- Postgres equivalent (createdAt is a real timestamptz):
--   to_char(("createdAt" AT TIME ZONE 'UTC'), 'YYYYMMDD') and lpad(seq::text,6,'0').
UPDATE "Order"
SET "orderNumber" = 'ORD-' || strftime('%Y%m%d', "createdAt" / 1000, 'unixepoch') || '-' ||
  substr('000000' || (
    SELECT COUNT(*) FROM "Order" AS o2
    WHERE strftime('%Y%m%d', o2."createdAt" / 1000, 'unixepoch') = strftime('%Y%m%d', "Order"."createdAt" / 1000, 'unixepoch')
      AND (o2."createdAt" < "Order"."createdAt"
           OR (o2."createdAt" = "Order"."createdAt" AND o2."id" <= "Order"."id"))
  ), -6)
WHERE "orderNumber" IS NULL;

-- Seed the counter to the highest sequence used per day so new orders continue
-- without ever reusing a number.
INSERT INTO "OrderNumberCounter" ("dateKey", "seq")
SELECT strftime('%Y%m%d', "createdAt" / 1000, 'unixepoch') AS dk, COUNT(*) AS c
FROM "Order"
GROUP BY dk;
