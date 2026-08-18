import { requireApproved } from "@/lib/auth/current-user";
import { handle } from "@/lib/http/errors";
import { json } from "@/lib/http/respond";
import { ramadanTransactions } from "@/lib/services/ramadan";

// GET /api/ramadan/transactions — accounts/management/SA. Filters: branch_id,status,from,to,customer_id,reservation_id.
export const GET = handle(async (req: Request) => {
  const me = await requireApproved();
  const url = new URL(req.url);
  const rows = await ramadanTransactions(me, {
    branchId: url.searchParams.get("branch_id") ? Number(url.searchParams.get("branch_id")) : undefined,
    status: url.searchParams.get("status") ?? undefined,
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
    customerId: url.searchParams.get("customer_id") ? Number(url.searchParams.get("customer_id")) : undefined,
    reservationId: url.searchParams.get("reservation_id") ? Number(url.searchParams.get("reservation_id")) : undefined,
  });
  return json({ count: rows.length, results: rows });
});
