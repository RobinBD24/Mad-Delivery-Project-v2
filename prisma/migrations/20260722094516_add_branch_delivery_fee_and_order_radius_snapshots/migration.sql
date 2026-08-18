-- AlterTable
ALTER TABLE "Order" ADD COLUMN "deliveryDistanceKm" DECIMAL;
ALTER TABLE "Order" ADD COLUMN "deliveryRadiusKmSnapshot" DECIMAL;

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
INSERT INTO "new_Branch" ("address", "archivedAt", "archivedById", "bkashNumber", "brandType", "closingTime", "createdAt", "deliveryRadiusKm", "email", "holdReason", "id", "isActive", "isArchived", "latitude", "logo", "longitude", "managerId", "name", "openingTime", "phone", "pickupAddress", "pickupEnabled", "pickupPhone", "prepTimeMinutes", "updatedAt") SELECT "address", "archivedAt", "archivedById", "bkashNumber", "brandType", "closingTime", "createdAt", "deliveryRadiusKm", "email", "holdReason", "id", "isActive", "isArchived", "latitude", "logo", "longitude", "managerId", "name", "openingTime", "phone", "pickupAddress", "pickupEnabled", "pickupPhone", "prepTimeMinutes", "updatedAt" FROM "Branch";
DROP TABLE "Branch";
ALTER TABLE "new_Branch" RENAME TO "Branch";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
