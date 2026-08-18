import "server-only";
import type { Prisma, User } from "@prisma/client";

import { prisma } from "@/lib/db";
import { adminUserListWhere, ordersWhereForUser } from "@/lib/selectors";
import type { OrderStatus } from "@/types";

const ORDER_STATUSES: OrderStatus[] = [
  "pending",
  "accepted",
  "preparing",
  "ready",
  "picked_up",
  "on_the_way",
  "delivered",
  "cancelled",
];

export interface UserListSummary {
  total: number;
  approved: number;
  pending: number;
  blocked: number;
}

export interface OrderListSummary extends Record<OrderStatus, number> {
  total: number;
}

export interface AdminBranchSummary {
  total: number;
  active: number;
  archived: number;
  unassigned: number;
}

export interface AdminProductSummary {
  total: number;
  available: number;
  held: number;
  unavailable: number;
}

export interface AdminCategorySummary {
  total: number;
  active: number;
  global: number;
  inactive: number;
}

export async function getAdminUserListSummary(currentUserId: number): Promise<UserListSummary> {
  const base = adminUserListWhere({ excludeUserId: currentUserId });
  const [total, approved, pending, blocked] = await Promise.all([
    prisma.user.count({ where: base }),
    prisma.user.count({ where: { AND: [base, { status: "approved" }] } }),
    prisma.user.count({ where: { AND: [base, { status: "pending" }] } }),
    prisma.user.count({ where: { AND: [base, { isBlocked: true }] } }),
  ]);
  return { total, approved, pending, blocked };
}

export async function getOrderListSummary(
  user: Pick<User, "id" | "role">,
): Promise<OrderListSummary> {
  const scope = await ordersWhereForUser(user);
  const empty = Object.fromEntries(ORDER_STATUSES.map((status) => [status, 0])) as Record<OrderStatus, number>;
  if (scope === null) return { total: 0, ...empty };

  const rows = await prisma.order.groupBy({
    by: ["status"],
    where: scope,
    _count: { _all: true },
  });
  for (const row of rows) {
    if (ORDER_STATUSES.includes(row.status as OrderStatus)) {
      empty[row.status as OrderStatus] = row._count._all;
    }
  }
  return {
    total: rows.reduce((sum, row) => sum + row._count._all, 0),
    ...empty,
  };
}

export async function getAdminBranchSummary(): Promise<AdminBranchSummary> {
  const rows = await prisma.branch.groupBy({
    by: ["isActive", "isArchived", "managerId"],
    _count: { _all: true },
  });
  return {
    total: rows.reduce((sum, row) => sum + row._count._all, 0),
    active: rows
      .filter((row) => row.isActive && !row.isArchived)
      .reduce((sum, row) => sum + row._count._all, 0),
    archived: rows
      .filter((row) => row.isArchived)
      .reduce((sum, row) => sum + row._count._all, 0),
    unassigned: rows
      .filter((row) => row.managerId === null && !row.isArchived)
      .reduce((sum, row) => sum + row._count._all, 0),
  };
}

export async function getAdminProductSummary(): Promise<AdminProductSummary> {
  const rows = await prisma.product.groupBy({
    by: ["isAvailable", "heldByAdmin"],
    where: { deletedAt: null },
    _count: { _all: true },
  });
  return {
    total: rows.reduce((sum, row) => sum + row._count._all, 0),
    available: rows
      .filter((row) => row.isAvailable && !row.heldByAdmin)
      .reduce((sum, row) => sum + row._count._all, 0),
    held: rows
      .filter((row) => row.heldByAdmin)
      .reduce((sum, row) => sum + row._count._all, 0),
    unavailable: rows
      .filter((row) => !row.isAvailable && !row.heldByAdmin)
      .reduce((sum, row) => sum + row._count._all, 0),
  };
}

export async function getAdminCategorySummary(): Promise<AdminCategorySummary> {
  const rows = await prisma.category.groupBy({
    by: ["isActive", "branchId"],
    _count: { _all: true },
  });
  return {
    total: rows.reduce((sum, row) => sum + row._count._all, 0),
    active: rows
      .filter((row) => row.isActive)
      .reduce((sum, row) => sum + row._count._all, 0),
    global: rows
      .filter((row) => row.branchId === null)
      .reduce((sum, row) => sum + row._count._all, 0),
    inactive: rows
      .filter((row) => !row.isActive)
      .reduce((sum, row) => sum + row._count._all, 0),
  };
}

export interface NotificationInboxSummary {
  total: number;
  unread: number;
  read: number;
}

/**
 * Own-inbox aggregate for the shared notifications page.
 *
 * Scoped with the SAME `userId` clause the list route uses, so a role can never
 * see another user's counts, and computed with ONE grouped query rather than a
 * request per card. Counting the fetched page instead would under-report as
 * soon as the inbox exceeds a page.
 */
export async function getNotificationInboxSummary(
  userId: number,
): Promise<NotificationInboxSummary> {
  const rows = await prisma.notification.groupBy({
    by: ["isRead"],
    where: { userId },
    _count: { _all: true },
  });
  const total = rows.reduce((sum, row) => sum + row._count._all, 0);
  const unread = rows
    .filter((row) => !row.isRead)
    .reduce((sum, row) => sum + row._count._all, 0);
  return { total, unread, read: total - unread };
}

export interface ComplaintListSummary {
  total: number;
  /** `pending` is the enum's initial state (see COMPLAINT_STATUSES). */
  pending: number;
  inProgress: number;
  resolved: number;
  closed: number;
}

/**
 * Complaint aggregate for the shared complaints page.
 *
 * `where` MUST be the caller's `complaintsWhereForUser(...)` clause so the
 * summary respects exactly the same RBAC/branch scope as the list it sits above
 * — an oversight role sees its own scope, a branch manager only their branch.
 */
export async function getComplaintListSummary(
  where: Prisma.ComplaintWhereInput,
): Promise<ComplaintListSummary> {
  const rows = await prisma.complaint.groupBy({
    by: ["status"],
    where,
    _count: { _all: true },
  });
  const count = (status: string) =>
    rows.filter((row) => row.status === status).reduce((sum, row) => sum + row._count._all, 0);
  return {
    total: rows.reduce((sum, row) => sum + row._count._all, 0),
    pending: count("pending"),
    inProgress: count("in_progress"),
    resolved: count("resolved"),
    closed: count("closed"),
  };
}

export interface CustomerListSummary {
  total: number;
  active: number;
  blocked: number;
  withOrders: number;
  newThisMonth: number;
}

/**
 * Super-Admin customer-account aggregate.
 *
 * Every count is a database aggregate over ALL customers — never the rows on the
 * current page — and is scoped to `role: "customer"`, matching the list beneath
 * it exactly.
 */
export async function getAdminCustomerSummary(): Promise<CustomerListSummary> {
  const base = { role: "customer" } as const;
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [total, blocked, withOrders, newThisMonth] = await Promise.all([
    prisma.user.count({ where: base }),
    prisma.user.count({ where: { ...base, isBlocked: true } }),
    prisma.user.count({ where: { ...base, orders: { some: {} } } }),
    prisma.user.count({ where: { ...base, dateJoined: { gte: startOfMonth } } }),
  ]);
  return { total, active: total - blocked, blocked, withOrders, newThisMonth };
}

export interface StaffListSummary {
  total: number;
  active: number;
  managers: number;
  riders: number;
  withoutBranch: number;
}

/**
 * Staff-directory aggregate.
 *
 * `STAFF_ROLES` is the SAME role list the directory query uses (super admins and
 * customers are both excluded), so every card matches the list beneath it
 * exactly. `withoutBranch` counts branch managers who manage no branch — the
 * only staff role the schema ties to a branch.
 */
export const STAFF_ROLES = [
  "management",
  "marketing",
  "branch_manager",
  "accounts",
  "rider",
] as const;

export async function getAdminStaffSummary(): Promise<StaffListSummary> {
  const base: Prisma.UserWhereInput = { role: { in: [...STAFF_ROLES] } };
  const [total, active, managers, riders, withoutBranch] = await Promise.all([
    prisma.user.count({ where: base }),
    prisma.user.count({ where: { ...base, isActive: true } }),
    prisma.user.count({ where: { role: "branch_manager" } }),
    prisma.user.count({ where: { role: "rider" } }),
    prisma.user.count({ where: { role: "branch_manager", managedBranches: { none: {} } } }),
  ]);
  return { total, active, managers, riders, withoutBranch };
}

export interface ManagerAssignmentSummary {
  total: number;
  active: number;
  completed: number;
  activeManagers: number;
  branchesWithoutManager: number;
}

/** Manager assignment-history aggregate (super admin scope). */
export async function getManagerAssignmentSummary(): Promise<ManagerAssignmentSummary> {
  const [total, active, activeManagers, branchesWithoutManager] = await Promise.all([
    prisma.branchManagerAssignment.count(),
    // `relievedAt: null` is the schema's marker for a currently-active posting.
    prisma.branchManagerAssignment.count({ where: { relievedAt: null } }),
    prisma.user.count({ where: { role: "branch_manager", isActive: true } }),
    prisma.branch.count({ where: { managerId: null, isArchived: false } }),
  ]);
  return { total, active, completed: total - active, activeManagers, branchesWithoutManager };
}

export interface ActivityLogSummary {
  total: number;
  today: number;
  login: number;
  logout: number;
  action: number;
}

/**
 * Manager activity-log aggregate.
 *
 * Only the buckets the data genuinely records: the three `activityType` values
 * plus a today count. No "security-sensitive" classification is invented,
 * because nothing in the schema marks one.
 */
export async function getActivityLogSummary(): Promise<ActivityLogSummary> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const [byType, today] = await Promise.all([
    prisma.managerActivityLog.groupBy({ by: ["activityType"], _count: { _all: true } }),
    prisma.managerActivityLog.count({ where: { timestamp: { gte: startOfDay } } }),
  ]);
  const count = (type: string) =>
    byType.filter((row) => row.activityType === type).reduce((sum, row) => sum + row._count._all, 0);
  return {
    total: byType.reduce((sum, row) => sum + row._count._all, 0),
    today,
    login: count("login"),
    logout: count("logout"),
    action: count("action"),
  };
}
