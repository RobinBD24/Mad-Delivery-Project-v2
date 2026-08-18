import "server-only";
import type { User } from "@prisma/client";

import { prisma } from "@/lib/db";
import { forbidden, sk } from "@/lib/http/errors";
import { branchForManager } from "@/lib/selectors";

/**
 * PHASE I — the Branch Manager's LIVE operational snapshot.
 *
 * Every number below is a real database count for the manager's OWN branch,
 * resolved from the authenticated user. There is no `branch_id` parameter at
 * all, so a forged branch id is not "ignored" as an afterthought — it has
 * nowhere to enter. Nothing here is derived, estimated or padded: a status with
 * no orders reports 0 rather than being omitted.
 */

/** The order statuses the operational board tracks, in workflow order. */
export const LIVE_ORDER_STATUSES = [
  "pending",
  "accepted",
  "preparing",
  "ready",
  "picked_up",
  "on_the_way",
  "delivered",
  "cancelled",
] as const;

function startOfTodayUtc(): Date {
  return new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);
}

export interface BranchLiveSnapshot {
  branch: { id: number; name: string; is_active: boolean; is_archived: boolean } | null;
  orders: Record<string, number>;
  orders_total: number;
  rider_assigned: number;
  riders: { total: number; online: number };
  staff: { active: number; quit: number };
  attendance: Record<string, number>;
  delivery_areas: { total: number; held: number; inactive: number };
  payments: { pending_verification: number };
  notifications: { unread: number };
  generated_at: string;
}

export async function branchLiveSnapshot(user: User): Promise<BranchLiveSnapshot> {
  if (user.role !== "branch_manager" && user.role !== "super_admin") {
    throw forbidden(sk("errors.server.forbidden"));
  }
  const branch = await branchForManager(user.id);
  // A super admin without a managed branch, or a manager whose branch was
  // removed, gets an explicit empty snapshot instead of a crash.
  if (!branch) {
    return {
      branch: null,
      orders: Object.fromEntries(LIVE_ORDER_STATUSES.map((s) => [s, 0])),
      orders_total: 0,
      rider_assigned: 0,
      riders: { total: 0, online: 0 },
      staff: { active: 0, quit: 0 },
      attendance: { present: 0, absent: 0, late: 0, leave: 0, half_day: 0, total: 0 },
      delivery_areas: { total: 0, held: 0, inactive: 0 },
      payments: { pending_verification: 0 },
      notifications: { unread: 0 },
      generated_at: new Date().toISOString(),
    };
  }

  const today = startOfTodayUtc();
  const branchWhere = { branchId: branch.id, createdAt: { gte: today } };

  const [
    grouped,
    riderAssigned,
    ridersTotal,
    ridersOnline,
    staffActive,
    staffQuit,
    attendanceGrouped,
    areasTotal,
    areasHeld,
    areasInactive,
    pendingPayments,
    unreadNotifications,
  ] = await Promise.all([
    // Real per-status counts for today's orders at this branch.
    prisma.order.groupBy({ by: ["status"], where: branchWhere, _count: { status: true } }),
    // "Rider assigned" is a fact about the order, not a status: an order that
    // has a rider but is not yet picked up.
    prisma.order.count({
      where: { ...branchWhere, riderId: { not: null }, status: { in: ["accepted", "preparing", "ready"] } },
    }),
    prisma.user.count({
      where: { role: "rider", status: "approved", riderProfile: { assignedBranchId: branch.id } },
    }),
    // Online = an open duty session at THIS branch right now.
    prisma.riderBranchDutySession.count({ where: { branchId: branch.id, endedAt: null } }),
    prisma.branchEmployee.count({ where: { branchId: branch.id, employmentStatus: "active", isActive: true } }),
    prisma.branchEmployee.count({ where: { branchId: branch.id, employmentStatus: "quit_job" } }),
    prisma.employeeAttendance.groupBy({
      by: ["status"],
      where: { branchId: branch.id, date: today },
      _count: { status: true },
    }),
    prisma.branchDeliveryArea.count({ where: { branchId: branch.id } }),
    prisma.branchDeliveryArea.count({ where: { branchId: branch.id, isHeld: true } }),
    prisma.branchDeliveryArea.count({ where: { branchId: branch.id, isActive: false } }),
    // PHASE S ties in here: manual bKash submissions waiting on this branch.
    prisma.order.count({ where: { branchId: branch.id, paymentStatus: "pending_verification" } }),
    prisma.notification.count({ where: { userId: user.id, isRead: false } }),
  ]);

  const orders: Record<string, number> = Object.fromEntries(LIVE_ORDER_STATUSES.map((s) => [s, 0]));
  for (const row of grouped) orders[row.status] = row._count.status;

  const attendance: Record<string, number> = { present: 0, absent: 0, late: 0, leave: 0, half_day: 0, total: 0 };
  for (const row of attendanceGrouped) {
    attendance[row.status] = row._count.status;
    attendance.total += row._count.status;
  }

  return {
    branch: {
      id: branch.id,
      name: branch.name,
      is_active: branch.isActive,
      is_archived: branch.isArchived,
    },
    orders,
    orders_total: Object.values(orders).reduce((a, b) => a + b, 0),
    rider_assigned: riderAssigned,
    riders: { total: ridersTotal, online: ridersOnline },
    staff: { active: staffActive, quit: staffQuit },
    attendance,
    delivery_areas: { total: areasTotal, held: areasHeld, inactive: areasInactive },
    payments: { pending_verification: pendingPayments },
    notifications: { unread: unreadNotifications },
    generated_at: new Date().toISOString(),
  };
}
