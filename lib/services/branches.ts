import "server-only";
import { Prisma } from "@prisma/client";
import type { Branch, User } from "@prisma/client";

import { revalidateCatalog } from "@/lib/cache/catalog";
import { prisma } from "@/lib/db";
import { forbidden, notFound, sk, validationError } from "@/lib/http/errors";
import { notifyUser } from "@/lib/services/notifications";

/**
 * Assign (or remove, when managerId is null) a branch manager — transactional,
 * history-preserving. Ported from apps/branches/services.py.
 *
 * Guarantees: a branch has at most one active manager, a manager has at most
 * one active branch, and every change is recorded in BranchManagerAssignment +
 * ManagerActivityLog.
 */
export async function assignBranchManager(input: {
  branchId: number;
  managerId: number | null;
  assignedById: number;
  notes?: string;
}): Promise<Branch> {
  const { managerId } = input;

  return prisma.$transaction((tx) => assignBranchManagerTx(tx, input)).then(async (branch) => {
    // Tell the newly assigned manager which branch they now run.
    if (managerId !== null && branch.managerId === managerId) {
      await notifyUser(managerId, {
        type: "branch",
        titleKey: "notifications.branch.assigned.title",
        bodyKey: "notifications.branch.assigned.body",
        params: { branch: branch.name },
        link: "/branch-manager/dashboard",
      });
    }
    return branch;
  });
}

async function assignBranchManagerTx(
  tx: Prisma.TransactionClient,
  input: { branchId: number; managerId: number | null; assignedById: number; notes?: string },
): Promise<Branch> {
  const { branchId, managerId, assignedById, notes = "" } = input;
  {
    const branch = await tx.branch.findUniqueOrThrow({ where: { id: branchId } });
    const now = new Date();

    // Remove current manager.
    if (managerId === null) {
      if (branch.managerId) {
        await tx.branchManagerAssignment.updateMany({
          where: { branchId: branch.id, relievedAt: null },
          data: { relievedAt: now },
        });
        return tx.branch.update({ where: { id: branch.id }, data: { managerId: null } });
      }
      return branch;
    }

    const newManager = await tx.user.findFirst({
      where: { id: managerId, role: "branch_manager", status: "approved" },
    });
    if (!newManager) {
      throw validationError({ manager_id: sk("errors.catalog.selectedManagerNotFoundOrNotApproved") });
    }
    if (branch.managerId === newManager.id) return branch; // idempotent

    // Close the branch's current assignment and the manager's assignment elsewhere.
    await tx.branchManagerAssignment.updateMany({
      where: { branchId: branch.id, relievedAt: null },
      data: { relievedAt: now },
    });
    await tx.branchManagerAssignment.updateMany({
      where: { managerId: newManager.id, relievedAt: null, branchId: { not: branch.id } },
      data: { relievedAt: now },
    });
    await tx.branch.updateMany({
      where: { managerId: newManager.id, id: { not: branch.id } },
      data: { managerId: null },
    });

    const updated = await tx.branch.update({
      where: { id: branch.id },
      data: { managerId: newManager.id },
    });

    const assignedBy = await tx.user.findUnique({ where: { id: assignedById } });
    const assignerName =
      assignedBy && `${assignedBy.firstName} ${assignedBy.lastName}`.trim()
        ? `${assignedBy.firstName} ${assignedBy.lastName}`.trim()
        : assignedBy?.username ?? "";

    await tx.branchManagerAssignment.create({
      data: { managerId: newManager.id, branchId: branch.id, assignedById, notes },
    });
    await tx.managerActivityLog.create({
      data: {
        managerId: newManager.id,
        branchId: branch.id,
        activityType: "action",
        description: `Assigned to branch "${branch.name}" (by ${assignerName})`,
      },
    });

    return updated;
  }
}

/**
 * The branch a user is responsible for, for the topbar's BRANCH block
 * (.branch-select in static_design/Branch-manager_dashboard.html).
 * Only branch managers own a branch, so everyone else gets null and the block
 * is simply not rendered — the mockup's branch data was static placeholder text.
 */
export async function getManagedBranch(
  userId: number,
): Promise<{ id: number; name: string } | null> {
  return prisma.branch.findFirst({
    where: { managerId: userId },
    select: { id: true, name: true },
  });
}

// ── req #5: Branch archive / delete (super admin only) ───────────────────
/**
 * PHASE 11 — delivery radius + fee configuration.
 *
 * Authorization: super_admin may configure ANY branch; a branch_manager may
 * configure ONLY their own assigned branch — a submitted branch id is resolved
 * against the assignment, never trusted, so cross-branch writes are impossible.
 * Every other role is forbidden.
 *
 * Validation is Decimal-safe and rejects NaN/Infinity/negative/over-precise
 * input. Radius is capped by a business maximum so a typo cannot silently make
 * the whole country "in coverage".
 */
export const MAX_DELIVERY_RADIUS_KM = 50;
export const MAX_DELIVERY_FEE = 100000;

function parseMoneyLike(raw: unknown, field: string, max: number, allowZero = true): number {
  const value = Number(String(raw ?? "").trim());
  if (!Number.isFinite(value)) throw validationError({ [field]: sk("errors.branchSettings.invalidNumber") });
  if (value < 0 || (!allowZero && value <= 0)) {
    throw validationError({ [field]: sk("errors.branchSettings.mustBePositive") });
  }
  if (value > max) throw validationError({ [field]: sk("errors.branchSettings.tooLarge") });
  // Guard against absurd precision that Decimal(10,2)-style columns cannot hold.
  if (Math.round(value * 100) / 100 !== value) {
    throw validationError({ [field]: sk("errors.branchSettings.tooPrecise") });
  }
  return value;
}

/** Resolve which branch this actor may configure (IDOR-safe). */
export async function resolveConfigurableBranch(user: User, submittedBranchId?: number) {
  if (user.role === "branch_manager") {
    const own = await prisma.branch.findFirst({ where: { managerId: user.id } });
    if (!own) throw forbidden(sk("errors.catalog.noBranchAssigned"));
    // A submitted id that isn't theirs is an explicit cross-branch attempt.
    if (submittedBranchId != null && submittedBranchId !== own.id) {
      throw forbidden(sk("errors.branchSettings.notYourBranch"));
    }
    return own;
  }
  if (user.role === "super_admin") {
    if (!submittedBranchId) throw validationError({ branch_id: sk("errors.catalog.selectBranch") });
    const branch = await prisma.branch.findUnique({ where: { id: submittedBranchId } });
    if (!branch) throw notFound(sk("errors.catalog.branchNotFound"));
    return branch;
  }
  throw forbidden(sk("errors.branchSettings.forbidden"));
}

export async function updateBranchDeliverySettings(
  user: User,
  submittedBranchId: number | undefined,
  input: { deliveryRadiusKm?: unknown; deliveryFee?: unknown },
) {
  const branch = await resolveConfigurableBranch(user, submittedBranchId);
  const data: Prisma.BranchUpdateInput = {};
  if (input.deliveryRadiusKm !== undefined) {
    const km = parseMoneyLike(input.deliveryRadiusKm, "delivery_radius_km", MAX_DELIVERY_RADIUS_KM, false);
    data.deliveryRadiusKm = new Prisma.Decimal(km.toFixed(2));
  }
  if (input.deliveryFee !== undefined) {
    const fee = parseMoneyLike(input.deliveryFee, "delivery_fee", MAX_DELIVERY_FEE, true);
    data.deliveryFee = new Prisma.Decimal(fee.toFixed(2));
  }
  if (Object.keys(data).length === 0) {
    throw validationError({ detail: sk("errors.catalog.nothingToChange") });
  }
  // Changing these affects FUTURE orders only — existing orders keep the
  // charge/estimate/distance snapshots taken when they were placed.
  return prisma.branch.update({ where: { id: branch.id }, data });
}

/**
 * Dependency-aware branch removal. A branch with ANY historical or operational
 * data (orders, products, categories, delivery areas, reservations, Ramadan
 * reservations, tables, employees, rider duty sessions, expenses, settlements,
 * commissions) is ARCHIVED (isArchived=true) — all history is preserved and it
 * stops accepting new orders and disappears from active customer choices.
 * Only a genuinely unused branch is hard-deleted. Returns which action ran +
 * the dependency counts (so the UI can explain the result accurately).
 */
export async function archiveOrDeleteBranch(actorId: number, branchId: number) {
  const branch = await prisma.branch.findUnique({ where: { id: branchId } });
  if (!branch) throw validationError({ branch_id: sk("errors.catalog.branchNotFound") });

  // EVERY model that references a branch is counted. Several relations cascade
  // on branch delete (e.g. Category), so an uncounted dependency would silently
  // destroy history — the count list must stay exhaustive.
  const where = { branchId } as const;
  const [
    orders, products, categories, areas, zones, reservations, ramadan, tables, employees,
    sessions, expenses, settlements, commissions, complaints, adjustments,
    activityLogs, attendance, staffAttendance, timeSlots, dutyLogs, orderAssignments,
    receiveConfirmations, dutyChats, managerAssignments, ramadanTables, ramadanBookings,
    ramadanConfigs, ramadanSlots, ramadanMenus, ramadanPayments,
  ] = await Promise.all([
    prisma.order.count({ where }),
    prisma.product.count({ where }),
    prisma.category.count({ where }),
    prisma.branchDeliveryArea.count({ where }),
    prisma.branchDeliveryZone.count({ where }),
    prisma.tableReservation.count({ where }),
    prisma.ramadanReservation.count({ where }),
    prisma.branchTable.count({ where }),
    prisma.branchEmployee.count({ where }),
    prisma.riderBranchDutySession.count({ where }),
    prisma.branchExpense.count({ where }),
    prisma.branchSettlement.count({ where }),
    prisma.riderCommission.count({ where }),
    prisma.complaint.count({ where }),
    prisma.financialAdjustment.count({ where }),
    prisma.managerActivityLog.count({ where }),
    prisma.employeeAttendance.count({ where }),
    prisma.staffAttendance.count({ where }),
    prisma.deliveryTimeSlot.count({ where }),
    prisma.riderDutyLog.count({ where }),
    prisma.riderOrderAssignment.count({ where }),
    prisma.orderReceiveConfirmation.count({ where }),
    prisma.riderDutyChatThread.count({ where }),
    prisma.branchManagerAssignment.count({ where }),
    prisma.ramadanTable.count({ where }),
    prisma.ramadanBooking.count({ where }),
    prisma.ramadanConfig.count({ where }),
    prisma.ramadanTimeSlot.count({ where }),
    prisma.ramadanMenu.count({ where }),
    prisma.ramadanReservationPayment.count({ where }),
  ]);

  const dependencies = {
    orders, products, categories, areas, zones, reservations, ramadan, tables, employees,
    sessions, expenses, settlements, commissions, complaints, adjustments,
    activityLogs, attendance, staffAttendance, timeSlots, dutyLogs, orderAssignments,
    receiveConfirmations, dutyChats, managerAssignments, ramadanTables, ramadanBookings,
    ramadanConfigs, ramadanSlots, ramadanMenus, ramadanPayments,
  };
  const hasHistory = Object.values(dependencies).some((n) => n > 0);

  if (!hasHistory) {
    await prisma.branch.delete({ where: { id: branchId } });
    // A deleted branch takes its (zero) products with it — refresh regardless so
    // no catalogue surface keeps a payload that mentions it.
    revalidateCatalog({ branchId });
    return { action: "deleted" as const, dependencies };
  }

  const updated = await prisma.branch.update({
    where: { id: branchId },
    data: { isArchived: true, archivedAt: new Date(), archivedById: actorId, isActive: false },
  });
  // Archiving removes every one of the branch's products from customer surfaces.
  revalidateCatalog({ branchId });
  return { action: "archived" as const, dependencies, branch: updated };
}
