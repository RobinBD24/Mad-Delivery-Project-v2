-- PHASE R — duplicate-checkout guard.
-- Additive and data-preserving: the new column is nullable, so every existing
-- order keeps its data and simply carries NULL. SQLite treats NULLs as distinct
-- in a UNIQUE index, so the many pre-existing orders per customer remain valid;
-- the constraint only binds once a checkout actually sends a key.
ALTER TABLE "Order" ADD COLUMN "idempotencyKey" TEXT;
CREATE UNIQUE INDEX "Order_customerId_idempotencyKey_key" ON "Order"("customerId", "idempotencyKey");
