-- CreateTable
CREATE TABLE "RewardEarningRule" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "fixedPoints" INTEGER NOT NULL DEFAULT 0,
    "pointsPerCurrency" REAL NOT NULL DEFAULT 0,
    "minOrderAmount" REAL NOT NULL DEFAULT 0,
    "eligibleOrderStatus" TEXT NOT NULL DEFAULT 'delivered',
    "eligiblePaymentStatus" TEXT NOT NULL DEFAULT 'any',
    "startsAt" DATETIME,
    "endsAt" DATETIME,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "branchId" INTEGER,
    "createdById" INTEGER,
    "updatedById" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RewardEarningRule_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "RewardEarningRule_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "RewardEarningRule_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EmployeeTeam" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "branchId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "EmployeeTeam_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_BranchEmployee" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "branchId" INTEGER NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL DEFAULT '',
    "employeeCode" TEXT NOT NULL,
    "phone" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "photo" TEXT,
    "joiningDate" DATETIME,
    "department" TEXT NOT NULL DEFAULT '',
    "role" TEXT NOT NULL DEFAULT 'waiter',
    "customRole" TEXT NOT NULL DEFAULT '',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "employmentStatus" TEXT NOT NULL DEFAULT 'active',
    "quitAt" DATETIME,
    "quitReason" TEXT NOT NULL DEFAULT '',
    "teamId" INTEGER,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BranchEmployee_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BranchEmployee_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "EmployeeTeam" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_BranchEmployee" ("branchId", "createdAt", "department", "email", "employeeCode", "firstName", "id", "isActive", "joiningDate", "lastName", "notes", "phone", "photo", "role", "updatedAt") SELECT "branchId", "createdAt", "department", "email", "employeeCode", "firstName", "id", "isActive", "joiningDate", "lastName", "notes", "phone", "photo", "role", "updatedAt" FROM "BranchEmployee";
DROP TABLE "BranchEmployee";
ALTER TABLE "new_BranchEmployee" RENAME TO "BranchEmployee";
CREATE INDEX "BranchEmployee_branchId_idx" ON "BranchEmployee"("branchId");
CREATE INDEX "BranchEmployee_branchId_role_idx" ON "BranchEmployee"("branchId", "role");
CREATE INDEX "BranchEmployee_branchId_employmentStatus_idx" ON "BranchEmployee"("branchId", "employmentStatus");
CREATE INDEX "BranchEmployee_teamId_idx" ON "BranchEmployee"("teamId");
CREATE UNIQUE INDEX "BranchEmployee_branchId_employeeCode_key" ON "BranchEmployee"("branchId", "employeeCode");
CREATE TABLE "new_RamadanMenu" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "branchId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "image" TEXT,
    "price" DECIMAL NOT NULL,
    "compareAtPrice" DECIMAL,
    "servingCapacity" INTEGER NOT NULL DEFAULT 4,
    "startDate" DATETIME,
    "endDate" DATETIME,
    "allowedSlots" TEXT NOT NULL DEFAULT '',
    "minGuests" INTEGER NOT NULL DEFAULT 0,
    "maxGuests" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RamadanMenu_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_RamadanMenu" ("allowedSlots", "branchId", "compareAtPrice", "createdAt", "description", "endDate", "id", "image", "isActive", "maxGuests", "minGuests", "name", "price", "servingCapacity", "sortOrder", "startDate", "updatedAt") SELECT "allowedSlots", "branchId", "compareAtPrice", "createdAt", "description", "endDate", "id", "image", "isActive", "maxGuests", "minGuests", "name", "price", "servingCapacity", "sortOrder", "startDate", "updatedAt" FROM "RamadanMenu";
DROP TABLE "RamadanMenu";
ALTER TABLE "new_RamadanMenu" RENAME TO "RamadanMenu";
CREATE INDEX "RamadanMenu_branchId_idx" ON "RamadanMenu"("branchId");
CREATE TABLE "new_RewardLedger" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "coins" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ruleId" INTEGER,
    CONSTRAINT "RewardLedger_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RewardLedger_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "RewardEarningRule" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_RewardLedger" ("coins", "createdAt", "dedupeKey", "id", "reason", "userId") SELECT "coins", "createdAt", "dedupeKey", "id", "reason", "userId" FROM "RewardLedger";
DROP TABLE "RewardLedger";
ALTER TABLE "new_RewardLedger" RENAME TO "RewardLedger";
CREATE INDEX "RewardLedger_userId_createdAt_idx" ON "RewardLedger"("userId", "createdAt");
CREATE UNIQUE INDEX "RewardLedger_userId_reason_dedupeKey_key" ON "RewardLedger"("userId", "reason", "dedupeKey");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "RewardEarningRule_isActive_isArchived_priority_idx" ON "RewardEarningRule"("isActive", "isArchived", "priority");

-- CreateIndex
CREATE INDEX "RewardEarningRule_branchId_idx" ON "RewardEarningRule"("branchId");

-- CreateIndex
CREATE INDEX "EmployeeTeam_branchId_idx" ON "EmployeeTeam"("branchId");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeTeam_branchId_name_key" ON "EmployeeTeam"("branchId", "name");
