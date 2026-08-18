-- CreateTable
CREATE TABLE "RiderBranchDutySession" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "riderId" INTEGER NOT NULL,
    "branchId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" DATETIME,
    "endReason" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RiderBranchDutySession_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RiderBranchDutySession_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OrderReceiveConfirmation" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "orderId" INTEGER NOT NULL,
    "riderId" INTEGER NOT NULL,
    "branchId" INTEGER NOT NULL,
    "sessionId" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'confirmed',
    "confirmedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrderReceiveConfirmation_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OrderReceiveConfirmation_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OrderReceiveConfirmation_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OrderReceiveConfirmation_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "RiderBranchDutySession" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RiderDutyChatThread" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "sessionId" INTEGER NOT NULL,
    "riderId" INTEGER NOT NULL,
    "branchId" INTEGER NOT NULL,
    "isClosed" BOOLEAN NOT NULL DEFAULT false,
    "riderLastReadAt" DATETIME,
    "managerLastReadAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RiderDutyChatThread_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "RiderBranchDutySession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RiderDutyChatMessage" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "threadId" INTEGER NOT NULL,
    "senderId" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RiderDutyChatMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "RiderDutyChatThread" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RiderDutyChatMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OrderDeliveryChatThread" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "orderId" INTEGER NOT NULL,
    "riderId" INTEGER NOT NULL,
    "customerId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "riderLastReadAt" DATETIME,
    "customerLastReadAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OrderDeliveryChatThread_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OrderDeliveryChatMessage" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "threadId" INTEGER NOT NULL,
    "senderId" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrderDeliveryChatMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "OrderDeliveryChatThread" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OrderDeliveryChatMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "RiderBranchDutySession_riderId_status_idx" ON "RiderBranchDutySession"("riderId", "status");

-- CreateIndex
CREATE INDEX "RiderBranchDutySession_branchId_status_idx" ON "RiderBranchDutySession"("branchId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "OrderReceiveConfirmation_orderId_key" ON "OrderReceiveConfirmation"("orderId");

-- CreateIndex
CREATE INDEX "OrderReceiveConfirmation_riderId_idx" ON "OrderReceiveConfirmation"("riderId");

-- CreateIndex
CREATE INDEX "OrderReceiveConfirmation_branchId_idx" ON "OrderReceiveConfirmation"("branchId");

-- CreateIndex
CREATE UNIQUE INDEX "RiderDutyChatThread_sessionId_key" ON "RiderDutyChatThread"("sessionId");

-- CreateIndex
CREATE INDEX "RiderDutyChatThread_branchId_idx" ON "RiderDutyChatThread"("branchId");

-- CreateIndex
CREATE INDEX "RiderDutyChatMessage_threadId_idx" ON "RiderDutyChatMessage"("threadId");

-- CreateIndex
CREATE INDEX "OrderDeliveryChatThread_orderId_status_idx" ON "OrderDeliveryChatThread"("orderId", "status");

-- CreateIndex
CREATE INDEX "OrderDeliveryChatThread_riderId_idx" ON "OrderDeliveryChatThread"("riderId");

-- CreateIndex
CREATE INDEX "OrderDeliveryChatMessage_threadId_idx" ON "OrderDeliveryChatMessage"("threadId");
