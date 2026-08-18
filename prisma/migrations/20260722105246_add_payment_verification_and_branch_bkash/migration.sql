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
    "deliveryFee" DECIMAL NOT NULL DEFAULT 0,
    "brandType" TEXT NOT NULL DEFAULT 'combined',
    "prepTimeMinutes" INTEGER NOT NULL DEFAULT 30,
    "pickupEnabled" BOOLEAN NOT NULL DEFAULT true,
    "pickupAddress" TEXT NOT NULL DEFAULT '',
    "pickupPhone" TEXT NOT NULL DEFAULT '',
    "bkashNumber" TEXT NOT NULL DEFAULT '',
    "bkashEnabled" BOOLEAN NOT NULL DEFAULT false,
    "bkashInstructions" TEXT NOT NULL DEFAULT '',
    "managerId" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "holdReason" TEXT NOT NULL DEFAULT '',
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" DATETIME,
    "archivedById" INTEGER,
    "openingTime" TEXT,
    "closingTime" TEXT,
    "logo" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Branch_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Branch" ("address", "archivedAt", "archivedById", "bkashNumber", "brandType", "closingTime", "createdAt", "deliveryFee", "deliveryRadiusKm", "email", "holdReason", "id", "isActive", "isArchived", "latitude", "logo", "longitude", "managerId", "name", "openingTime", "phone", "pickupAddress", "pickupEnabled", "pickupPhone", "prepTimeMinutes", "updatedAt") SELECT "address", "archivedAt", "archivedById", "bkashNumber", "brandType", "closingTime", "createdAt", "deliveryFee", "deliveryRadiusKm", "email", "holdReason", "id", "isActive", "isArchived", "latitude", "logo", "longitude", "managerId", "name", "openingTime", "phone", "pickupAddress", "pickupEnabled", "pickupPhone", "prepTimeMinutes", "updatedAt" FROM "Branch";
DROP TABLE "Branch";
ALTER TABLE "new_Branch" RENAME TO "Branch";
CREATE TABLE "new_Order" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "orderNumber" TEXT,
    "customerId" INTEGER NOT NULL,
    "branchId" INTEGER NOT NULL,
    "riderId" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "paymentMethod" TEXT NOT NULL DEFAULT 'cash',
    "paymentStatus" TEXT NOT NULL DEFAULT 'unpaid',
    "bkashTransactionId" TEXT NOT NULL DEFAULT '',
    "bkashPayerPhone" TEXT NOT NULL DEFAULT '',
    "bkashDestinationNumber" TEXT NOT NULL DEFAULT '',
    "paymentSubmittedAt" DATETIME,
    "paymentVerifiedById" INTEGER,
    "paymentVerifiedAt" DATETIME,
    "paymentRejectionReason" TEXT NOT NULL DEFAULT '',
    "totalAmount" DECIMAL NOT NULL DEFAULT 0,
    "couponId" INTEGER,
    "discountAmount" DECIMAL NOT NULL DEFAULT 0,
    "foodNotes" TEXT NOT NULL DEFAULT '',
    "prepTimeSnapshot" INTEGER,
    "fulfillmentType" TEXT NOT NULL DEFAULT 'delivery',
    "deliveryLat" DECIMAL,
    "deliveryLng" DECIMAL,
    "deliveryAddress" TEXT NOT NULL,
    "deliveryAreaId" INTEGER,
    "deliveryAreaName" TEXT NOT NULL DEFAULT '',
    "deliveryCharge" DECIMAL NOT NULL DEFAULT 0,
    "deliveryEstimateMinutes" INTEGER,
    "deliveryDistanceKm" DECIMAL,
    "deliveryRadiusKmSnapshot" DECIMAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Order_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Order_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Order_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Order_deliveryAreaId_fkey" FOREIGN KEY ("deliveryAreaId") REFERENCES "BranchDeliveryArea" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Order" ("branchId", "couponId", "createdAt", "customerId", "deliveryAddress", "deliveryAreaId", "deliveryAreaName", "deliveryCharge", "deliveryDistanceKm", "deliveryEstimateMinutes", "deliveryLat", "deliveryLng", "deliveryRadiusKmSnapshot", "discountAmount", "foodNotes", "fulfillmentType", "id", "orderNumber", "paymentMethod", "prepTimeSnapshot", "riderId", "status", "totalAmount", "updatedAt") SELECT "branchId", "couponId", "createdAt", "customerId", "deliveryAddress", "deliveryAreaId", "deliveryAreaName", "deliveryCharge", "deliveryDistanceKm", "deliveryEstimateMinutes", "deliveryLat", "deliveryLng", "deliveryRadiusKmSnapshot", "discountAmount", "foodNotes", "fulfillmentType", "id", "orderNumber", "paymentMethod", "prepTimeSnapshot", "riderId", "status", "totalAmount", "updatedAt" FROM "Order";
DROP TABLE "Order";
ALTER TABLE "new_Order" RENAME TO "Order";
CREATE UNIQUE INDEX "Order_orderNumber_key" ON "Order"("orderNumber");
CREATE INDEX "Order_branchId_idx" ON "Order"("branchId");
CREATE INDEX "Order_customerId_idx" ON "Order"("customerId");
CREATE INDEX "Order_riderId_idx" ON "Order"("riderId");
CREATE INDEX "Order_status_idx" ON "Order"("status");
CREATE INDEX "Order_bkashTransactionId_idx" ON "Order"("bkashTransactionId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
