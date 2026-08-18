import "server-only";
import { Prisma } from "@prisma/client";

/**
 * Unique, human-readable order numbers (req #15): ORD-YYYYMMDD-000001.
 *
 * The date segment is the UTC calendar day — the project's authoritative date
 * basis (attendance, settlements, Ramadan dates are all stored/normalized at
 * UTC), so the order number's day matches every other date in the system.
 * The 6-wide sequence resets per day and is never reused.
 */

/** UTC date key "YYYYMMDD" backing the per-day counter + number prefix. */
export function orderDateKey(d: Date = new Date()): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

/** Format a reserved (dateKey, seq) into the customer-facing order number. */
export function formatOrderNumber(dateKey: string, seq: number): string {
  return `ORD-${dateKey}-${String(seq).padStart(6, "0")}`;
}

/**
 * Reserve the next unique order number for `date` (default now, UTC) with an
 * atomic upsert+increment on OrderNumberCounter. The counter row is locked for
 * the increment (row-lock on Postgres, write-serialized on SQLite), so two
 * orders created concurrently can never receive the same sequence. Must run
 * inside the same transaction that creates the order, so a rolled-back order
 * releases its sequence instead of leaving the row half-written. The unique
 * index on Order.orderNumber is the final backstop.
 *
 * A gap (from a rolled-back transaction) is acceptable — the guarantee is
 * uniqueness + no reuse, not contiguity.
 */
export async function nextOrderNumber(
  tx: Prisma.TransactionClient,
  date: Date = new Date(),
): Promise<string> {
  const dateKey = orderDateKey(date);
  const row = await tx.orderNumberCounter.upsert({
    where: { dateKey },
    create: { dateKey, seq: 1 },
    update: { seq: { increment: 1 } },
  });
  return formatOrderNumber(dateKey, row.seq);
}
