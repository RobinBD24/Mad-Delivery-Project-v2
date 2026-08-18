import { requireApproved } from "@/lib/auth/current-user";
import { handle } from "@/lib/http/errors";
import { json } from "@/lib/http/respond";
import { ramadanSummary } from "@/lib/services/ramadan";

// GET /api/ramadan/summary?branch_id= — management/SA/accounts read-only real metrics.
export const GET = handle(async (req: Request) => {
  const me = await requireApproved();
  const url = new URL(req.url);
  const summary = await ramadanSummary(me, url.searchParams.get("branch_id") ? Number(url.searchParams.get("branch_id")) : undefined);
  return json(summary);
});
