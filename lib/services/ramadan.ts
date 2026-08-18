import "server-only";
import { Prisma } from "@prisma/client";
import type { RamadanConfig, RamadanMenu, RamadanReservation, RamadanReservationPayment, RamadanTimeSlot, User } from "@prisma/client";

import { prisma } from "@/lib/db";
import { conflict, forbidden, notFound, sk, validationError } from "@/lib/http/errors";
import { assertManagesBranch, resolveManageableBranch } from "@/lib/services/branch-ops";
import { createNotification, notifyBranchManagers } from "@/lib/services/notifications";

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
// Blocking statuses that hold a physical table for a time.
const NORMAL_BLOCKING = ["accepted", "confirmed"];
const RAMADAN_BLOCKING = ["pending_payment", "pending", "confirmed"];
const RAMADAN_STATUSES = ["pending_payment", "pending", "confirmed", "rejected", "cancelled", "completed"];

/** Parse a YYYY-MM-DD to UTC midnight (timezone-safe round-trip). */
function dateUtc(str: string): Date {
  const day = str && /^\d{4}-\d{2}-\d{2}/.test(str) ? str.slice(0, 10) : "";
  if (!day) return new Date(NaN);
  return new Date(`${day}T00:00:00.000Z`);
}
function dec(v: unknown): Prisma.Decimal {
  return v instanceof Prisma.Decimal ? v : new Prisma.Decimal(String(v ?? 0));
}
function money(v: unknown, field: string): Prisma.Decimal {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n < 0) throw validationError({ [field]: sk("errors.catalog.validPriceRequired") });
  return new Prisma.Decimal(n.toFixed(2));
}

// ── Config ────────────────────────────────────────────────────────────────
export function serializeConfig(c: RamadanConfig | null, branchId: number) {
  return {
    branch: branchId,
    is_enabled: c?.isEnabled ?? false,
    booking_start_date: c?.bookingStartDate ? c.bookingStartDate.toISOString().slice(0, 10) : null,
    booking_end_date: c?.bookingEndDate ? c.bookingEndDate.toISOString().slice(0, 10) : null,
    advance_type: c?.advanceType ?? "none",
    advance_value: (c?.advanceValue ?? new Prisma.Decimal(0)).toString(),
    advance_guest_threshold: c?.advanceGuestThreshold ?? 0,
    payment_deadline_hours: c?.paymentDeadlineHours ?? 0,
    cancellation_policy: c?.cancellationPolicy ?? "",
  };
}

export async function getConfig(branchId: number) {
  return prisma.ramadanConfig.findUnique({ where: { branchId } });
}

export async function saveConfig(user: User, input: {
  branchId?: number; isEnabled?: boolean; bookingStartDate?: string; bookingEndDate?: string;
  advanceType?: string; advanceValue?: number; advanceGuestThreshold?: number; paymentDeadlineHours?: number; cancellationPolicy?: string;
}) {
  const branch = await resolveManageableBranch(user, input.branchId);
  if (input.advanceType && !["none", "fixed", "percent", "per_guest"].includes(input.advanceType)) {
    throw validationError({ advance_type: sk("errors.ramadan.invalidAdvanceType") });
  }
  const start = input.bookingStartDate ? dateUtc(input.bookingStartDate) : null;
  const end = input.bookingEndDate ? dateUtc(input.bookingEndDate) : null;
  if (start && Number.isNaN(start.getTime())) throw validationError({ booking_start_date: sk("errors.ops.dateInvalid") });
  if (end && Number.isNaN(end.getTime())) throw validationError({ booking_end_date: sk("errors.ops.dateInvalid") });
  if (start && end && end < start) throw validationError({ booking_end_date: sk("errors.ramadan.endBeforeStart") });
  const data = {
    isEnabled: input.isEnabled ?? false,
    bookingStartDate: start,
    bookingEndDate: end,
    advanceType: input.advanceType ?? "none",
    advanceValue: money(input.advanceValue ?? 0, "advance_value"),
    advanceGuestThreshold: Math.max(0, Math.floor(Number(input.advanceGuestThreshold ?? 0))),
    paymentDeadlineHours: Math.max(0, Math.floor(Number(input.paymentDeadlineHours ?? 0))),
    cancellationPolicy: (input.cancellationPolicy ?? "").trim(),
  };
  return prisma.ramadanConfig.upsert({ where: { branchId: branch.id }, update: data, create: { branchId: branch.id, ...data } });
}

// ── Slots ─────────────────────────────────────────────────────────────────
export function serializeSlot(s: RamadanTimeSlot) {
  return { id: s.id, branch: s.branchId, label: s.label, start_time: s.startTime, end_time: s.endTime, capacity: s.capacity, is_active: s.isActive, sort_order: s.sortOrder };
}
export async function slotsForBranch(branchId: number, activeOnly = false) {
  return prisma.ramadanTimeSlot.findMany({ where: { branchId, ...(activeOnly ? { isActive: true } : {}) }, orderBy: [{ sortOrder: "asc" }, { startTime: "asc" }] });
}
export async function createSlot(user: User, input: { branchId?: number; label: string; startTime: string; endTime: string; capacity?: number; isActive?: boolean; sortOrder?: number }) {
  const branch = await resolveManageableBranch(user, input.branchId);
  if (!input.label.trim()) throw validationError({ label: sk("errors.ramadan.slotLabelRequired") });
  if (!TIME_RE.test(input.startTime) || !TIME_RE.test(input.endTime)) throw validationError({ start_time: sk("errors.ops.timeInvalid") });
  if (input.endTime <= input.startTime) throw validationError({ end_time: sk("errors.ops.endTimeAfterStart") });
  return prisma.ramadanTimeSlot.create({ data: {
    branchId: branch.id, label: input.label.trim(), startTime: input.startTime, endTime: input.endTime,
    capacity: Math.max(0, Math.floor(Number(input.capacity ?? 0))), isActive: input.isActive ?? true, sortOrder: Math.floor(Number(input.sortOrder ?? 0)),
  } });
}
export async function updateSlot(user: User, slotId: number, input: Partial<{ label: string; startTime: string; endTime: string; capacity: number; isActive: boolean; sortOrder: number }>) {
  const slot = await prisma.ramadanTimeSlot.findUnique({ where: { id: slotId } });
  if (!slot) throw notFound(sk("errors.ramadan.slotNotFound"));
  await assertManagesBranch(user, slot.branchId);
  const st = input.startTime ?? slot.startTime, et = input.endTime ?? slot.endTime;
  if (input.startTime !== undefined && !TIME_RE.test(st)) throw validationError({ start_time: sk("errors.ops.timeInvalid") });
  if (input.endTime !== undefined && !TIME_RE.test(et)) throw validationError({ end_time: sk("errors.ops.timeInvalid") });
  if (et <= st) throw validationError({ end_time: sk("errors.ops.endTimeAfterStart") });
  return prisma.ramadanTimeSlot.update({ where: { id: slotId }, data: {
    ...(input.label !== undefined ? { label: input.label.trim() } : {}),
    ...(input.startTime !== undefined ? { startTime: input.startTime } : {}),
    ...(input.endTime !== undefined ? { endTime: input.endTime } : {}),
    ...(input.capacity !== undefined ? { capacity: Math.max(0, Math.floor(Number(input.capacity))) } : {}),
    ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    ...(input.sortOrder !== undefined ? { sortOrder: Math.floor(Number(input.sortOrder)) } : {}),
  } });
}
export async function deleteSlot(user: User, slotId: number) {
  const slot = await prisma.ramadanTimeSlot.findUnique({ where: { id: slotId } });
  if (!slot) throw notFound(sk("errors.ramadan.slotNotFound"));
  await assertManagesBranch(user, slot.branchId);
  await prisma.ramadanTimeSlot.delete({ where: { id: slotId } });
}

// ── Menus (B8) ──────────────────────────────────────────────────────────────
/** Parse an `items` payload (JSON array or newline/comma list) into names. */
export function parseMenuItems(raw: string | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map(String);
  } catch {
    /* not JSON — treat as newline/comma list */
  }
  return raw.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
}

type MenuRel = RamadanMenu & { items?: { id: number; name: string; sortOrder: number }[] };
export function serializeMenu(m: MenuRel) {
  return {
    id: m.id, branch: m.branchId, name: m.name, description: m.description, image: m.image ?? null,
    price: dec(m.price).toFixed(2), compare_at_price: m.compareAtPrice != null ? dec(m.compareAtPrice).toFixed(2) : null,
    serving_capacity: m.servingCapacity, start_date: m.startDate ? m.startDate.toISOString().slice(0, 10) : null,
    end_date: m.endDate ? m.endDate.toISOString().slice(0, 10) : null, allowed_slots: m.allowedSlots,
    min_guests: m.minGuests, max_guests: m.maxGuests, is_active: m.isActive, is_archived: m.isArchived, sort_order: m.sortOrder,
    items: (m.items ?? []).slice().sort((a, b) => a.sortOrder - b.sortOrder).map((i) => i.name),
  };
}
export async function menusForBranch(branchId: number, opts: { includeArchived?: boolean } = {}) {
  return prisma.ramadanMenu.findMany({
    // PHASE L — archived platters stay retrievable for history, but are out of
    // the way of day-to-day management unless explicitly asked for.
    where: { branchId, ...(opts.includeArchived ? {} : { isArchived: false }) },
    include: { items: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}

/** PHASE L — View one platter, with the same branch guard as every mutation. */
export async function getMenuForManage(user: User, menuId: number) {
  await menuForManage(user, menuId);
  const menu = await prisma.ramadanMenu.findUnique({ where: { id: menuId }, include: { items: true } });
  if (!menu) throw notFound(sk("errors.ramadan.menuNotFound"));
  return menu;
}
export async function eligibleMenus(branchId: number, date: Date, slotId?: number | null) {
  const menus = await prisma.ramadanMenu.findMany({ where: { branchId, isActive: true, isArchived: false }, include: { items: true }, orderBy: [{ sortOrder: "asc" }] });
  return menus.filter((m) => {
    if (m.startDate && date < m.startDate) return false;
    if (m.endDate && date > m.endDate) return false;
    if (slotId && m.allowedSlots.trim()) {
      const allowed = m.allowedSlots.split(",").map((s) => Number(s.trim())).filter(Boolean);
      if (allowed.length && !allowed.includes(slotId)) return false;
    }
    return true;
  });
}
interface MenuInput {
  branchId?: number; name: string; description?: string; image?: string | null; price: number; compareAtPrice?: number | null;
  servingCapacity?: number; startDate?: string | null; endDate?: string | null; allowedSlots?: string; minGuests?: number; maxGuests?: number;
  isActive?: boolean; sortOrder?: number; items?: string[];
}
function validateMenu(input: { name: string; price: number }) {
  if (!input.name.trim()) throw validationError({ name: sk("errors.ramadan.menuNameRequired") });
  money(input.price, "price");
}
export async function createMenu(user: User, input: MenuInput) {
  const branch = await resolveManageableBranch(user, input.branchId);
  validateMenu(input);
  return prisma.ramadanMenu.create({
    data: {
      branchId: branch.id, name: input.name.trim(), description: (input.description ?? "").trim(), image: input.image ?? null,
      price: money(input.price, "price"), compareAtPrice: input.compareAtPrice != null ? money(input.compareAtPrice, "compare_at_price") : null,
      servingCapacity: Math.max(1, Math.floor(Number(input.servingCapacity ?? 4))),
      startDate: input.startDate ? dateUtc(input.startDate) : null, endDate: input.endDate ? dateUtc(input.endDate) : null,
      allowedSlots: (input.allowedSlots ?? "").trim(), minGuests: Math.max(0, Math.floor(Number(input.minGuests ?? 0))), maxGuests: Math.max(0, Math.floor(Number(input.maxGuests ?? 0))),
      isActive: input.isActive ?? true, sortOrder: Math.floor(Number(input.sortOrder ?? 0)),
      items: { create: (input.items ?? []).map((n, i) => ({ name: n.trim(), sortOrder: i })).filter((it) => it.name) },
    },
    include: { items: true },
  });
}
export async function menuForManage(user: User, menuId: number) {
  const menu = await prisma.ramadanMenu.findUnique({ where: { id: menuId } });
  if (!menu) throw notFound(sk("errors.ramadan.menuNotFound"));
  await assertManagesBranch(user, menu.branchId);
  return menu;
}
export async function updateMenu(user: User, menuId: number, input: Partial<MenuInput>) {
  const current = await menuForManage(user, menuId);
  // PHASE L — an archived platter is history; editing it would rewrite what a
  // past customer was offered.
  if (current.isArchived) throw conflict(sk("errors.ramadan.menuArchived"));
  if (input.name !== undefined && !input.name.trim()) throw validationError({ name: sk("errors.ramadan.menuNameRequired") });
  const data: Prisma.RamadanMenuUpdateInput = {};
  if (input.name !== undefined) data.name = input.name.trim();
  if (input.description !== undefined) data.description = input.description.trim();
  if (input.image) data.image = input.image;
  if (input.price !== undefined) data.price = money(input.price, "price");
  if (input.compareAtPrice !== undefined) data.compareAtPrice = input.compareAtPrice == null ? null : money(input.compareAtPrice, "compare_at_price");
  if (input.servingCapacity !== undefined) data.servingCapacity = Math.max(1, Math.floor(Number(input.servingCapacity)));
  if (input.startDate !== undefined) data.startDate = input.startDate ? dateUtc(input.startDate) : null;
  if (input.endDate !== undefined) data.endDate = input.endDate ? dateUtc(input.endDate) : null;
  if (input.allowedSlots !== undefined) data.allowedSlots = input.allowedSlots.trim();
  if (input.minGuests !== undefined) data.minGuests = Math.max(0, Math.floor(Number(input.minGuests)));
  if (input.maxGuests !== undefined) data.maxGuests = Math.max(0, Math.floor(Number(input.maxGuests)));
  if (input.isActive !== undefined) data.isActive = input.isActive;
  if (input.sortOrder !== undefined) data.sortOrder = Math.floor(Number(input.sortOrder));
  return prisma.$transaction(async (tx) => {
    if (input.items !== undefined) {
      await tx.ramadanMenuItem.deleteMany({ where: { menuId } });
      await tx.ramadanMenuItem.createMany({ data: (input.items ?? []).map((n, i) => ({ menuId, name: n.trim(), sortOrder: i })).filter((it) => it.name) });
    }
    return tx.ramadanMenu.update({ where: { id: menuId }, data, include: { items: true } });
  });
}
/**
 * PHASE L — safe delete. A platter nobody has booked is genuinely removed; one
 * with reservations is ARCHIVED and deactivated, so the reservation keeps its
 * link and its immutable snapshot. Customer-facing lists show neither.
 */
export async function deleteMenu(user: User, menuId: number) {
  const menu = await menuForManage(user, menuId);
  const reservations = await prisma.ramadanReservation.count({ where: { menuId } });
  if (reservations > 0) {
    const archived = await prisma.ramadanMenu.update({
      where: { id: menuId },
      data: { isArchived: true, isActive: false },
      include: { items: true },
    });
    return { archived: true, menu: archived, reservations };
  }
  await prisma.ramadanMenu.delete({ where: { id: menuId } });
  return { archived: false, menu, reservations: 0 };
}

// ── Advance-payment rules (B9) ──────────────────────────────────────────────
export function computeAdvance(config: RamadanConfig | null, total: Prisma.Decimal, partySize: number): Prisma.Decimal {
  if (!config || config.advanceType === "none") return new Prisma.Decimal(0);
  if (config.advanceGuestThreshold > 0 && partySize < config.advanceGuestThreshold) return new Prisma.Decimal(0);
  const val = dec(config.advanceValue);
  let advance: Prisma.Decimal;
  if (config.advanceType === "fixed") advance = val;
  else if (config.advanceType === "percent") advance = total.mul(val).div(100);
  else advance = val.mul(partySize); // per_guest
  if (advance.gt(total)) advance = total;
  return new Prisma.Decimal(advance.toFixed(2));
}

// ── Reservations (B7) ───────────────────────────────────────────────────────
type ReservationRel = RamadanReservation & {
  branch?: { name: string } | null; table?: { name: string; seats: number } | null;
  customer?: { firstName: string; lastName: string; username: string; phone: string } | null;
  payment?: RamadanReservationPayment | null; slot?: { label: string } | null;
};
export function serializeReservation(r: ReservationRel) {
  return {
    id: r.id, branch: r.branchId, branch_name: r.branch?.name ?? "",
    customer: r.customerId, customer_name: r.customer ? `${r.customer.firstName} ${r.customer.lastName}`.trim() || r.customer.username : "",
    table: r.tableId ?? null, table_name: r.table?.name ?? null, table_seats: r.table?.seats ?? null,
    slot: r.slotId ?? null, slot_label: r.slotLabel,
    booking_date: r.bookingDate.toISOString().slice(0, 10),
    guest_name: r.guestName, guest_phone: r.guestPhone, party_size: r.partySize, special_request: r.specialRequest,
    status: r.status, rejection_reason: r.rejectionReason,
    menu: r.menuId ?? null, menu_name: r.menuName, menu_description: r.menuDescription,
    menu_items: r.menuItemsSnapshot ? r.menuItemsSnapshot.split("\n").filter(Boolean) : [],
    menu_unit_price: dec(r.menuUnitPrice).toFixed(2), menu_serving_capacity: r.menuServingCapacity, menu_quantity: r.menuQuantity,
    total_amount: dec(r.totalAmount).toFixed(2), advance_required: dec(r.advanceRequired).toFixed(2),
    payment: r.payment ? serializePayment(r.payment) : null,
    created_at: r.createdAt.toISOString(),
  };
}

export const RES_INCLUDE = { branch: true, customer: true, table: true, slot: true, payment: true } satisfies Prisma.RamadanReservationInclude;

export async function reservationScope(user: User): Promise<Prisma.RamadanReservationWhereInput | null> {
  if (user.role === "super_admin" || user.role === "management" || user.role === "accounts") return {};
  if (user.role === "branch_manager") {
    const b = await prisma.branch.findFirst({ where: { managerId: user.id } });
    return b ? { branchId: b.id } : null;
  }
  if (user.role === "customer") return { customerId: user.id };
  return null;
}
async function canAccessReservation(user: User, r: { branchId: number; customerId: number }): Promise<boolean> {
  if (user.role === "super_admin" || user.role === "management" || user.role === "accounts") return true;
  if (user.role === "customer") return r.customerId === user.id;
  if (user.role === "branch_manager") {
    const b = await prisma.branch.findFirst({ where: { id: r.branchId, managerId: user.id } });
    return b != null;
  }
  return false;
}

export async function createRamadanReservation(customer: User, input: {
  branchId: number; bookingDate: string; slotId: number; tableId: number; menuId: number; quantity?: number;
  guestName: string; guestPhone: string; partySize: number; specialRequest?: string;
}) {
  const branch = await prisma.branch.findFirst({ where: { id: input.branchId, isActive: true } });
  if (!branch) throw validationError({ branch_id: sk("errors.ops.branchRequired") });
  const config = await getConfig(branch.id);
  if (!config || !config.isEnabled) throw validationError({ branch_id: sk("errors.ramadan.notEnabled") });
  if (!input.guestName.trim()) throw validationError({ guest_name: sk("errors.ops.nameRequired") });
  if (!input.guestPhone.trim()) throw validationError({ guest_phone: sk("errors.ops.phoneRequired") });

  const date = dateUtc(input.bookingDate);
  if (Number.isNaN(date.getTime())) throw validationError({ booking_date: sk("errors.ops.dateInvalid") });
  const todayUtc = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);
  if (date < todayUtc) throw validationError({ booking_date: sk("errors.ramadan.pastBooking") });
  if (config.bookingStartDate && date < config.bookingStartDate) throw validationError({ booking_date: sk("errors.ramadan.outsideRange") });
  if (config.bookingEndDate && date > config.bookingEndDate) throw validationError({ booking_date: sk("errors.ramadan.outsideRange") });

  const size = Math.max(1, Math.floor(Number(input.partySize) || 1));

  // A missing or non-numeric id must be a FIELD ERROR, not a 500: without this
  // `Number(undefined)` reaches Prisma as NaN and the request dies with a
  // server error that tells the customer nothing.
  const requireId = (value: number, field: string) => {
    if (!Number.isInteger(value) || value <= 0) throw validationError({ [field]: sk("errors.ops.idRequired") });
    return value;
  };
  requireId(input.slotId, "slot_id");
  requireId(input.tableId, "table_id");
  requireId(input.menuId, "menu_id");

  const slot = await prisma.ramadanTimeSlot.findUnique({ where: { id: input.slotId } });
  if (!slot || slot.branchId !== branch.id) throw validationError({ slot_id: sk("errors.ramadan.slotNotYourBranch") });
  if (!slot.isActive) throw validationError({ slot_id: sk("errors.ramadan.slotInactive") });

  const table = await prisma.branchTable.findUnique({ where: { id: input.tableId } });
  if (!table || table.branchId !== branch.id) throw validationError({ table_id: sk("errors.ops.tableNotYourBranch") });
  if (!table.isActive || table.status === "out_of_service") throw validationError({ table_id: sk("errors.ops.tableUnavailable") });
  if (size > table.seats) throw validationError({ party_size: sk("errors.ops.tableCapacity", { capacity: table.seats }) });

  const menu = await prisma.ramadanMenu.findUnique({ where: { id: input.menuId }, include: { items: true } });
  if (!menu || menu.branchId !== branch.id || !menu.isActive) throw validationError({ menu_id: sk("errors.ramadan.menuNotEligible") });
  if (menu.startDate && date < menu.startDate) throw validationError({ menu_id: sk("errors.ramadan.menuNotEligible") });
  if (menu.endDate && date > menu.endDate) throw validationError({ menu_id: sk("errors.ramadan.menuNotEligible") });
  if (menu.allowedSlots.trim()) {
    const allowed = menu.allowedSlots.split(",").map((s) => Number(s.trim())).filter(Boolean);
    if (allowed.length && !allowed.includes(slot.id)) throw validationError({ menu_id: sk("errors.ramadan.menuNotForSlot") });
  }
  if (menu.minGuests > 0 && size < menu.minGuests) throw validationError({ party_size: sk("errors.ramadan.belowMinGuests", { min: menu.minGuests }) });
  if (menu.maxGuests > 0 && size > menu.maxGuests) throw validationError({ party_size: sk("errors.ramadan.aboveMaxGuests", { max: menu.maxGuests }) });

  // Quantity: enough servings to cover the party.
  const quantity = input.quantity && input.quantity > 0 ? Math.floor(input.quantity) : Math.ceil(size / menu.servingCapacity);
  if (menu.servingCapacity * quantity < size) throw validationError({ menu_quantity: sk("errors.ramadan.servingsInsufficient") });

  // Server-side money (Decimal-safe): total + advance.
  const total = dec(menu.price).mul(quantity);
  const advance = computeAdvance(config, total, size);
  const status = advance.gt(0) ? "pending_payment" : "pending";

  const reservation = await prisma.$transaction(async (tx) => {
    // Ramadan-vs-Ramadan: one physical table per slot per date.
    const ramClash = await tx.ramadanReservation.findFirst({
      where: { tableId: table.id, bookingDate: date, slotId: slot.id, status: { in: RAMADAN_BLOCKING } },
    });
    if (ramClash) throw conflict(sk("errors.ramadan.tableTaken"));
    // Ramadan-vs-Normal: same physical table within ±2h of the slot start on that
    // date. Parsed in the local frame to match a normal reservation's requestedAt.
    const slotAt = new Date(`${input.bookingDate.slice(0, 10)}T${slot.startTime}:00`);
    const from = new Date(slotAt.getTime() - 2 * 3600000), to = new Date(slotAt.getTime() + 2 * 3600000);
    const normalClash = await tx.tableReservation.findFirst({
      where: { tableId: table.id, status: { in: NORMAL_BLOCKING }, requestedAt: { gt: from, lt: to } },
    });
    if (normalClash) throw conflict(sk("errors.ramadan.tableTaken"));

    const res = await tx.ramadanReservation.create({
      data: {
        branchId: branch.id, customerId: customer.id, tableId: table.id, slotId: slot.id, bookingDate: date,
        guestName: input.guestName.trim(), guestPhone: input.guestPhone.trim(), partySize: size,
        specialRequest: (input.specialRequest ?? "").trim(), status, slotLabel: slot.label,
        // Immutable menu snapshot.
        menuId: menu.id, menuName: menu.name, menuDescription: menu.description,
        menuItemsSnapshot: menu.items.slice().sort((a, b) => a.sortOrder - b.sortOrder).map((i) => i.name).join("\n"),
        menuImage: menu.image, menuUnitPrice: dec(menu.price), menuServingCapacity: menu.servingCapacity, menuQuantity: quantity,
        totalAmount: new Prisma.Decimal(total.toFixed(2)), advanceRequired: advance,
      },
      include: RES_INCLUDE,
    });
    if (advance.gt(0)) {
      await tx.ramadanReservationPayment.create({
        data: { reservationId: res.id, branchId: branch.id, amount: advance, status: "unpaid", method: "demo" },
      });
    }
    return res;
  });

  await notifyBranchManagers(branch.id, {
    type: "ramadan", titleKey: "notifications.ramadan.new.title", bodyKey: "notifications.ramadan.new.body",
    params: { guest: reservation.guestName, date: input.bookingDate }, link: "/branch-manager/ramadan-bookings",
  });
  if (advance.gt(0)) {
    await createNotification(customer.id, {
      type: "payment", titleKey: "notifications.ramadan.advanceRequired.title", bodyKey: "notifications.ramadan.advanceRequired.body",
      params: { amount: advance.toFixed(2), id: reservation.id }, link: `/customer/ramadan-bookings/${reservation.id}`,
    });
  }
  return prisma.ramadanReservation.findUniqueOrThrow({ where: { id: reservation.id }, include: RES_INCLUDE });
}

export async function setRamadanStatus(reservationId: number, status: string, actor: User, opts: { reason?: string } = {}) {
  if (!RAMADAN_STATUSES.includes(status)) throw validationError({ status: sk("errors.ops.statusInvalid") });
  const reservation = await prisma.ramadanReservation.findUnique({ where: { id: reservationId }, include: { payment: true } });
  if (!reservation) throw notFound();
  if (!(await canAccessReservation(actor, reservation))) throw forbidden();

  const isStaff = actor.role === "branch_manager" || actor.role === "super_admin";
  // Customers may only cancel their own booking.
  if (!isStaff && !(actor.role === "customer" && status === "cancelled")) throw forbidden();

  const reason = (opts.reason ?? "").trim();
  if (status === "rejected" && !reason) throw validationError({ rejection_reason: sk("errors.ops.rejectionReasonRequired") });
  // A booking needing advance cannot be confirmed until the advance is paid.
  if (status === "confirmed" && dec(reservation.advanceRequired).gt(0) && reservation.payment?.status !== "paid") {
    throw conflict(sk("errors.ramadan.advanceNotPaid"));
  }

  const updated = await prisma.ramadanReservation.update({
    where: { id: reservationId },
    data: { status, rejectionReason: status === "rejected" ? reason : reservation.rejectionReason },
    include: RES_INCLUDE,
  });
  await createNotification(reservation.customerId, {
    type: "ramadan",
    titleKey: status === "rejected" ? "notifications.ramadan.rejected.title" : "notifications.ramadan.updated.title",
    bodyKey: status === "rejected" ? "notifications.ramadan.rejected.body" : "notifications.ramadan.updated.body",
    params: status === "rejected" ? { reason } : { status: `@:ramadanStatus.${status}` },
    link: `/customer/ramadan-bookings/${reservationId}`,
  });
  return updated;
}

// ── Payments + refunds (B9) ─────────────────────────────────────────────────
export function serializePayment(p: RamadanReservationPayment) {
  return {
    id: p.id, reservation: p.reservationId, branch: p.branchId,
    amount: dec(p.amount).toFixed(2), paid_amount: dec(p.paidAmount).toFixed(2), refunded_amount: dec(p.refundedAmount).toFixed(2),
    status: p.status, method: p.method, gateway_ref: p.gatewayRef, created_at: p.createdAt.toISOString(),
  };
}

async function auditFinancial(actorId: number | null, action: string, entityId: string, detail: string) {
  await prisma.financialAuditLog.create({ data: { actorId, action, entity: "RamadanReservationPayment", entityId, detail } });
}

/**
 * Demo advance payment (B9). Idempotent via idempotencyKey — a repeated
 * callback with the same key never double-charges. `outcome:"fail"` records a
 * failed attempt without marking paid.
 */
export async function payRamadanAdvance(user: User, reservationId: number, opts: { idempotencyKey: string; outcome?: string; gatewayRef?: string }) {
  const reservation = await prisma.ramadanReservation.findUnique({ where: { id: reservationId }, include: { payment: true } });
  if (!reservation) throw notFound();
  // Only the booking's customer (or SA) may pay.
  if (user.role !== "super_admin" && reservation.customerId !== user.id) throw forbidden();
  if (!reservation.payment) throw validationError({ detail: sk("errors.ramadan.noAdvanceRequired") });
  if (!opts.idempotencyKey?.trim()) throw validationError({ idempotency_key: sk("errors.ramadan.idempotencyRequired") });

  return prisma.$transaction(async (tx) => {
    const payment = await tx.ramadanReservationPayment.findUnique({ where: { reservationId } });
    if (!payment) throw notFound();
    // Idempotent: same key already applied → return current state (no double charge).
    if (payment.idempotencyKey && payment.idempotencyKey === opts.idempotencyKey.trim()) {
      return { payment, reservation: await tx.ramadanReservation.findUniqueOrThrow({ where: { id: reservationId }, include: RES_INCLUDE }) };
    }
    if (payment.status === "paid") throw conflict(sk("errors.ramadan.alreadyPaid"));

    if (opts.outcome === "fail") {
      const failed = await tx.ramadanReservationPayment.update({ where: { reservationId }, data: { status: "failed", idempotencyKey: opts.idempotencyKey.trim() } });
      return { payment: failed, reservation: await tx.ramadanReservation.findUniqueOrThrow({ where: { id: reservationId }, include: RES_INCLUDE }) };
    }
    const paid = await tx.ramadanReservationPayment.update({
      where: { reservationId },
      data: { status: "paid", paidAmount: payment.amount, idempotencyKey: opts.idempotencyKey.trim(), gatewayRef: opts.gatewayRef ?? `demo-${reservationId}` },
    });
    // Advance satisfied → booking moves to pending (awaiting BM acceptance).
    const res = await tx.ramadanReservation.update({ where: { id: reservationId }, data: { status: reservation.status === "pending_payment" ? "pending" : reservation.status }, include: RES_INCLUDE });
    return { payment: paid, reservation: res };
  }).then(async ({ payment, reservation: res }) => {
    if (payment.status === "paid") {
      await auditFinancial(user.id, "ramadan_advance_paid", String(payment.id), `Advance ${dec(payment.amount).toFixed(2)} for reservation ${reservationId}`);
      await notifyBranchManagers(reservation.branchId, {
        type: "ramadan", titleKey: "notifications.ramadan.paid.title", bodyKey: "notifications.ramadan.paid.body",
        params: { id: reservationId }, link: "/branch-manager/ramadan-bookings",
      });
      await createNotification(reservation.customerId, {
        type: "payment", titleKey: "notifications.ramadan.paymentSucceeded.title", bodyKey: "notifications.ramadan.paymentSucceeded.body",
        params: { id: reservationId }, link: `/customer/ramadan-bookings/${reservationId}`,
      });
    } else if (payment.status === "failed") {
      await auditFinancial(user.id, "ramadan_advance_failed", String(payment.id), `Failed advance for reservation ${reservationId}`);
      await createNotification(reservation.customerId, {
        type: "payment", titleKey: "notifications.ramadan.paymentFailed.title", bodyKey: "notifications.ramadan.paymentFailed.body",
        params: { id: reservationId }, link: `/customer/ramadan-bookings/${reservationId}`,
      });
    }
    return { payment, reservation: res };
  });
}

/** Accounts/SA refund (B9). Cannot exceed refundable paid amount; idempotent-safe. */
export async function refundRamadan(actor: User, reservationId: number, amount: number) {
  if (actor.role !== "accounts" && actor.role !== "super_admin") throw forbidden();
  const payment = await prisma.ramadanReservationPayment.findUnique({ where: { reservationId } });
  if (!payment) throw notFound();
  const refundable = dec(payment.paidAmount).minus(dec(payment.refundedAmount));
  const amt = money(amount, "amount");
  if (amt.lte(0) || amt.gt(refundable)) throw validationError({ amount: sk("errors.ramadan.refundExceeds") });

  const updated = await prisma.$transaction(async (tx) => {
    const p = await tx.ramadanReservationPayment.findUniqueOrThrow({ where: { reservationId } });
    const newRefunded = dec(p.refundedAmount).plus(amt);
    if (newRefunded.gt(dec(p.paidAmount))) throw validationError({ amount: sk("errors.ramadan.refundExceeds") });
    return tx.ramadanReservationPayment.update({
      where: { reservationId },
      data: { refundedAmount: newRefunded, status: newRefunded.gte(dec(p.paidAmount)) ? "refunded" : p.status },
    });
  });
  await auditFinancial(actor.id, "ramadan_refund", String(updated.id), `Refund ${amt.toFixed(2)} for reservation ${reservationId}`);
  const res = await prisma.ramadanReservation.findUnique({ where: { id: reservationId } });
  if (res) {
    await createNotification(res.customerId, {
      type: "payment", titleKey: "notifications.ramadan.refunded.title", bodyKey: "notifications.ramadan.refunded.body",
      params: { amount: amt.toFixed(2), id: reservationId }, link: `/customer/ramadan-bookings/${reservationId}`,
    });
  }
  return updated;
}

// ── Accounts / Management reads ──────────────────────────────────────────────
export async function ramadanTransactions(user: User, filters: { branchId?: number; status?: string; from?: string; to?: string; customerId?: number; reservationId?: number }) {
  if (!["accounts", "super_admin", "management"].includes(user.role)) throw forbidden();
  const where: Prisma.RamadanReservationPaymentWhereInput = {};
  if (filters.branchId) where.branchId = filters.branchId;
  if (filters.status) where.status = filters.status;
  if (filters.reservationId) where.reservationId = filters.reservationId;
  if (filters.from || filters.to) {
    where.createdAt = {};
    if (filters.from) where.createdAt.gte = new Date(`${filters.from}T00:00:00.000Z`);
    if (filters.to) where.createdAt.lte = new Date(`${filters.to}T23:59:59.999Z`);
  }
  const rows = await prisma.ramadanReservationPayment.findMany({
    where, include: { reservation: { include: { branch: true, customer: true } } }, orderBy: { createdAt: "desc" }, take: 300,
  });
  const filtered = filters.customerId ? rows.filter((r) => r.reservation.customerId === filters.customerId) : rows;
  return filtered.map((p) => ({
    ...serializePayment(p),
    reservation_id: p.reservationId, branch_name: p.reservation.branch.name,
    customer_name: `${p.reservation.customer.firstName} ${p.reservation.customer.lastName}`.trim() || p.reservation.customer.username,
    booking_date: p.reservation.bookingDate.toISOString().slice(0, 10),
  }));
}

export async function ramadanSummary(user: User, branchId?: number) {
  if (!["management", "super_admin", "accounts"].includes(user.role)) throw forbidden();
  const resWhere: Prisma.RamadanReservationWhereInput = branchId ? { branchId } : {};
  const [byStatus, guests, payByStatus, refundAgg] = await Promise.all([
    prisma.ramadanReservation.groupBy({ by: ["status"], where: resWhere, _count: { status: true } }),
    prisma.ramadanReservation.aggregate({ where: resWhere, _sum: { partySize: true } }),
    prisma.ramadanReservationPayment.groupBy({ by: ["status"], where: branchId ? { branchId } : {}, _count: { status: true }, _sum: { paidAmount: true } }),
    prisma.ramadanReservationPayment.aggregate({ where: branchId ? { branchId } : {}, _sum: { refundedAmount: true, paidAmount: true } }),
  ]);
  const reservations: Record<string, number> = { pending_payment: 0, pending: 0, confirmed: 0, rejected: 0, cancelled: 0, completed: 0 };
  for (const g of byStatus) reservations[g.status] = g._count.status;
  const payments: Record<string, number> = { unpaid: 0, pending: 0, paid: 0, failed: 0, refunded: 0 };
  for (const g of payByStatus) payments[g.status] = g._count.status;
  return {
    reservations, total_reservations: byStatus.reduce((n, g) => n + g._count.status, 0),
    total_guests: guests._sum.partySize ?? 0, payments,
    total_paid: dec(refundAgg._sum.paidAmount ?? 0).toFixed(2), total_refunded: dec(refundAgg._sum.refundedAmount ?? 0).toFixed(2),
  };
}
