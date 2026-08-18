-- AlterTable
ALTER TABLE "Product" ADD COLUMN "brand" TEXT;

-- CreateTable
CREATE TABLE "ProductVariation" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "productId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "sizeLabel" TEXT NOT NULL DEFAULT '',
    "price" DECIMAL NOT NULL,
    "compareAtPrice" DECIMAL,
    "servingInfo" TEXT NOT NULL DEFAULT '',
    "variantType" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProductVariation_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Branch" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL DEFAULT '',
    "latitude" DECIMAL,
    "longitude" DECIMAL,
    "deliveryRadiusKm" DECIMAL NOT NULL DEFAULT 3.0,
    "brandType" TEXT NOT NULL DEFAULT 'combined',
    "bkashNumber" TEXT NOT NULL DEFAULT '',
    "managerId" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "holdReason" TEXT NOT NULL DEFAULT '',
    "openingTime" TEXT,
    "closingTime" TEXT,
    "logo" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Branch_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Branch" ("address", "bkashNumber", "closingTime", "createdAt", "deliveryRadiusKm", "email", "holdReason", "id", "isActive", "latitude", "logo", "longitude", "managerId", "name", "openingTime", "phone", "updatedAt") SELECT "address", "bkashNumber", "closingTime", "createdAt", "deliveryRadiusKm", "email", "holdReason", "id", "isActive", "latitude", "logo", "longitude", "managerId", "name", "openingTime", "phone", "updatedAt" FROM "Branch";
DROP TABLE "Branch";
ALTER TABLE "new_Branch" RENAME TO "Branch";
CREATE TABLE "new_OrderItem" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "orderId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "variationId" INTEGER,
    "variationName" TEXT NOT NULL DEFAULT '',
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL NOT NULL,
    "foodNote" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "OrderItem_variationId_fkey" FOREIGN KEY ("variationId") REFERENCES "ProductVariation" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_OrderItem" ("foodNote", "id", "orderId", "productId", "quantity", "unitPrice") SELECT "foodNote", "id", "orderId", "productId", "quantity", "unitPrice" FROM "OrderItem";
DROP TABLE "OrderItem";
ALTER TABLE "new_OrderItem" RENAME TO "OrderItem";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "ProductVariation_productId_idx" ON "ProductVariation"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductVariation_productId_name_key" ON "ProductVariation"("productId", "name");

-- Data backfill: give every existing product one default "Regular" variation
-- carrying its prior single price, so pricing keeps working after variations
-- become the source of truth. Product.price is retained as a fallback.
INSERT INTO "ProductVariation" ("productId", "name", "price", "isDefault", "isEnabled", "sortOrder", "updatedAt")
SELECT "id", 'Regular', "price", true, true, 0, CURRENT_TIMESTAMP FROM "Product";

-- Historical order lines predate variations: label them with the product name
-- so past orders remain readable. variationId stays NULL (they were not tied to
-- a specific variation); unitPrice snapshot is untouched.
UPDATE "OrderItem"
SET "variationName" = COALESCE((SELECT "name" FROM "Product" WHERE "Product"."id" = "OrderItem"."productId"), '')
WHERE "variationName" = '';
