-- CreateTable
CREATE TABLE "RiderRoutePoint" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "riderId" INTEGER NOT NULL,
    "lat" DECIMAL NOT NULL,
    "lng" DECIMAL NOT NULL,
    "orderId" INTEGER,
    "recordedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RiderRoutePoint_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LoginHistory" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "ipAddress" TEXT NOT NULL DEFAULT '',
    "userAgent" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LoginHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_RiderProfile" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "assignedBranchId" INTEGER,
    "bloodGroup" TEXT NOT NULL DEFAULT '',
    "education" TEXT NOT NULL DEFAULT '',
    "presentAddress" TEXT NOT NULL DEFAULT '',
    "permanentAddress" TEXT NOT NULL DEFAULT '',
    "nidNumber" TEXT NOT NULL DEFAULT '',
    "drivingLicenseNumber" TEXT NOT NULL DEFAULT '',
    "bikeRegistrationNumber" TEXT NOT NULL DEFAULT '',
    "vehicleType" TEXT NOT NULL DEFAULT '',
    "emergencyContactName" TEXT NOT NULL DEFAULT '',
    "emergencyContactPhone" TEXT NOT NULL DEFAULT '',
    "nidFrontImage" TEXT,
    "nidBackImage" TEXT,
    "licenseImage" TEXT,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "currentLat" DECIMAL,
    "currentLng" DECIMAL,
    "lastPingAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RiderProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RiderProfile_assignedBranchId_fkey" FOREIGN KEY ("assignedBranchId") REFERENCES "Branch" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_RiderProfile" ("assignedBranchId", "bikeRegistrationNumber", "bloodGroup", "createdAt", "drivingLicenseNumber", "education", "emergencyContactName", "emergencyContactPhone", "id", "licenseImage", "nidBackImage", "nidFrontImage", "nidNumber", "permanentAddress", "presentAddress", "updatedAt", "userId", "vehicleType") SELECT "assignedBranchId", "bikeRegistrationNumber", "bloodGroup", "createdAt", "drivingLicenseNumber", "education", "emergencyContactName", "emergencyContactPhone", "id", "licenseImage", "nidBackImage", "nidFrontImage", "nidNumber", "permanentAddress", "presentAddress", "updatedAt", "userId", "vehicleType" FROM "RiderProfile";
DROP TABLE "RiderProfile";
ALTER TABLE "new_RiderProfile" RENAME TO "RiderProfile";
CREATE UNIQUE INDEX "RiderProfile_userId_key" ON "RiderProfile"("userId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "RiderRoutePoint_riderId_recordedAt_idx" ON "RiderRoutePoint"("riderId", "recordedAt");

-- CreateIndex
CREATE INDEX "LoginHistory_userId_createdAt_idx" ON "LoginHistory"("userId", "createdAt");
