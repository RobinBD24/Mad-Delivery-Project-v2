import type { Prisma } from "@prisma/client";

import { requireApproved } from "@/lib/auth/current-user";
import { handle } from "@/lib/http/errors";
import { created, pageParams, paginated } from "@/lib/http/respond";
import { parseBody } from "@/lib/http/form";
import { saveUpload } from "@/lib/http/upload";
import { prisma } from "@/lib/db";
import { createEmployee, employeeScope, serializeEmployee } from "@/lib/services/employees";

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

// GET /api/employees?branch_id=&role=&team_id=&status=&search=&join_from=&join_to=&roster=
// PHASE M/N — `status` accepts the stored employment states (active|quit_job)
// plus the legacy active/inactive flag filter; "all" simply means "no filter"
// and is never stored. `roster=true` returns only the staff eligible for a NEW
// attendance entry, which excludes anyone who has quit.
export const GET = handle(async (req: Request) => {
  const me = await requireApproved();
  const url = new URL(req.url);
  const scope = await employeeScope(
    me,
    positiveInteger(url.searchParams.get("branch_id")),
  );
  if (scope === null) return paginated([]);

  const and: Prisma.BranchEmployeeWhereInput[] = [scope];
  const role = url.searchParams.get("role");
  if (role) and.push({ role });
  const teamId = positiveInteger(url.searchParams.get("team_id"));
  if (teamId) and.push({ teamId });
  const status = url.searchParams.get("status");
  if (status === "active") and.push({ employmentStatus: "active" });
  if (status === "quit_job") and.push({ employmentStatus: "quit_job" });
  if (status === "inactive") and.push({ isActive: false });
  if (url.searchParams.get("roster") === "true") {
    and.push({ employmentStatus: "active", isActive: true });
  }
  const search = (url.searchParams.get("search") ?? "").trim().slice(0, 60);
  if (search) {
    and.push({ OR: [
      { firstName: { contains: search } },
      { lastName: { contains: search } },
      { employeeCode: { contains: search } },
      { phone: { contains: search } },
    ] });
  }
  const joinFrom = dateOnly(url.searchParams.get("join_from"));
  const joinTo = dateOnly(url.searchParams.get("join_to"));
  if (joinFrom) and.push({ joiningDate: { gte: new Date(`${joinFrom}T00:00:00`) } });
  if (joinTo) and.push({ joiningDate: { lte: new Date(`${joinTo}T23:59:59`) } });

  const where: Prisma.BranchEmployeeWhereInput = { AND: and };
  const { skip, take, page, pageSize } = pageParams(url);
  const [count, rows] = await Promise.all([
    prisma.branchEmployee.count({ where }),
    prisma.branchEmployee.findMany({
      where,
      include: { team: { select: { id: true, name: true } } },
      orderBy: [{ isActive: "desc" }, { firstName: "asc" }],
      skip,
      take,
    }),
  ]);
  return paginated(rows.map(serializeEmployee), { page, pageSize, count });
});

// POST /api/employees — create (multipart w/ optional photo → webp).
export const POST = handle(async (req: Request) => {
  const me = await requireApproved();
  const { fields, file } = await parseBody(req);
  const photo = file("photo");
  const employee = await createEmployee(me, {
    branchId: fields.branch_id ? Number(fields.branch_id) : undefined,
    firstName: fields.first_name ?? "",
    lastName: fields.last_name ?? "",
    employeeCode: fields.employee_code ?? "",
    phone: fields.phone ?? "",
    email: fields.email ?? "",
    photo: photo ? await saveUpload(photo, "employee_photos", "photo") : null,
    joiningDate: fields.joining_date || null,
    department: fields.department ?? "",
    role: fields.role ?? "",
    customRole: fields.custom_role ?? "",
    teamId: fields.team_id ? Number(fields.team_id) : null,
    isActive: fields.is_active ? fields.is_active === "true" : true,
    notes: fields.notes ?? "",
  });
  return created(serializeEmployee(employee));
});
