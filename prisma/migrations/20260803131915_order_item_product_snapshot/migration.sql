-- Immutable product snapshot on each order line.
--
-- Prisma's generated version rebuilt the whole OrderItem table (create / copy /
-- DROP / rename). That is unnecessary here: both columns are additive and
-- nullable-or-defaulted, so SQLite can add them in place. Written as plain
-- ALTER TABLE statements so the live table is never dropped and no row is ever
-- copied between tables.
ALTER TABLE "OrderItem" ADD COLUMN "productName" TEXT NOT NULL DEFAULT '';
ALTER TABLE "OrderItem" ADD COLUMN "productImage" TEXT;

-- Backfill existing lines from the product they point at. This is the best
-- value available for rows written before the snapshot existed; it is exact for
-- every product that has not been renamed since, and it is the same string those
-- rows already displayed (they read the live relation). From here on the value
-- is written once at order time and never updated.
UPDATE "OrderItem"
SET "productName" = COALESCE((SELECT "name" FROM "Product" WHERE "Product"."id" = "OrderItem"."productId"), ''),
    "productImage" = (SELECT "image" FROM "Product" WHERE "Product"."id" = "OrderItem"."productId")
WHERE "productName" = '';
