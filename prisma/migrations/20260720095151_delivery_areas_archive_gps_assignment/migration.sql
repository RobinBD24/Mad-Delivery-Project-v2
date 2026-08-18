-- Round 2 additive migration: named delivery areas (#1) + order delivery
-- snapshots (#1/#13/#22), branch archive (#5), rider+customer latest GPS
-- (#12/#21), rider order-assignment response (#6/#7), customer-address
-- extension (#17). All additive: new tables + new nullable/defaulted
-- columns; SQLite table-rebuilds preserve every existing row via
-- INSERT...SELECT. No data backfill required.

-- AlterTable
ALTER TABLE "RiderProfile" ADD COLUMN "currentAccuracy" DECIMAL;

-- AlterTable
ALTER TABLE "User" ADD COLUMN "currentAccuracy" DECIMAL;
ALTER TABLE "User" ADD COLUMN "currentLat" DECIMAL;
ALTER TABLE "User" ADD COLUMN "currentLng" DECIMAL;
ALTER TABLE "User" ADD COLUMN "locationUpdatedAt" DATETIME;

-- CreateTable
CREATE TABLE "BranchDeliveryArea" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "branchId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL DEFAULT '',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isHeld" BOOLEAN NOT NULL DEFAULT false,
    "holdReason" TEXT NOT NULL DEFAULT '',
    "estimatedDeliveryMinutes" INTEGER NOT NULL DEFAULT 45,
    "deliveryCharge" DECIMAL NOT NULL DEFAULT 0,
    "centerLat" DECIMAL,
    "centerLng" DECIMAL,
    "updatedById" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BranchDeliveryArea_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RiderOrderAssignment" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "orderId" INTEGER NOT NULL,
    "riderId" INTEGER NOT NULL,
    "branchId" INTEGER NOT NULL,
    "sessionId" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "distanceKm" DECIMAL,
    "rejectionReason" TEXT NOT NULL DEFAULT '',
    "respondedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RiderOrderAssignment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RiderOrderAssignment_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
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
    "prepTimeMinutes" INTEGER NOT NULL DEFAULT 30,
    "pickupEnabled" BOOLEAN NOT NULL DEFAULT true,
    "pickupAddress" TEXT NOT NULL DEFAULT '',
    "pickupPhone" TEXT NOT NULL DEFAULT '',
    "bkashNumber" TEXT NOT NULL DEFAULT '',
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
INSERT INTO "new_Branch" ("address", "bkashNumber", "brandType", "closingTime", "createdAt", "deliveryRadiusKm", "email", "holdReason", "id", "isActive", "latitude", "logo", "longitude", "managerId", "name", "openingTime", "phone", "pickupAddress", "pickupEnabled", "pickupPhone", "prepTimeMinutes", "updatedAt") SELECT "address", "bkashNumber", "brandType", "closingTime", "createdAt", "deliveryRadiusKm", "email", "holdReason", "id", "isActive", "latitude", "logo", "longitude", "managerId", "name", "openingTime", "phone", "pickupAddress", "pickupEnabled", "pickupPhone", "prepTimeMinutes", "updatedAt" FROM "Branch";
DROP TABLE "Branch";
ALTER TABLE "new_Branch" RENAME TO "Branch";
CREATE TABLE "new_CustomerAddress" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "customLabel" TEXT NOT NULL DEFAULT '',
    "address" TEXT NOT NULL,
    "area" TEXT NOT NULL DEFAULT '',
    "instructions" TEXT NOT NULL DEFAULT '',
    "latitude" DECIMAL,
    "longitude" DECIMAL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CustomerAddress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_CustomerAddress" ("address", "createdAt", "id", "isDefault", "label", "latitude", "longitude", "updatedAt", "userId") SELECT "address", "createdAt", "id", "isDefault", "label", "latitude", "longitude", "updatedAt", "userId" FROM "CustomerAddress";
DROP TABLE "CustomerAddress";
ALTER TABLE "new_CustomerAddress" RENAME TO "CustomerAddress";
CREATE INDEX "CustomerAddress_userId_idx" ON "CustomerAddress"("userId");
CREATE TABLE "new_Order" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "orderNumber" TEXT,
    "customerId" INTEGER NOT NULL,
    "branchId" INTEGER NOT NULL,
    "riderId" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "paymentMethod" TEXT NOT NULL DEFAULT 'cash',
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Order_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Order_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Order_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Order_deliveryAreaId_fkey" FOREIGN KEY ("deliveryAreaId") REFERENCES "BranchDeliveryArea" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Order" ("branchId", "couponId", "createdAt", "customerId", "deliveryAddress", "deliveryLat", "deliveryLng", "discountAmount", "foodNotes", "fulfillmentType", "id", "orderNumber", "paymentMethod", "prepTimeSnapshot", "riderId", "status", "totalAmount", "updatedAt") SELECT "branchId", "couponId", "createdAt", "customerId", "deliveryAddress", "deliveryLat", "deliveryLng", "discountAmount", "foodNotes", "fulfillmentType", "id", "orderNumber", "paymentMethod", "prepTimeSnapshot", "riderId", "status", "totalAmount", "updatedAt" FROM "Order";
DROP TABLE "Order";
ALTER TABLE "new_Order" RENAME TO "Order";
CREATE UNIQUE INDEX "Order_orderNumber_key" ON "Order"("orderNumber");
CREATE INDEX "Order_branchId_idx" ON "Order"("branchId");
CREATE INDEX "Order_customerId_idx" ON "Order"("customerId");
CREATE INDEX "Order_riderId_idx" ON "Order"("riderId");
CREATE INDEX "Order_status_idx" ON "Order"("status");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "BranchDeliveryArea_branchId_idx" ON "BranchDeliveryArea"("branchId");

-- CreateIndex
CREATE UNIQUE INDEX "BranchDeliveryArea_branchId_normalizedName_key" ON "BranchDeliveryArea"("branchId", "normalizedName");

-- CreateIndex
CREATE INDEX "RiderOrderAssignment_orderId_status_idx" ON "RiderOrderAssignment"("orderId", "status");

-- CreateIndex
CREATE INDEX "RiderOrderAssignment_riderId_status_idx" ON "RiderOrderAssignment"("riderId", "status");

