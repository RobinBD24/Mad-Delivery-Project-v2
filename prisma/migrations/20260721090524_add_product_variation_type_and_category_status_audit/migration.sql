-- AlterTable
ALTER TABLE "Category" ADD COLUMN "statusChangedAt" DATETIME;
ALTER TABLE "Category" ADD COLUMN "statusChangedById" INTEGER;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_OrderItem" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "orderId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "variationId" INTEGER,
    "variationName" TEXT NOT NULL DEFAULT '',
    "variationType" TEXT NOT NULL DEFAULT '',
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL NOT NULL,
    "foodNote" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "OrderItem_variationId_fkey" FOREIGN KEY ("variationId") REFERENCES "ProductVariation" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_OrderItem" ("foodNote", "id", "orderId", "productId", "quantity", "unitPrice", "variationId", "variationName") SELECT "foodNote", "id", "orderId", "productId", "quantity", "unitPrice", "variationId", "variationName" FROM "OrderItem";
DROP TABLE "OrderItem";
ALTER TABLE "new_OrderItem" RENAME TO "OrderItem";
CREATE TABLE "new_Product" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "branchId" INTEGER NOT NULL,
    "categoryId" INTEGER,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "price" DECIMAL NOT NULL,
    "brand" TEXT,
    "discount" DECIMAL NOT NULL DEFAULT 0,
    "image" TEXT,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "deactivationReason" TEXT NOT NULL DEFAULT '',
    "heldByAdmin" BOOLEAN NOT NULL DEFAULT false,
    "preparationTime" INTEGER NOT NULL DEFAULT 20,
    "isPopular" BOOLEAN NOT NULL DEFAULT false,
    "isRecommended" BOOLEAN NOT NULL DEFAULT false,
    "variationType" TEXT NOT NULL DEFAULT 'THICK',
    "deletedAt" DATETIME,
    "deletedById" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Product_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Product" ("branchId", "brand", "categoryId", "createdAt", "deactivationReason", "deletedAt", "deletedById", "description", "discount", "heldByAdmin", "id", "image", "isAvailable", "isPopular", "isRecommended", "name", "preparationTime", "price", "updatedAt") SELECT "branchId", "brand", "categoryId", "createdAt", "deactivationReason", "deletedAt", "deletedById", "description", "discount", "heldByAdmin", "id", "image", "isAvailable", "isPopular", "isRecommended", "name", "preparationTime", "price", "updatedAt" FROM "Product";
DROP TABLE "Product";
ALTER TABLE "new_Product" RENAME TO "Product";
CREATE INDEX "Product_branchId_idx" ON "Product"("branchId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- req #4 BACKFILL (additive, non-destructive; no variation rows are touched).
-- Infer each existing product's crust policy from its ProductVariation rows:
--   * has a variation whose variantType/name/sizeLabel mentions BOTH thin and
--     thick  -> 'BOTH'
--   * mentions only thin                          -> 'THIN'
--   * mentions only thick                         -> 'THICK'
--   * no reliable crust signal                    -> 'THICK' (documented safe
--     default: a single fixed crust, so no legacy product suddenly demands a
--     new mandatory customer choice).
UPDATE "Product"
SET "variationType" = 'BOTH'
WHERE EXISTS (
        SELECT 1 FROM "ProductVariation" v WHERE v."productId" = "Product"."id"
          AND (LOWER(v."variantType") LIKE '%thin%' OR LOWER(v."name") LIKE '%thin%' OR LOWER(v."sizeLabel") LIKE '%thin%')
      )
  AND EXISTS (
        SELECT 1 FROM "ProductVariation" v WHERE v."productId" = "Product"."id"
          AND (LOWER(v."variantType") LIKE '%thick%' OR LOWER(v."name") LIKE '%thick%' OR LOWER(v."sizeLabel") LIKE '%thick%')
      );

UPDATE "Product"
SET "variationType" = 'THIN'
WHERE "variationType" <> 'BOTH'
  AND EXISTS (
        SELECT 1 FROM "ProductVariation" v WHERE v."productId" = "Product"."id"
          AND (LOWER(v."variantType") LIKE '%thin%' OR LOWER(v."name") LIKE '%thin%' OR LOWER(v."sizeLabel") LIKE '%thin%')
      )
  AND NOT EXISTS (
        SELECT 1 FROM "ProductVariation" v WHERE v."productId" = "Product"."id"
          AND (LOWER(v."variantType") LIKE '%thick%' OR LOWER(v."name") LIKE '%thick%' OR LOWER(v."sizeLabel") LIKE '%thick%')
      );
