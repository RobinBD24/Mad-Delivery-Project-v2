-- CreateTable
CREATE TABLE "RamadanConfig" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "branchId" INTEGER NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "bookingStartDate" DATETIME,
    "bookingEndDate" DATETIME,
    "advanceType" TEXT NOT NULL DEFAULT 'none',
    "advanceValue" DECIMAL NOT NULL DEFAULT 0,
    "advanceGuestThreshold" INTEGER NOT NULL DEFAULT 0,
    "paymentDeadlineHours" INTEGER NOT NULL DEFAULT 0,
    "cancellationPolicy" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RamadanConfig_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RamadanTimeSlot" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "branchId" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RamadanTimeSlot_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RamadanMenu" (
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
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RamadanMenu_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RamadanMenuItem" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "menuId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "RamadanMenuItem_menuId_fkey" FOREIGN KEY ("menuId") REFERENCES "RamadanMenu" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RamadanReservation" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "branchId" INTEGER NOT NULL,
    "customerId" INTEGER NOT NULL,
    "tableId" INTEGER,
    "slotId" INTEGER,
    "bookingDate" DATETIME NOT NULL,
    "guestName" TEXT NOT NULL,
    "guestPhone" TEXT NOT NULL,
    "partySize" INTEGER NOT NULL DEFAULT 2,
    "specialRequest" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'pending_payment',
    "rejectionReason" TEXT NOT NULL DEFAULT '',
    "menuId" INTEGER,
    "menuName" TEXT NOT NULL DEFAULT '',
    "menuDescription" TEXT NOT NULL DEFAULT '',
    "menuItemsSnapshot" TEXT NOT NULL DEFAULT '',
    "menuImage" TEXT,
    "menuUnitPrice" DECIMAL NOT NULL DEFAULT 0,
    "menuServingCapacity" INTEGER NOT NULL DEFAULT 0,
    "menuQuantity" INTEGER NOT NULL DEFAULT 1,
    "slotLabel" TEXT NOT NULL DEFAULT '',
    "totalAmount" DECIMAL NOT NULL DEFAULT 0,
    "advanceRequired" DECIMAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RamadanReservation_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RamadanReservation_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RamadanReservation_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "BranchTable" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "RamadanReservation_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "RamadanTimeSlot" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "RamadanReservation_menuId_fkey" FOREIGN KEY ("menuId") REFERENCES "RamadanMenu" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RamadanReservationPayment" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "reservationId" INTEGER NOT NULL,
    "branchId" INTEGER NOT NULL,
    "amount" DECIMAL NOT NULL DEFAULT 0,
    "paidAmount" DECIMAL NOT NULL DEFAULT 0,
    "refundedAmount" DECIMAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'unpaid',
    "method" TEXT NOT NULL DEFAULT 'demo',
    "gatewayRef" TEXT NOT NULL DEFAULT '',
    "idempotencyKey" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RamadanReservationPayment_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "RamadanReservation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "RamadanConfig_branchId_key" ON "RamadanConfig"("branchId");

-- CreateIndex
CREATE INDEX "RamadanTimeSlot_branchId_idx" ON "RamadanTimeSlot"("branchId");

-- CreateIndex
CREATE INDEX "RamadanMenu_branchId_idx" ON "RamadanMenu"("branchId");

-- CreateIndex
CREATE INDEX "RamadanMenuItem_menuId_idx" ON "RamadanMenuItem"("menuId");

-- CreateIndex
CREATE INDEX "RamadanReservation_branchId_bookingDate_idx" ON "RamadanReservation"("branchId", "bookingDate");

-- CreateIndex
CREATE INDEX "RamadanReservation_customerId_idx" ON "RamadanReservation"("customerId");

-- CreateIndex
CREATE INDEX "RamadanReservation_tableId_bookingDate_idx" ON "RamadanReservation"("tableId", "bookingDate");

-- CreateIndex
CREATE UNIQUE INDEX "RamadanReservationPayment_reservationId_key" ON "RamadanReservationPayment"("reservationId");

-- CreateIndex
CREATE UNIQUE INDEX "RamadanReservationPayment_idempotencyKey_key" ON "RamadanReservationPayment"("idempotencyKey");

-- CreateIndex
CREATE INDEX "RamadanReservationPayment_branchId_status_idx" ON "RamadanReservationPayment"("branchId", "status");
