import { requireApproved } from "@/lib/auth/current-user";
import { handle } from "@/lib/http/errors";
import { created, json, pageParams } from "@/lib/http/respond";
import { prisma } from "@/lib/db";
import {
  attendanceSummary,
  attendanceWhere,
  recordAttendance,
  serializeAttendance,
} from "@/lib/services/employees";

function positiveInteger(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function dateOnly(value: string | null): string | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
    ? value
    : undefined;
}

// GET /api/employee-attendance?branch_id=&employee_id=&role=&team_id=&department=&status=&from=&to=
// Returns the scoped rows plus a real per-status summary.
export const GET = handle(async (req: Request) => {
  const me = await requireApproved();
  const url = new URL(req.url);
  const where = await attendanceWhere(me, {
    branchId: positiveInteger(url.searchParams.get("branch_id")),
    employeeId: positiveInteger(url.searchParams.get("employee_id")),
    role: url.searchParams.get("role") ?? undefined,
    teamId: positiveInteger(url.searchParams.get("team_id")),
    department: url.searchParams.get("department") ?? undefined,
    status: url.searchParams.get("status") ?? undefined,
    from: dateOnly(url.searchParams.get("from")),
    to: dateOnly(url.searchParams.get("to")),
  });
  if (where === null) return json({ count: 0, results: [], summary: { present: 0, absent: 0, late: 0, leave: 0, half_day: 0, total: 0 } });
  const { skip, take } = pageParams(url);
  const [count, rows, summary] = await Promise.all([
    prisma.employeeAttendance.count({ where }),
    prisma.employeeAttendance.findMany({ where, include: { employee: true }, orderBy: [{ date: "desc" }, { id: "desc" }], skip, take }),
    attendanceSummary(where),
  ]);
  return json({ count, results: rows.map(serializeAttendance), summary });
});

// POST /api/employee-attendance — record/update one employee's attendance.
export const POST = handle(async (req: Request) => {
  const me = await requireApproved();
  const body = (await req.json().catch(() => ({}))) as {
    employee_id?: number;
    date?: string;
    status?: string;
    check_in?: string;
    check_out?: string;
    note?: string;
  };
  const row = await recordAttendance(me, {
    employeeId: Number(body.employee_id),
    date: String(body.date ?? ""),
    status: String(body.status ?? ""),
    checkIn: body.check_in ?? null,
    checkOut: body.check_out ?? null,
    note: body.note ?? "",
  });
  return created(serializeAttendance(row));
});
