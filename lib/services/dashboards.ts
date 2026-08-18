import "server-only";
import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { ORDER_INCLUDE, branchForManager, dutyHistory, todayDuty } from "@/lib/selectors";
import {
  serializeActivityLog,
  serializeDutyLog,
  serializeOrder,
  serializePublicBranch,
} from "@/lib/serializers";
import { roleDisplay } from "@/lib/constants/enums";
import { riderTravelDistanceKm } from "@/lib/services/rider-location";
import { riderWalletSummary } from "@/lib/services/wallet";
import { daysAgo, endOfToday, isoDate, startOfToday, weekBounds } from "@/lib/utils/dates";
import type { OrderStatus, Role } from "@/types";

interface DashboardIdentity {
  id: number;
}

interface RiderDashboardIdentity extends DashboardIdentity {
  phone: string;
}

const ORDER_STATUSES: OrderStatus[] = [
  "pending", "accepted", "preparing", "ready", "picked_up", "on_the_way", "delivered", "cancelled",
];

const num = (d: Prisma.Decimal | null | undefined) => (d ? d.toNumber() : 0);

async function statusBreakdown(where: Prisma.OrderWhereInput): Promise<Record<OrderStatus, number>> {
  const rows = await prisma.order.groupBy({ by: ["status"], where, _count: { _all: true } });
  const map = new Map(rows.map((r) => [r.status, r._count._all]));
  return Object.fromEntries(ORDER_STATUSES.map((s) => [s, map.get(s) ?? 0])) as Record<OrderStatus, number>;
}

async function weeklySeries(
  where: Prisma.OrderWhereInput,
  mode: "sales" | "orders",
  dateField: "createdAt" | "updatedAt" = "createdAt",
): Promise<{ date: string; total: number }[]> {
  const { start, end, days } = weekBounds();
  const filter: Prisma.OrderWhereInput =
    mode === "sales"
      ? { ...where, status: "delivered", [dateField]: { gte: start, lte: end } }
      : { ...where, [dateField]: { gte: start, lte: end } };
  const orders = await prisma.order.findMany({
    where: filter,
    select: { totalAmount: true, createdAt: true, updatedAt: true },
  });
  return days.map((day) => {
    const next = new Date(day);
    next.setDate(day.getDate() + 1);
    const dayOrders = orders.filter((o) => {
      const d = dateField === "createdAt" ? o.createdAt : o.updatedAt;
      return d >= day && d < next;
    });
    const total =
      mode === "sales"
        ? dayOrders.reduce((sum, o) => sum + num(o.totalAmount), 0)
        : dayOrders.length;
    return { date: isoDate(day), total };
  });
}

async function salesByBranch(where: Prisma.OrderWhereInput) {
  const rows = await prisma.order.groupBy({
    by: ["branchId"],
    where: { ...where, status: "delivered" },
    _count: { _all: true },
    _sum: { totalAmount: true },
  });
  const branches = await prisma.branch.findMany({
    where: { id: { in: rows.map((r) => r.branchId) } },
    select: { id: true, name: true },
  });
  const nameOf = new Map(branches.map((b) => [b.id, b.name]));
  return rows
    .map((r) => ({
      branch__id: r.branchId,
      branch__name: nameOf.get(r.branchId) ?? "",
      orders: r._count._all,
      sales: num(r._sum.totalAmount),
    }))
    .sort((a, b) => b.sales - a.sales);
}

async function popularProducts(orderWhere: Prisma.OrderWhereInput, limit = 5) {
  const items = await prisma.orderItem.findMany({
    where: { order: orderWhere },
    select: { productId: true, quantity: true, unitPrice: true, product: { select: { name: true } } },
  });
  const agg = new Map<number, { name: string; order_count: number; revenue: number }>();
  for (const i of items) {
    const cur = agg.get(i.productId) ?? { name: i.product.name, order_count: 0, revenue: 0 };
    cur.order_count += 1;
    cur.revenue += num(i.unitPrice) * i.quantity;
    agg.set(i.productId, cur);
  }
  return [...agg.entries()]
    .map(([id, v]) => ({ product__id: id, product__name: v.name, order_count: v.order_count, revenue: v.revenue }))
    .sort((a, b) => b.order_count - a.order_count)
    .slice(0, limit);
}

const todayWhere = (): Prisma.OrderWhereInput => ({ createdAt: { gte: startOfToday(), lte: endOfToday() } });

async function sumDelivered(where: Prisma.OrderWhereInput): Promise<number> {
  const r = await prisma.order.aggregate({ where: { ...where, status: "delivered" }, _sum: { totalAmount: true } });
  return num(r._sum.totalAmount);
}

// ── Super Admin ───────────────────────────────────────────────────────
export async function superAdminDashboard() {
  const manageable: Prisma.UserWhereInput = { role: { not: "super_admin" } };
  const [
    total, pending, approved, rejected, customers, riders, branchManagers,
    branchesTotal, branchesActive, ordersTotal, todayOrders,
  ] = await Promise.all([
    prisma.user.count({ where: manageable }),
    prisma.user.count({ where: { ...manageable, status: "pending" } }),
    prisma.user.count({ where: { ...manageable, status: "approved" } }),
    prisma.user.count({ where: { ...manageable, status: "rejected" } }),
    prisma.user.count({ where: { ...manageable, role: "customer" } }),
    prisma.user.count({ where: { ...manageable, role: "rider" } }),
    prisma.user.count({ where: { ...manageable, role: "branch_manager" } }),
    prisma.branch.count(),
    prisma.branch.count({ where: { isActive: true } }),
    prisma.order.count(),
    prisma.order.count({ where: todayWhere() }),
  ]);

  const byRoleRows = await prisma.user.groupBy({ by: ["role"], _count: { _all: true } });
  const byRoleMap = new Map(byRoleRows.map((r) => [r.role, r._count._all]));
  const by_role = Object.fromEntries(
    (["super_admin", "management", "marketing", "branch_manager", "accounts", "rider", "customer"] as Role[]).map(
      (r) => [r, byRoleMap.get(r) ?? 0],
    ),
  ) as Record<Role, number>;

  const pendingQueue = await prisma.user.findMany({
    where: { ...manageable, status: "pending" },
    orderBy: { dateJoined: "desc" },
    take: 10,
  });
  const recentOrders = await prisma.order.findMany({ include: ORDER_INCLUDE, orderBy: { createdAt: "desc" }, take: 8 });
  const recentActivity = await prisma.managerActivityLog.findMany({
    include: { manager: true, branch: true },
    orderBy: { timestamp: "desc" },
    take: 10,
  });

  // Per-branch snapshot.
  const allBranches = await prisma.branch.findMany({ include: { manager: true }, orderBy: [{ isActive: "desc" }, { name: "asc" }] });
  const branch_overview = await Promise.all(
    allBranches.map(async (b) => {
      const [todayCount, todaySales, riderCount] = await Promise.all([
        prisma.order.count({ where: { branchId: b.id, ...todayWhere() } }),
        sumDelivered({ branchId: b.id, ...todayWhere() }),
        prisma.user.count({ where: { role: "rider", status: "approved", riderProfile: { assignedBranchId: b.id } } }),
      ]);
      return {
        id: b.id,
        name: b.name,
        manager_name: b.manager ? `${b.manager.firstName} ${b.manager.lastName}`.trim() || null : null,
        is_active: b.isActive,
        today_orders: todayCount,
        today_sales: todaySales,
        riders: riderCount,
      };
    }),
  );

  return {
    users: { total, pending, approved, rejected, customers, riders, branch_managers: branchManagers, by_role },
    branches: { total: branchesTotal, active: branchesActive },
    orders: {
      total: ordersTotal,
      today: todayOrders,
      today_sales: await sumDelivered(todayWhere()),
      total_sales: await sumDelivered({}),
      status_breakdown: await statusBreakdown({}),
    },
    weekly_sales: await weeklySeries({}, "sales"),
    weekly_orders: await weeklySeries({}, "orders"),
    branch_performance: await salesByBranch({}),
    branch_overview,
    pending_queue: pendingQueue.map((u) => ({
      id: u.id,
      username: u.username,
      full_name: `${u.firstName} ${u.lastName}`.trim(),
      email: u.email,
      role: u.role as Role,
      role_display: roleDisplay(u.role),
      phone: u.phone,
      date_joined: u.dateJoined.toISOString(),
    })),
    recent_orders: recentOrders.map(serializeOrder),
    recent_activity: recentActivity.map(serializeActivityLog),
  };
}

// ── Management ────────────────────────────────────────────────────────
export async function managementDashboard() {
  const manageable: Prisma.UserWhereInput = { role: { not: "super_admin" } };
  const [totalUsers, totalCustomers, totalRiders, pendingUsers, activeBranches, totalOrders, deliveredOrders] =
    await Promise.all([
      prisma.user.count({ where: manageable }),
      prisma.user.count({ where: { ...manageable, role: "customer", status: "approved" } }),
      prisma.user.count({ where: { ...manageable, role: "rider", status: "approved" } }),
      prisma.user.count({ where: { ...manageable, status: "pending" } }),
      prisma.branch.count({ where: { isActive: true } }),
      prisma.order.count(),
      prisma.order.count({ where: { status: "delivered" } }),
    ]);

  const deliveredRider = await prisma.order.groupBy({
    by: ["riderId"],
    where: { status: "delivered", riderId: { not: null } },
    _count: { _all: true },
    _sum: { totalAmount: true },
  });
  const riderIds = deliveredRider.map((r) => r.riderId!).filter(Boolean);
  const riderUsers = await prisma.user.findMany({ where: { id: { in: riderIds } } });
  const riderMap = new Map(riderUsers.map((u) => [u.id, u]));
  const top_riders = deliveredRider
    .map((r) => {
      const u = riderMap.get(r.riderId!);
      return {
        rider__id: r.riderId!,
        rider__first_name: u?.firstName ?? "",
        rider__last_name: u?.lastName ?? "",
        rider__username: u?.username ?? "",
        deliveries: r._count._all,
        sales: num(r._sum.totalAmount),
      };
    })
    .sort((a, b) => b.deliveries - a.deliveries)
    .slice(0, 5);

  return {
    total_users: totalUsers,
    total_customers: totalCustomers,
    total_riders: totalRiders,
    pending_users: pendingUsers,
    active_branches: activeBranches,
    total_orders: totalOrders,
    delivered_orders: deliveredOrders,
    total_sales: await sumDelivered({}),
    today_orders: await prisma.order.count({ where: todayWhere() }),
    today_sales: await sumDelivered(todayWhere()),
    status_breakdown: await statusBreakdown({}),
    weekly_sales: await weeklySeries({}, "sales"),
    branch_performance: await salesByBranch({}),
    top_riders,
  };
}

// ── Marketing ─────────────────────────────────────────────────────────
export async function marketingDashboard() {
  const customerWhere: Prisma.UserWhereInput = { role: "customer", status: "approved" };
  const [totalCustomers, newToday, new7d, new30d, totalOrders, activeBranches] = await Promise.all([
    prisma.user.count({ where: customerWhere }),
    prisma.user.count({ where: { ...customerWhere, dateJoined: { gte: startOfToday() } } }),
    prisma.user.count({ where: { ...customerWhere, dateJoined: { gte: daysAgo(7) } } }),
    prisma.user.count({ where: { ...customerWhere, dateJoined: { gte: daysAgo(30) } } }),
    prisma.order.count(),
    prisma.branch.count({ where: { isActive: true } }),
  ]);

  const catItems = await prisma.orderItem.findMany({
    where: { product: { categoryId: { not: null } } },
    select: { quantity: true, product: { select: { category: { select: { id: true, name: true } } } } },
  });
  const catAgg = new Map<number, { name: string; order_count: number; quantity: number }>();
  for (const i of catItems) {
    const cat = i.product.category;
    if (!cat) continue;
    const cur = catAgg.get(cat.id) ?? { name: cat.name, order_count: 0, quantity: 0 };
    cur.order_count += 1;
    cur.quantity += i.quantity;
    catAgg.set(cat.id, cur);
  }
  const top_categories = [...catAgg.entries()]
    .map(([id, v]) => ({ product__category__id: id, product__category__name: v.name, order_count: v.order_count, quantity: v.quantity }))
    .sort((a, b) => b.order_count - a.order_count)
    .slice(0, 5);

  const recentOrders = await prisma.order.findMany({ include: ORDER_INCLUDE, orderBy: { createdAt: "desc" }, take: 8 });

  return {
    total_customers: totalCustomers,
    new_customers_today: newToday,
    new_customers_7d: new7d,
    new_customers_30d: new30d,
    total_orders: totalOrders,
    active_branches: activeBranches,
    popular_products: await popularProducts({}),
    top_categories,
    recent_orders: recentOrders.map(serializeOrder),
  };
}

// ── Accounts ──────────────────────────────────────────────────────────
export async function accountsDashboard() {
  const [deliveredOrders, cancelledOrders] = await Promise.all([
    prisma.order.count({ where: { status: "delivered" } }),
    prisma.order.count({ where: { status: "cancelled" } }),
  ]);
  const byPayment = await prisma.order.groupBy({
    by: ["paymentMethod"],
    where: { status: "delivered" },
    _count: { _all: true },
    _sum: { totalAmount: true },
  });
  return {
    total_sales: await sumDelivered({}),
    delivered_orders: deliveredOrders,
    cancelled_orders: cancelledOrders,
    sales_by_branch: await salesByBranch({}),
    sales_by_payment: byPayment.map((r) => ({
      payment_method: r.paymentMethod,
      orders: r._count._all,
      sales: num(r._sum.totalAmount),
    })),
  };
}

// ── Branch Manager ────────────────────────────────────────────────────
export async function branchManagerDashboard(user: DashboardIdentity) {
  const branch = await branchForManager(user.id);
  if (!branch) return { branch: null };

  const bWhere: Prisma.OrderWhereInput = { branchId: branch.id };
  const todayOrders = await prisma.order.findMany({ where: { ...bWhere, ...todayWhere() }, select: { status: true, totalAmount: true } });
  const [totalProducts, branchRiders] = await Promise.all([
    prisma.product.count({ where: { branchId: branch.id } }),
    prisma.user.count({ where: { role: "rider", status: "approved", riderProfile: { assignedBranchId: branch.id } } }),
  ]);
  const onDuty = await prisma.user.count({
    where: {
      role: "rider", status: "approved", riderProfile: { assignedBranchId: branch.id },
      dutyLogs: { some: { date: startOfToday(), clockOut: null } },
    },
  });
  const recent = await prisma.order.findMany({
    where: { ...bWhere, ...todayWhere() },
    include: ORDER_INCLUDE,
    orderBy: { createdAt: "desc" },
    take: 8,
  });

  return {
    // req #5 — the Branch Manager's OWN assigned branch identity. Resolved
    // server-side from the authenticated manager (never a client-supplied id).
    // brand_type comes from the existing Branch.brandType enum-like column, so
    // the dashboard never invents its own labels.
    branch: {
      id: branch.id,
      name: branch.name,
      address: branch.address,
      is_active: branch.isActive,
      is_archived: branch.isArchived,
      brand_type: branch.brandType,
      // PHASE 11/15 — the delivery rules this outlet currently operates under.
      delivery_radius_km: Number(branch.deliveryRadiusKm),
      delivery_fee: Number(branch.deliveryFee),
      delivery_area_count: await prisma.branchDeliveryArea.count({
        where: { branchId: branch.id, isActive: true },
      }),
    },
    today: {
      total_orders: todayOrders.length,
      sales: todayOrders.filter((o) => o.status === "delivered").reduce((s, o) => s + num(o.totalAmount), 0),
      status_breakdown: await statusBreakdown({ ...bWhere, ...todayWhere() }),
    },
    weekly_sales: await weeklySeries(bWhere, "sales"),
    popular_items: await popularProducts(bWhere),
    recent_orders: recent.map(serializeOrder),
    riders: { total: branchRiders, on_duty: onDuty, off_duty: branchRiders - onDuty },
    total_products: totalProducts,
  };
}

// ── Rider ─────────────────────────────────────────────────────────────
export async function riderDashboard(user: RiderDashboardIdentity) {
  const [duty, profile, activeOrders, history] = await Promise.all([
    todayDuty(user.id),
    prisma.riderProfile.findUnique({ where: { userId: user.id }, include: { assignedBranch: true } }),
    prisma.order.findMany({
      where: { riderId: user.id, status: { notIn: ["delivered", "cancelled"] } },
      include: ORDER_INCLUDE,
      orderBy: { createdAt: "desc" },
    }),
    dutyHistory(user.id, 30),
  ]);

  let onlineMinutes = 0;
  if (duty) {
    if (duty.clockOut) onlineMinutes = Math.floor((duty.clockOut.getTime() - duty.clockIn.getTime()) / 60000);
    else onlineMinutes = Math.floor((Date.now() - duty.clockIn.getTime()) / 60000);
  }

  const { start, end, days } = weekBounds();
  const [deliveredToday, totalDelivered, cancelledTotal, ratingAgg, wallet, distanceTodayKm, todayCommissions, weekCommissions] =
    await Promise.all([
      prisma.order.count({ where: { riderId: user.id, status: "delivered", updatedAt: { gte: startOfToday(), lte: endOfToday() } } }),
      prisma.order.count({ where: { riderId: user.id, status: "delivered" } }),
      prisma.order.count({ where: { riderId: user.id, status: "cancelled" } }),
      prisma.riderReview.aggregate({ where: { riderId: user.id }, _avg: { rating: true }, _count: { _all: true } }),
      riderWalletSummary(user.id),
      riderTravelDistanceKm(user.id, startOfToday()),
      prisma.riderCommission.findMany({
        where: { riderId: user.id, createdAt: { gte: startOfToday(), lte: endOfToday() } },
        select: { amount: true },
      }),
      prisma.riderCommission.findMany({
        where: { riderId: user.id, createdAt: { gte: start, lte: end } },
        select: { amount: true, createdAt: true },
      }),
    ]);

  // Delivered-order count per day for the current week (delivery day = updatedAt).
  const weekDelivered = await prisma.order.findMany({
    where: { riderId: user.id, status: "delivered", updatedAt: { gte: start, lte: end } },
    select: { updatedAt: true },
  });
  const weekly_deliveries = days.map((day) => {
    const next = new Date(day);
    next.setDate(day.getDate() + 1);
    return {
      date: isoDate(day),
      total: weekDelivered.filter((o) => o.updatedAt >= day && o.updatedAt < next).length,
    };
  });
  // Real commission earnings per day for the same week window.
  const weekly_earnings = days.map((day) => {
    const next = new Date(day);
    next.setDate(day.getDate() + 1);
    return {
      date: isoDate(day),
      total: weekCommissions
        .filter((c) => c.createdAt >= day && c.createdAt < next)
        .reduce((s, c) => s + num(c.amount), 0),
    };
  });

  return {
    assigned_branch: profile?.assignedBranch
      ? { id: profile.assignedBranch.id, name: profile.assignedBranch.name }
      : null,
    profile: {
      vehicle_type: profile?.vehicleType ?? "",
      bike_registration_number: profile?.bikeRegistrationNumber ?? "",
      blood_group: profile?.bloodGroup ?? "",
      phone: user.phone,
    },
    is_online: profile?.isOnline ?? false,
    today_duty: duty ? serializeDutyLog(duty) : null,
    duty_history: history.map(serializeDutyLog),
    active_orders: activeOrders.map(serializeOrder),
    delivered_today: deliveredToday,
    online_minutes: onlineMinutes,
    total_delivered: totalDelivered,
    cancelled_total: cancelledTotal,
    weekly_deliveries,
    weekly_earnings,
    earnings_today: todayCommissions.reduce((s, c) => s + num(c.amount), 0),
    earnings_week: weekly_earnings.reduce((s, d) => s + d.total, 0),
    distance_today_km: Math.round(distanceTodayKm * 10) / 10,
    avg_rating: ratingAgg._avg.rating ? Math.round(ratingAgg._avg.rating * 10) / 10 : null,
    rating_count: ratingAgg._count._all,
    wallet: {
      available_balance: num(wallet.availableBalance),
      pending_withdrawals: num(wallet.pendingAmount),
      total_earnings: num(wallet.totalEarnings),
      paid_out: num(wallet.paidAmount),
    },
  };
}

// ── Customer ──────────────────────────────────────────────────────────
export async function customerDashboard(user: DashboardIdentity) {
  const [branches, recentOrders, activeCount, totalOrders] = await Promise.all([
    prisma.branch.findMany({ where: { isActive: true }, orderBy: { createdAt: "desc" } }),
    prisma.order.findMany({ where: { customerId: user.id }, include: ORDER_INCLUDE, orderBy: { createdAt: "desc" }, take: 5 }),
    prisma.order.count({ where: { customerId: user.id, status: { notIn: ["delivered", "cancelled"] } } }),
    prisma.order.count({ where: { customerId: user.id } }),
  ]);
  return {
    branches: branches.map(serializePublicBranch),
    recent_orders: recentOrders.map(serializeOrder),
    active_order_count: activeCount,
    total_orders: totalOrders,
  };
}
