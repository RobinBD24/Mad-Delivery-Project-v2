import "server-only";
import type { Prisma, User } from "@prisma/client";

import { prisma } from "@/lib/db";
import { forbidden, notFound, sk, validationError } from "@/lib/http/errors";
import { branchForManager } from "@/lib/selectors";
import { midnight } from "@/lib/utils/dates";
import { createNotification, notifyUsers, notifyBranchManagers } from "@/lib/services/notifications";

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

type ReservationRel = {
  id: number;
  branchId: number;
  customerId: number;
  guestName: string;
  guestPhone: string;
  partySize: number;
  requestedAt: Date;
  status: string;
  note: string;
  rejectionReason?: string;
  tableId?: number | null;
  createdAt: Date;
  customer?: { firstName: string; lastName: string; username: string; phone: string } | null;
  branch?: { name: string } | null;
  table?: { id: number; name: string; seats: number } | null;
  messages?: { id: number; senderId: number; body: string; createdAt: Date; sender?: { firstName: string; lastName: string; role: string } | null }[];
};

export function serializeReservation(r: ReservationRel) {
  return {
    id: r.id,
    branch: r.branchId,
    branch_name: r.branch?.name ?? "",
    customer: r.customerId,
    customer_name: r.customer ? `${r.customer.firstName} ${r.customer.lastName}`.trim() || r.customer.username : "",
    guest_name: r.guestName,
    guest_phone: r.guestPhone,
    party_size: r.partySize,
    requested_at: r.requestedAt.toISOString(),
    status: r.status,
    note: r.note,
    rejection_reason: r.rejectionReason ?? "",
    table: r.tableId ?? null,
    table_name: r.table?.name ?? null,
    table_seats: r.table?.seats ?? null,
    created_at: r.createdAt.toISOString(),
    messages: r.messages?.map((m) => ({
      id: m.id,
      sender: m.senderId,
      sender_name: m.sender ? `${m.sender.firstName} ${m.sender.lastName}`.trim() : "",
      sender_role: m.sender?.role ?? "",
      body: m.body,
      created_at: m.createdAt.toISOString(),
    })),
  };
}

/** The branch a manager runs, or throw a helpful 403. */
export async function requireManagerBranch(user: User) {
  const branch = await branchForManager(user.id);
  if (!branch) throw forbidden(sk("errors.ops.noBranchAssigned"));
  return branch;
}

/**
 * The branch a user may MANAGE (Phase B modules: zones, prep time, tables,
 * employees, attendance):
 * - super_admin → the submitted branchId (must exist).
 * - branch_manager → ALWAYS their assigned branch; a submitted branchId is
 *   ignored, blocking cross-branch spoofing (IDOR).
 * Anyone else → 403.
 */
export async function resolveManageableBranch(user: User, submittedBranchId?: number) {
  if (user.role === "branch_manager") return requireManagerBranch(user);
  if (user.role === "super_admin") {
    if (!submittedBranchId || Number.isNaN(submittedBranchId)) {
      throw validationError({ branch_id: sk("errors.ops.branchRequired") });
    }
    const branch = await prisma.branch.findUnique({ where: { id: submittedBranchId } });
    if (!branch) throw validationError({ branch_id: sk("errors.ops.branchRequired") });
    return branch;
  }
  throw forbidden(sk("errors.ops.noBranchAssigned"));
}

/** Assert the given resource branchId is one the user may manage (IDOR guard). */
export async function assertManagesBranch(user: User, branchId: number) {
  if (user.role === "super_admin") return;
  if (user.role === "branch_manager") {
    const branch = await branchForManager(user.id);
    if (!branch || branch.id !== branchId) throw forbidden(sk("errors.ops.noBranchAssigned"));
    return;
  }
  throw forbidden(sk("errors.ops.noBranchAssigned"));
}

// ── Delivery hours / time slots ─────────────────────────────────────────
export async function addTimeSlot(branchId: number, input: { label: string; startTime: string; endTime: string }) {
  if (!TIME_RE.test(input.startTime) || !TIME_RE.test(input.endTime)) {
    throw validationError({ time: sk("errors.ops.timeInvalid") });
  }
  if (input.endTime <= input.startTime) {
    throw validationError({ end_time: sk("errors.ops.endTimeAfterStart") });
  }
  return prisma.deliveryTimeSlot.create({
    data: { branchId, label: input.label.trim(), startTime: input.startTime, endTime: input.endTime },
  });
}

// ── Staff attendance ────────────────────────────────────────────────────
export async function markAttendance(user: User, status: string, note: string) {
  if (!["present", "absent", "leave"].includes(status)) {
    throw validationError({ status: sk("errors.ops.statusInvalid") });
  }
  const branch = await branchForManager(user.id).catch(() => null);
  return prisma.staffAttendance.upsert({
    where: { userId_date: { userId: user.id, date: midnight() } },
    update: { status, note: note.trim() },
    create: { userId: user.id, branchId: branch?.id ?? null, date: midnight(), status, note: note.trim() },
  });
}

// ── B3: Graphical branch tables ─────────────────────────────────────────
export const TABLE_STATUSES = ["available", "occupied", "out_of_service"] as const;

export function serializeTable(t: {
  id: number; branchId: number; name: string; posX: number; posY: number; width: number; height: number;
  seats: number; status: string; section: string; sortOrder: number; isActive: boolean;
}) {
  return {
    id: t.id,
    branch: t.branchId,
    name: t.name,
    pos_x: t.posX,
    pos_y: t.posY,
    width: t.width,
    height: t.height,
    seats: t.seats,
    status: t.status,
    section: t.section,
    sort_order: t.sortOrder,
    is_active: t.isActive,
  };
}

interface TableInput {
  branchId?: number;
  name: string;
  posX?: number;
  posY?: number;
  width?: number;
  height?: number;
  seats?: number;
  status?: string;
  section?: string;
  sortOrder?: number;
  isActive?: boolean;
}

function validateTable(input: { name: string; seats?: number; status?: string }) {
  if (!input.name.trim()) throw validationError({ name: sk("errors.ops.tableNameRequired") });
  if (input.seats !== undefined) {
    const s = Number(input.seats);
    if (!Number.isFinite(s) || s < 1 || s > 50) throw validationError({ seats: sk("errors.ops.invalidCapacity") });
  }
  if (input.status !== undefined && !(TABLE_STATUSES as readonly string[]).includes(input.status)) {
    throw validationError({ status: sk("errors.ops.statusInvalid") });
  }
}

export async function tablesForBranch(branchId: number) {
  return prisma.branchTable.findMany({ where: { branchId }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] });
}

export async function createTable(user: User, input: TableInput) {
  const branch = await resolveManageableBranch(user, input.branchId);
  validateTable(input);
  const dup = await prisma.branchTable.findFirst({ where: { branchId: branch.id, name: input.name.trim() } });
  if (dup) throw validationError({ name: sk("errors.ops.tableNameDuplicate") });
  return prisma.branchTable.create({
    data: {
      branchId: branch.id,
      name: input.name.trim(),
      posX: Math.round(Number(input.posX ?? 0)),
      posY: Math.round(Number(input.posY ?? 0)),
      width: Math.round(Number(input.width ?? 80)),
      height: Math.round(Number(input.height ?? 80)),
      seats: Math.round(Number(input.seats ?? 4)),
      status: input.status && (TABLE_STATUSES as readonly string[]).includes(input.status) ? input.status : "available",
      section: (input.section ?? "").trim(),
      sortOrder: Math.round(Number(input.sortOrder ?? 0)),
      isActive: input.isActive ?? true,
    },
  });
}

export async function updateTable(user: User, tableId: number, input: Partial<TableInput>) {
  const table = await prisma.branchTable.findUnique({ where: { id: tableId } });
  if (!table) throw notFound(sk("errors.ops.tableRequired"));
  await assertManagesBranch(user, table.branchId);
  if (input.name !== undefined || input.seats !== undefined || input.status !== undefined) {
    validateTable({ name: input.name ?? table.name, seats: input.seats, status: input.status });
  }
  if (input.name !== undefined && input.name.trim() !== table.name) {
    const dup = await prisma.branchTable.findFirst({ where: { branchId: table.branchId, name: input.name.trim() } });
    if (dup) throw validationError({ name: sk("errors.ops.tableNameDuplicate") });
  }
  const data: Prisma.BranchTableUpdateInput = {};
  if (input.name !== undefined) data.name = input.name.trim();
  if (input.posX !== undefined) data.posX = Math.round(Number(input.posX));
  if (input.posY !== undefined) data.posY = Math.round(Number(input.posY));
  if (input.width !== undefined) data.width = Math.round(Number(input.width));
  if (input.height !== undefined) data.height = Math.round(Number(input.height));
  if (input.seats !== undefined) data.seats = Math.round(Number(input.seats));
  if (input.status !== undefined) data.status = input.status;
  if (input.section !== undefined) data.section = input.section.trim();
  if (input.sortOrder !== undefined) data.sortOrder = Math.round(Number(input.sortOrder));
  if (input.isActive !== undefined) data.isActive = input.isActive;
  return prisma.branchTable.update({ where: { id: tableId }, data });
}

export async function deleteTable(user: User, tableId: number) {
  const table = await prisma.branchTable.findUnique({ where: { id: tableId } });
  if (!table) throw notFound(sk("errors.ops.tableRequired"));
  await assertManagesBranch(user, table.branchId);
  await prisma.branchTable.delete({ where: { id: tableId } });
}

// Reservations that hold a table (block new bookings) — accepted or confirmed.
const BLOCKING_STATUSES = ["accepted", "confirmed"];
// A table is considered double-booked when another blocking reservation exists
// within this window of the requested time.
const OVERLAP_WINDOW_MS = 2 * 60 * 60 * 1000; // 2 hours

// ── Table reservations ──────────────────────────────────────────────────
export const RESERVATION_INCLUDE = {
  customer: true,
  branch: true,
  table: true,
} satisfies Prisma.TableReservationInclude;

export async function createReservation(customer: User, input: {
  branchId: number;
  guestName: string;
  guestPhone: string;
  partySize: number;
  requestedAt: string;
  note: string;
  tableId?: number | null;
}) {
  const branch = await prisma.branch.findFirst({ where: { id: input.branchId, isActive: true } });
  if (!branch) throw validationError({ branch_id: sk("errors.ops.branchRequired") });
  if (!input.guestName.trim()) throw validationError({ guest_name: sk("errors.ops.nameRequired") });
  if (!input.guestPhone.trim()) throw validationError({ guest_phone: sk("errors.ops.phoneRequired") });
  const when = new Date(input.requestedAt);
  if (Number.isNaN(when.getTime())) throw validationError({ requested_at: sk("errors.ops.timeRequired") });
  if (when.getTime() < Date.now()) throw validationError({ requested_at: sk("errors.ops.reservationInPast") });
  const size = Math.max(1, Math.floor(Number(input.partySize) || 1));

  // The whole check + insert runs in one transaction so two simultaneous
  // requests for the same table/time cannot both succeed.
  const reservation = await prisma.$transaction(async (tx) => {
    if (input.tableId != null) {
      const table = await tx.branchTable.findUnique({ where: { id: input.tableId } });
      if (!table || table.branchId !== branch.id) throw validationError({ table_id: sk("errors.ops.tableNotYourBranch") });
      if (!table.isActive || table.status === "out_of_service") throw validationError({ table_id: sk("errors.ops.tableUnavailable") });
      if (size > table.seats) throw validationError({ party_size: sk("errors.ops.tableCapacity", { capacity: table.seats }) });
      const from = new Date(when.getTime() - OVERLAP_WINDOW_MS);
      const to = new Date(when.getTime() + OVERLAP_WINDOW_MS);
      const clash = await tx.tableReservation.findFirst({
        where: { tableId: table.id, status: { in: BLOCKING_STATUSES }, requestedAt: { gt: from, lt: to } },
      });
      if (clash) throw validationError({ requested_at: sk("errors.ops.tableAlreadyBooked") });
      // Cross-check Ramadan reservations holding the same physical table (B7):
      // normal + Ramadan bookings must not overlap the same table/time.
      const ramReservations = await tx.ramadanReservation.findMany({
        where: { tableId: table.id, status: { in: ["pending_payment", "pending", "confirmed"] } },
        include: { slot: true },
      });
      for (const rr of ramReservations) {
        if (!rr.slot) continue;
        // Same local frame as a normal reservation's requestedAt (no trailing Z).
        const rrAt = new Date(`${rr.bookingDate.toISOString().slice(0, 10)}T${rr.slot.startTime}:00`);
        if (Math.abs(rrAt.getTime() - when.getTime()) < OVERLAP_WINDOW_MS) {
          throw validationError({ requested_at: sk("errors.ops.tableAlreadyBooked") });
        }
      }
    }
    return tx.tableReservation.create({
      data: {
        branchId: branch.id,
        customerId: customer.id,
        guestName: input.guestName.trim(),
        guestPhone: input.guestPhone.trim(),
        partySize: size,
        requestedAt: when,
        note: input.note.trim(),
        tableId: input.tableId ?? null,
      },
      include: RESERVATION_INCLUDE,
    });
  });

  if (branch.managerId) {
    await createNotification(branch.managerId, {
      type: "system",
      titleKey: "notifications.reservation.new.title",
      bodyKey: "notifications.reservation.new.body",
      params: { name: reservation.guestName, size },
      link: `/branch-manager/table-reservations/${reservation.id}`,
    });
  }
  return reservation;
}

/** Which reservations a user may see. */
export async function reservationsWhereForUser(user: User): Promise<Prisma.TableReservationWhereInput | null> {
  if (user.role === "super_admin" || user.role === "management") return {};
  if (user.role === "branch_manager") {
    const branch = await branchForManager(user.id);
    return branch ? { branchId: branch.id } : null;
  }
  if (user.role === "customer") return { customerId: user.id };
  return null;
}

async function canAccessReservation(user: User, reservation: { branchId: number; customerId: number }): Promise<boolean> {
  if (user.role === "super_admin" || user.role === "management") return true;
  if (user.role === "customer") return reservation.customerId === user.id;
  if (user.role === "branch_manager") {
    const branch = await branchForManager(user.id);
    return branch?.id === reservation.branchId;
  }
  return false;
}

const RESERVATION_STATUSES = ["pending", "accepted", "confirmed", "rejected", "cancelled", "completed", "expired"];

export async function setReservationStatus(
  reservationId: number,
  status: string,
  actor: User,
  opts: { rejectionReason?: string; tableId?: number | null } = {},
) {
  if (!RESERVATION_STATUSES.includes(status)) {
    throw validationError({ status: sk("errors.ops.statusInvalid") });
  }
  const reservation = await prisma.tableReservation.findUnique({ where: { id: reservationId } });
  if (!reservation) throw notFound();
  if (!(await canAccessReservation(actor, reservation))) throw forbidden();

  // Rejecting requires a mandatory reason (staff action).
  const reason = (opts.rejectionReason ?? "").trim();
  if (status === "rejected" && !reason) {
    throw validationError({ rejection_reason: sk("errors.ops.rejectionReasonRequired") });
  }

  const updated = await prisma.$transaction(async (tx) => {
    // Optional table (re)assignment — staff only, must belong to the branch.
    let tableId = reservation.tableId;
    if (opts.tableId !== undefined && (actor.role === "branch_manager" || actor.role === "super_admin")) {
      if (opts.tableId === null) tableId = null;
      else {
        const table = await tx.branchTable.findUnique({ where: { id: opts.tableId } });
        if (!table || table.branchId !== reservation.branchId) throw validationError({ table_id: sk("errors.ops.tableNotYourBranch") });
        if (!table.isActive || table.status === "out_of_service") throw validationError({ table_id: sk("errors.ops.tableUnavailable") });
        if (reservation.partySize > table.seats) throw validationError({ party_size: sk("errors.ops.tableCapacity", { capacity: table.seats }) });
        tableId = table.id;
      }
    }
    // Accepting re-checks the table is still free at that time (race-safe).
    if ((status === "accepted" || status === "confirmed") && tableId != null) {
      const from = new Date(reservation.requestedAt.getTime() - OVERLAP_WINDOW_MS);
      const to = new Date(reservation.requestedAt.getTime() + OVERLAP_WINDOW_MS);
      const clash = await tx.tableReservation.findFirst({
        where: { tableId, status: { in: BLOCKING_STATUSES }, requestedAt: { gt: from, lt: to }, id: { not: reservationId } },
      });
      if (clash) throw validationError({ requested_at: sk("errors.ops.tableAlreadyBooked") });
    }
    return tx.tableReservation.update({
      where: { id: reservationId },
      data: { status, tableId, rejectionReason: status === "rejected" ? reason : reservation.rejectionReason },
      include: RESERVATION_INCLUDE,
    });
  });

  await createNotification(reservation.customerId, {
    type: "system",
    titleKey: status === "rejected" ? "notifications.reservation.rejected.title" : "notifications.reservation.updated.title",
    bodyKey: status === "rejected" ? "notifications.reservation.rejected.body" : "notifications.reservation.updated.body",
    params: status === "rejected" ? { reason } : { status: `@:reservationStatus.${status}` },
    link: `/customer/reservations/${reservationId}`,
  });
  return updated;
}

/** Membership-checked message history for a reservation (for polling). */
export async function reservationMessages(user: User, reservationId: number) {
  const reservation = await prisma.tableReservation.findUnique({ where: { id: reservationId } });
  if (!reservation) throw notFound();
  if (!(await canAccessReservation(user, reservation))) throw forbidden();
  return prisma.reservationMessage.findMany({
    where: { reservationId },
    include: { sender: true },
    orderBy: { createdAt: "asc" },
  });
}

export async function addReservationMessage(reservationId: number, sender: User, body: string) {
  if (!body.trim()) throw validationError({ body: sk("errors.ops.messageRequired") });
  const reservation = await prisma.tableReservation.findUnique({ where: { id: reservationId } });
  if (!reservation) throw notFound();
  if (!(await canAccessReservation(sender, reservation))) throw forbidden();

  const msg = await prisma.reservationMessage.create({
    data: { reservationId, senderId: sender.id, body: body.trim() },
    include: { sender: true },
  });
  // Notify the other party.
  const branch = await prisma.branch.findUnique({ where: { id: reservation.branchId }, select: { managerId: true } });
  const otherId = sender.id === reservation.customerId ? branch?.managerId : reservation.customerId;
  if (otherId) {
    await notifyUsers([otherId], {
      type: "system",
      titleKey: "notifications.reservation.newMessage.title",
      body: reservation.guestName, // user-supplied guest name — kept as typed
      link: sender.id === reservation.customerId
        ? `/branch-manager/table-reservations/${reservationId}`
        : `/customer/reservations/${reservationId}`,
    });
  }
  return msg;
}

// ── Ramadan bookings ────────────────────────────────────────────────────
export async function bookRamadanTable(customer: User, input: {
  tableId: number;
  guestName: string;
  guestPhone: string;
  partySize: number;
  bookingDate: string;
}) {
  const table = await prisma.ramadanTable.findFirst({ where: { id: input.tableId, isActive: true } });
  if (!table) throw validationError({ table_id: sk("errors.ops.tableRequired") });
  if (!input.guestName.trim()) throw validationError({ guest_name: sk("errors.ops.nameRequired") });
  if (!input.guestPhone.trim()) throw validationError({ guest_phone: sk("errors.ops.phoneRequired") });
  const date = new Date(`${input.bookingDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) throw validationError({ booking_date: sk("errors.ops.dateInvalid") });
  const size = Math.max(1, Math.floor(Number(input.partySize) || 1));
  if (size > table.capacity) {
    throw validationError({ party_size: sk("errors.ops.tableCapacity", { capacity: table.capacity }) });
  }

  const existing = await prisma.ramadanBooking.findUnique({
    where: { tableId_bookingDate: { tableId: table.id, bookingDate: date } },
  });
  if (existing && existing.status === "booked") {
    throw validationError({ booking_date: sk("errors.ops.tableAlreadyBooked") });
  }

  const booking = await prisma.ramadanBooking.upsert({
    where: { tableId_bookingDate: { tableId: table.id, bookingDate: date } },
    update: {
      customerId: customer.id,
      guestName: input.guestName.trim(),
      guestPhone: input.guestPhone.trim(),
      partySize: size,
      status: "booked",
    },
    create: {
      tableId: table.id,
      branchId: table.branchId,
      customerId: customer.id,
      guestName: input.guestName.trim(),
      guestPhone: input.guestPhone.trim(),
      partySize: size,
      bookingDate: date,
    },
  });
  // Notify the branch's managers of the Ramadan iftar booking request.
  await notifyBranchManagers(table.branchId, {
    type: "ramadan",
    titleKey: "notifications.ramadan.new.title",
    bodyKey: "notifications.ramadan.new.body",
    params: { guest: input.guestName.trim(), date: input.bookingDate },
    link: "/branch-manager/dashboard",
  });
  return booking;
}
