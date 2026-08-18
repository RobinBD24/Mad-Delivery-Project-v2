import "server-only";
import type { EmployeeTeam, User } from "@prisma/client";

import { prisma } from "@/lib/db";
import { conflict, forbidden, notFound, sk, validationError } from "@/lib/http/errors";
import { branchForManager } from "@/lib/selectors";
import { assertManagesBranch, resolveManageableBranch } from "@/lib/services/branch-ops";

/**
 * PHASE M — branch staff TEAMS.
 *
 * A team is scoped to exactly one branch. A branch manager may only ever see or
 * touch their own branch's teams; the super admin may work across branches.
 * Management stays read-only, which is what `assertManagesBranch` already
 * encodes, so the rule is not re-invented here.
 *
 * Teams are archived rather than deleted once anyone has belonged to them, so an
 * employee record never ends up pointing at a team that no longer exists.
 */

export function serializeTeam(t: EmployeeTeam & { _count?: { members: number } }) {
  return {
    id: t.id,
    branch: t.branchId,
    name: t.name,
    description: t.description,
    is_active: t.isActive,
    is_archived: t.isArchived,
    member_count: t._count?.members ?? 0,
    created_at: t.createdAt.toISOString(),
    updated_at: t.updatedAt.toISOString(),
  };
}

/** Branch filter for LISTING teams, or null when the role may not list any. */
export async function teamScope(user: User, submittedBranchId?: number) {
  if (user.role === "super_admin" || user.role === "management") {
    return submittedBranchId ? { branchId: submittedBranchId } : {};
  }
  if (user.role === "branch_manager") {
    const branch = await branchForManager(user.id);
    return branch ? { branchId: branch.id } : null;
  }
  return null;
}

export async function listTeams(user: User, opts: { branchId?: number; includeArchived?: boolean } = {}) {
  const scope = await teamScope(user, opts.branchId);
  // A role with no team scope is REFUSED, not handed an empty list — an empty
  // list would read as "this branch has no teams" rather than "not for you".
  if (!scope) throw forbidden(sk("errors.teams.forbidden"));
  return prisma.employeeTeam.findMany({
    where: { ...scope, ...(opts.includeArchived ? {} : { isArchived: false }) },
    include: { _count: { select: { members: true } } },
    orderBy: [{ name: "asc" }],
  });
}

function validateName(name: string) {
  const trimmed = name.trim();
  if (!trimmed) throw validationError({ name: sk("errors.teams.nameRequired") });
  if (trimmed.length > 60) throw validationError({ name: sk("errors.teams.nameTooLong") });
  return trimmed;
}

export async function createTeam(
  user: User,
  input: { branchId?: number; name: string; description?: string; isActive?: boolean },
) {
  const branch = await resolveManageableBranch(user, input.branchId);
  const name = validateName(input.name ?? "");
  const dup = await prisma.employeeTeam.findFirst({ where: { branchId: branch.id, name } });
  if (dup) throw validationError({ name: sk("errors.teams.duplicate") });
  return prisma.employeeTeam.create({
    data: {
      branchId: branch.id,
      name,
      description: (input.description ?? "").trim().slice(0, 300),
      isActive: input.isActive ?? true,
    },
    include: { _count: { select: { members: true } } },
  });
}

/** A team the user may MANAGE, with the branch check applied (IDOR guard). */
export async function teamForManage(user: User, teamId: number) {
  const team = await prisma.employeeTeam.findUnique({ where: { id: teamId } });
  if (!team) throw notFound(sk("errors.teams.notFound"));
  await assertManagesBranch(user, team.branchId);
  return team;
}

export async function updateTeam(
  user: User,
  teamId: number,
  input: { name?: string; description?: string; isActive?: boolean },
) {
  const team = await teamForManage(user, teamId);
  if (team.isArchived) throw conflict(sk("errors.teams.archived"));
  const data: { name?: string; description?: string; isActive?: boolean } = {};
  if (input.name !== undefined) {
    const name = validateName(input.name);
    if (name !== team.name) {
      const dup = await prisma.employeeTeam.findFirst({ where: { branchId: team.branchId, name } });
      if (dup) throw validationError({ name: sk("errors.teams.duplicate") });
    }
    data.name = name;
  }
  if (input.description !== undefined) data.description = input.description.trim().slice(0, 300);
  if (input.isActive !== undefined) data.isActive = Boolean(input.isActive);
  return prisma.employeeTeam.update({
    where: { id: teamId },
    data,
    include: { _count: { select: { members: true } } },
  });
}

/**
 * Safe delete: an empty team is removed, a team anyone belongs to is archived
 * (and deactivated) so employee history keeps its reference.
 */
export async function deleteTeam(user: User, teamId: number) {
  const team = await teamForManage(user, teamId);
  const members = await prisma.branchEmployee.count({ where: { teamId } });
  if (members > 0) {
    const archived = await prisma.employeeTeam.update({
      where: { id: teamId },
      data: { isArchived: true, isActive: false },
      include: { _count: { select: { members: true } } },
    });
    return { archived: true, team: archived, members };
  }
  await prisma.employeeTeam.delete({ where: { id: teamId } });
  return { archived: false, team, members: 0 };
}
