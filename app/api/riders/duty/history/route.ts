import { requireApiRole } from "@/lib/auth/current-user";
import { handle } from "@/lib/http/errors";
import { pageParams, paginated } from "@/lib/http/respond";
import { dutyHistory } from "@/lib/selectors";
import { serializeDutyLog } from "@/lib/serializers";

// GET /api/riders/duty/history?days=30 — the rider's recent duty logs.
export const GET = handle(async (req: Request) => {
  const me = await requireApiRole("rider");
  const url = new URL(req.url);
  const days = Number(url.searchParams.get("days") ?? "30") || 30;
  const { page, pageSize } = pageParams(url);
  const rows = await dutyHistory(me.id, days);
  return paginated(rows.map(serializeDutyLog), { page, pageSize, count: rows.length });
});
