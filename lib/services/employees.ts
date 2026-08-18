import "server-only";
import { Prisma } from "@prisma/client";
import type { BranchEmployee, EmployeeAttendance, User } from "@prisma/client";

import { prisma } from "@/lib/db";
import { conflict, notFound, sk, validationError } from "@/lib/http/errors";
import { branchForManager } from "@/lib/selectors";
import { assertManagesBranch, resolveManageableBranch } from "@/lib/services/branch-ops";

// Configurable branch employee roles (validated string enum — SQLite has no enum).
// PHASE M — "others" joins the existing validated roles rather than replacing
// them, so every employee already stored keeps a meaningful job term. A role of
// "others" REQUIRES a custom label, which is where free text is allowed to live.
export const EMPLOYEE_ROLES = [
  "kitchen", "chef", "waiter", "cashier", "delivery", "cleaner", "security", "supervisor", "others",
] as const;
export type EmployeeRole = (typeof EMPLOYEE_ROLES)[number];

/** Stored employment states. "all" is a LIST FILTER only and is never stored. */
export const EMPLOYMENT_STATUSES = ["active", "quit_job"] as const;

export const ATTENDANCE_STATUSES = ["present", "absent", "late", "leave", "half_day"] as const;

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Parse a YYYY-MM-DD date-only string to UTC midnight, so a stored attendance
 * date round-trips through `toISOString().slice(0,10)` unchanged in any server
 * timezone (avoids off-by-one-day bugs). Empty → today (UTC).
 */
function dateOnlyUtc(str: string): Date {
  const day = str && /^\d{4}-\d{2}-\d{2}/.test(str) ? str.slice(0, 10) : new Date().toISOString().slice(0, 10);
  return new Date(`${day}T00:00:00.000Z`);
}

export function serializeEmployee(
  e: BranchEmployee & { team?: { id: number; name: string } | null },
) {
  return {
    id: e.id,
    branch: e.branchId,
    first_name: e.firstName,
    last_name: e.lastName,
    name: `${e.firstName} ${e.lastName}`.trim(),
    employee_code: e.employeeCode,
    phone: e.phone,
    email: e.email,
    photo: e.photo ?? null,
    joining_date: e.joiningDate ? e.joiningDate.toISOString().slice(0, 10) : null,
    department: e.department,
    role: e.role,
    custom_role: e.customRole,
    // The label to actually show: the custom term when the role is "others".
    role_label: e.role === "others" && e.customRole ? e.customRole : e.role,
    employment_status: e.employmentStatus,
    quit_at: e.quitAt ? e.quitAt.toISOString() : null,
    quit_reason: e.quitReason,
    team: e.teamId ?? null,
    team_name: e.team?.name ?? null,
    is_active: e.isActive,
    notes: e.notes,
    created_at: e.createdAt.toISOString(),
    updated_at: e.updatedAt.toISOString(),
  };
}

// ── Read scope ──────────────────────────────────────────────────────────
/** The branch filter a user may LIST employees for (own branch / any / by id). */
export async function employeeScope(user: User, submittedBranchId?: number): Promise<Prisma.BranchEmployeeWhereInput | null> {
  if (user.role === "super_admin" || user.role === "management") {
    return submittedBranchId ? { branchId: submittedBranchId } : {};
  }
  if (user.role === "branch_manager") {
    const branch = await branchForManager(user.id);
    return branch ? { branchId: branch.id } : null;
  }
  return null;
}

/** An employee the user may MANAGE (mutations). Management is read-only → 403. */
export async function employeeForManage(user: User, employeeId: number) {
  const employee = await prisma.branchEmployee.findUnique({ where: { id: employeeId } });
  if (!employee) throw notFound(sk("errors.ops.employeeNotFound"));
  await assertManagesBranch(user, employee.branchId); // SA any, BM own, else 403
  return employee;
}

interface EmployeeInput {
  branchId?: number;
  firstName: string;
  lastName?: string;
  employeeCode: string;
  phone?: string;
  email?: string;
  photo?: string | null;
  joiningDate?: string | null;
  department?: string;
  role: string;
  customRole?: string;
  teamId?: number | null;
  isActive?: boolean;
  notes?: string;
}

function validateEmployee(input: {
  firstName: string;
  employeeCode: string;
  role: string;
  customRole?: string;
  email?: string;
}) {
  if (!input.firstName.trim()) throw validationError({ first_name: sk("errors.ops.firstNameRequired") });
  if (!input.employeeCode.trim()) throw validationError({ employee_code: sk("errors.ops.employeeCodeRequired") });
  if (!(EMPLOYEE_ROLES as readonly string[]).includes(input.role)) throw validationError({ role: sk("errors.ops.invalidEmployeeRole") });
  // PHASE M — "Others" without a label would be indistinguishable from "no role
  // recorded", so the label is required exactly there.
  if (input.role === "others" && !(input.customRole ?? "").trim()) {
    throw validationError({ custom_role: sk("errors.ops.customRoleRequired") });
  }
  if ((input.customRole ?? "").trim().length > 60) {
    throw validationError({ custom_role: sk("errors.ops.customRoleTooLong") });
  }
  if (input.email && input.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) {
    throw validationError({ email: sk("errors.validation.email") });
  }
}

export async function createEmployee(user: User, input: EmployeeInput) {
  const branch = await resolveManageableBranch(user, input.branchId);
  validateEmployee(input);
  const teamId = await resolveTeamId(branch.id, input.teamId);
  const code = input.employeeCode.trim();
  const dup = await prisma.branchEmployee.findFirst({ where: { branchId: branch.id, employeeCode: code } });
  if (dup) throw validationError({ employee_code: sk("errors.ops.employeeCodeDuplicate") });
  return prisma.branchEmployee.create({
    data: {
      branchId: branch.id,
      firstName: input.firstName.trim(),
      lastName: (input.lastName ?? "").trim(),
      employeeCode: code,
      phone: (input.phone ?? "").trim(),
      email: (input.email ?? "").trim(),
      photo: input.photo ?? null,
      joiningDate: input.joiningDate ? new Date(`${input.joiningDate}T00:00:00`) : null,
      department: (input.department ?? "").trim(),
      role: input.role,
      customRole: input.role === "others" ? (input.customRole ?? "").trim() : "",
      teamId,
      isActive: input.isActive ?? true,
      notes: (input.notes ?? "").trim(),
    },
    include: { team: { select: { id: true, name: true } } },
  });
}

/**
 * A team id the employee may actually be put in: it must exist AND belong to the
 * same branch, so a forged id from another branch is rejected rather than
 * silently linking staff across branches. Archived teams take no new members.
 */
async function resolveTeamId(branchId: number, teamId: number | null | undefined): Promise<number | null> {
  if (teamId === undefined || teamId === null) return null;
  const team = await prisma.employeeTeam.findUnique({ where: { id: Number(teamId) } });
  if (!team || team.branchId !== branchId) throw validationError({ team_id: sk("errors.teams.notFound") });
  if (team.isArchived) throw validationError({ team_id: sk("errors.teams.archived") });
  return team.id;
}

export async function updateEmployee(user: User, employeeId: number, input: Partial<EmployeeInput>) {
  const employee = await employeeForManage(user, employeeId);
  if (input.firstName !== undefined || input.employeeCode !== undefined || input.role !== undefined) {
    validateEmployee({
      firstName: input.firstName ?? employee.firstName,
      employeeCode: input.employeeCode ?? employee.employeeCode,
      role: input.role ?? employee.role,
      customRole: input.customRole ?? employee.customRole,
      email: input.email,
    });
  }
  if (input.employeeCode !== undefined && input.employeeCode.trim() !== employee.employeeCode) {
    const dup = await prisma.branchEmployee.findFirst({ where: { branchId: employee.branchId, employeeCode: input.employeeCode.trim() } });
    if (dup) throw validationError({ employee_code: sk("errors.ops.employeeCodeDuplicate") });
  }
  const data: Prisma.BranchEmployeeUpdateInput = {};
  if (input.firstName !== undefined) data.firstName = input.firstName.trim();
  if (input.lastName !== undefined) data.lastName = input.lastName.trim();
  if (input.employeeCode !== undefined) data.employeeCode = input.employeeCode.trim();
  if (input.phone !== undefined) data.phone = input.phone.trim();
  if (input.email !== undefined) data.email = input.email.trim();
  if (input.photo) data.photo = input.photo;
  if (input.joiningDate !== undefined) data.joiningDate = input.joiningDate ? new Date(`${input.joiningDate}T00:00:00`) : null;
  if (input.department !== undefined) data.department = input.department.trim();
  if (input.role !== undefined) data.role = input.role;
  // Switching away from "others" clears the custom label so a stale term cannot
  // linger behind a proper role.
  const nextRole = input.role ?? employee.role;
  if (input.role !== undefined || input.customRole !== undefined) {
    data.customRole = nextRole === "others" ? (input.customRole ?? employee.customRole).trim() : "";
  }
  if (input.teamId !== undefined) {
    const teamId = await resolveTeamId(employee.branchId, input.teamId);
    data.team = teamId === null ? { disconnect: true } : { connect: { id: teamId } };
  }
  if (input.isActive !== undefined) data.isActive = input.isActive;
  if (input.notes !== undefined) data.notes = input.notes.trim();
  return prisma.branchEmployee.update({
    where: { id: employeeId },
    data,
    include: { team: { select: { id: true, name: true } } },
  });
}

/**
 * PHASE M — Quit Job / re-activate. This NEVER deletes anything: the employee
 * row, their attendance history and every report stay exactly as they are. The
 * only behavioural change is that a quit employee is no longer offered in the
 * daily attendance roster.
 */
export async function setEmploymentStatus(
  user: User,
  employeeId: number,
  status: string,
  reason = "",
) {
  const employee = await employeeForManage(user, employeeId);
  if (!(EMPLOYMENT_STATUSES as readonly string[]).includes(status)) {
    throw validationError({ employment_status: sk("errors.ops.statusInvalid") });
  }
  if (employee.employmentStatus === status) throw conflict(sk("errors.ops.employeeAlreadyInState"));
  const quitting = status === "quit_job";
  if (quitting && !reason.trim()) throw validationError({ reason: sk("errors.ops.quitReasonRequired") });
  return prisma.branchEmployee.update({
    where: { id: employeeId },
    data: {
      employmentStatus: status,
      quitAt: quitting ? new Date() : null,
      quitReason: quitting ? reason.trim().slice(0, 300) : "",
      // A quit employee is also inactive for every existing "is_active" reader.
      isActive: !quitting,
    },
    include: { team: { select: { id: true, name: true } } },
  });
}

export async function deleteEmployee(user: User, employeeId: number) {
  await employeeForManage(user, employeeId);
  await prisma.branchEmployee.delete({ where: { id: employeeId } });
}

// ── B6: Attendance ──────────────────────────────────────────────────────
export function serializeAttendance(a: EmployeeAttendance & { employee?: { firstName: string; lastName: string; role: string; employeeCode: string } | null }) {
  return {
    id: a.id,
    employee: a.employeeId,
    employee_name: a.employee ? `${a.employee.firstName} ${a.employee.lastName}`.trim() : "",
    employee_code: a.employee?.employeeCode ?? "",
    employee_role: a.employee?.role ?? "",
    branch: a.branchId,
    date: a.date.toISOString().slice(0, 10),
    status: a.status,
    check_in: a.checkIn ?? null,
    check_out: a.checkOut ?? null,
    note: a.note,
    recorded_by: a.recordedById ?? null,
    created_at: a.createdAt.toISOString(),
    updated_at: a.updatedAt.toISOString(),
  };
}

/**
 * Record (or update) one employee's attendance for a date. One row per
 * employee+date is guaranteed by the DB unique constraint; a same-day re-mark
 * updates the existing row and records who did it.
 */
export async function recordAttendance(user: User, input: {
  employeeId: number;
  date: string;
  status: string;
  checkIn?: string | null;
  checkOut?: string | null;
  note?: string;
}) {
  const employee = await employeeForManage(user, input.employeeId); // IDOR: own branch / SA any
  // PHASE N — someone who has quit keeps every historical row, but cannot be
  // given a NEW one. An existing row for that employee stays editable, so past
  // records can still be corrected.
  if (employee.employmentStatus === "quit_job") {
    const existing = await prisma.employeeAttendance.findUnique({
      where: { employeeId_date: { employeeId: employee.id, date: dateOnlyUtc(input.date) } },
    });
    if (!existing) throw validationError({ employee_id: sk("errors.ops.employeeQuit") });
  }
  if (!(ATTENDANCE_STATUSES as readonly string[]).includes(input.status)) {
    throw validationError({ status: sk("errors.ops.statusInvalid") });
  }
  const date = dateOnlyUtc(input.date);
  if (Number.isNaN(date.getTime())) throw validationError({ date: sk("errors.ops.dateInvalid") });
  for (const [k, v] of [["check_in", input.checkIn], ["check_out", input.checkOut]] as const) {
    if (v && !TIME_RE.test(v)) throw validationError({ [k]: sk("errors.ops.timeInvalid") });
  }
  return prisma.employeeAttendance.upsert({
    where: { employeeId_date: { employeeId: employee.id, date } },
    update: {
      status: input.status,
      checkIn: input.checkIn || null,
      checkOut: input.checkOut || null,
      note: (input.note ?? "").trim(),
      recordedById: user.id,
    },
    create: {
      employeeId: employee.id,
      branchId: employee.branchId,
      date,
      status: input.status,
      checkIn: input.checkIn || null,
      checkOut: input.checkOut || null,
      note: (input.note ?? "").trim(),
      recordedById: user.id,
    },
    include: { employee: true },
  });
}

export interface AttendanceFilters {
  branchId?: number;
  employeeId?: number;
  role?: string;
  teamId?: number;
  department?: string;
  status?: string;
  from?: string;
  to?: string;
}

/** Build a scoped `where` for attendance queries (role-scoped + filters). */
export async function attendanceWhere(user: User, f: AttendanceFilters): Promise<Prisma.EmployeeAttendanceWhereInput | null> {
  const and: Prisma.EmployeeAttendanceWhereInput[] = [];
  if (user.role === "super_admin" || user.role === "management") {
    if (f.branchId) and.push({ branchId: f.branchId });
  } else if (user.role === "branch_manager") {
    const branch = await branchForManager(user.id);
    if (!branch) return null;
    and.push({ branchId: branch.id });
  } else {
    return null;
  }
  if (f.employeeId) and.push({ employeeId: f.employeeId });
  if (f.status && (ATTENDANCE_STATUSES as readonly string[]).includes(f.status)) and.push({ status: f.status });
  if (f.role && (EMPLOYEE_ROLES as readonly string[]).includes(f.role)) and.push({ employee: { role: f.role } });
  // PHASE N — team filter. History stays visible for staff who have since quit,
  // so this deliberately does NOT filter on employment status.
  if (f.teamId) and.push({ employee: { teamId: f.teamId } });
  if (f.department) and.push({ employee: { department: f.department } });
  if (f.from) and.push({ date: { gte: new Date(`${f.from}T00:00:00.000Z`) } });
  if (f.to) and.push({ date: { lte: new Date(`${f.to}T23:59:59.999Z`) } });
  return and.length ? { AND: and } : {};
}

/** Real counts per status for the scoped/filtered set (no fabricated metrics). */
export async function attendanceSummary(where: Prisma.EmployeeAttendanceWhereInput) {
  const grouped = await prisma.employeeAttendance.groupBy({ by: ["status"], where, _count: { status: true } });
  const summary: Record<string, number> = { present: 0, absent: 0, late: 0, leave: 0, half_day: 0 };
  for (const g of grouped) summary[g.status] = g._count.status;
  summary.total = grouped.reduce((n, g) => n + g._count.status, 0);
  return summary;
}
