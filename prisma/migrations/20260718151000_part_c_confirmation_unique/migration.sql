-- Swap the per-order unique confirmation for a per-(order,rider) unique so a
-- reassigned rider can record their own confirmation while the previous one is
-- retained as audit. Index-only change (tables empty at this point).
DROP INDEX IF EXISTS "OrderReceiveConfirmation_orderId_key";
CREATE UNIQUE INDEX "OrderReceiveConfirmation_orderId_riderId_key" ON "OrderReceiveConfirmation"("orderId", "riderId");
CREATE INDEX IF NOT EXISTS "OrderReceiveConfirmation_orderId_idx" ON "OrderReceiveConfirmation"("orderId");
