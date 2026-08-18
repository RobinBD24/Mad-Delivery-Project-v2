import { requireApproved } from "@/lib/auth/current-user";
import { handle } from "@/lib/http/errors";
import { created, paginated } from "@/lib/http/respond";
import { prisma } from "@/lib/db";
import { daysAgo } from "@/lib/utils/dates";
import { markAttendance } from "@/lib/services/branch-ops";

function serialize(a: { id: number; date: Date; status: string; note: string; markedAt: Date }) {
  return {
    id: a.id,
    date: a.date.toISOString().slice(0, 10),
    status: a.status,
    note: a.note,
    marked_at: a.markedAt.toISOString(),
  };
}

// GET /api/attendance — the caller's own attendance history (last 30 days).
export const GET = handle(async () => {
  const me = await requireApproved();
  const rows = await prisma.staffAttendance.findMany({
    where: { userId: me.id, date: { gte: daysAgo(30) } },
    orderBy: { date: "desc" },
  });
  return paginated(rows.map(serialize));
});

// POST /api/attendance  { status, note } — mark today's attendance (any staff).
export const POST = handle(async (req: Request) => {
  const me = await requireApproved();
  const body = (await req.json().catch(() => ({}))) as { status?: string; note?: string };
  const row = await markAttendance(me, String(body.status ?? "present"), String(body.note ?? ""));
  return created(serialize(row));
});
