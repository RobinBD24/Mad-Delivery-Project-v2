// Serializers — turn Prisma records into the exact JSON shapes the frontend
// expects (snake_case fields, ISO dates, fixed-precision decimals).
import type {
  Branch,
  BranchManagerAssignment,
  Category,
  Complaint,
  ComplaintMessage,
  ManagerActivityLog,
  Notice,
  Notification,
  Order,
  OrderItem,
  Product,
  ProductVariation,
  RewardEarningRule,
  RiderCommission,
  RiderDutyLog,
  RiderProfile,
  RiderWithdrawal,
  User,
} from "@prisma/client";
import { Prisma } from "@prisma/client";

import {
  ACTIVITY_DISPLAY,
  complaintCategoryDisplay,
  complaintStatusDisplay,
  NOTICE_AUDIENCE_DISPLAY,
  orderStatusDisplay,
  paymentDisplay,
  roleDisplay,
  statusDisplay,
  withdrawalStatusDisplay,
} from "@/lib/constants/enums";
import type { ActivityType } from "@/lib/constants/enums";

type Dec = Prisma.Decimal | number | string | null | undefined;

/** Decimal → fixed-places string (fixed-precision), or null. */
function dec(value: Dec, places = 2): string | null {
  if (value === null || value === undefined) return null;
  const n =
    value instanceof Prisma.Decimal ? value.toNumber() : typeof value === "string" ? Number(value) : value;
  if (Number.isNaN(n)) return null;
  return n.toFixed(places);
}

/** Non-nullable decimal string (defaults to "0.00"). */
function decOr0(value: Dec, places = 2): string {
  return dec(value, places) ?? (0).toFixed(places);
}

function iso(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null;
}
function dateOnly(d: Date | null | undefined): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}
function fullName(u: { firstName: string; lastName: string }): string {
  return `${u.firstName} ${u.lastName}`.trim();
}

// ── User ──────────────────────────────────────────────────────────────
type UserWithApprover = User & { approvedBy?: Pick<User, "firstName" | "lastName"> | null };

export function serializeUser(u: UserWithApprover) {
  return {
    id: u.id,
    username: u.username,
    email: u.email,
    first_name: u.firstName,
    last_name: u.lastName,
    full_name: fullName(u),
    role: u.role,
    role_display: roleDisplay(u.role),
    status: u.status,
    status_display: statusDisplay(u.status),
    is_active: u.isActive,
    is_blocked: u.isBlocked,
    blocked_reason: u.blockedReason,
    phone: u.phone,
    address: u.address,
    date_of_birth: dateOnly(u.dateOfBirth),
    gender: u.gender,
    profile_photo: u.profilePhoto ?? null,
    approved_by: u.approvedById ?? null,
    approved_by_name: u.approvedBy ? fullName(u.approvedBy) || null : null,
    approved_at: iso(u.approvedAt),
    rejection_reason: u.rejectionReason,
    date_joined: iso(u.dateJoined),
    created_at: iso(u.createdAt),
    updated_at: iso(u.updatedAt),
  };
}

// ── Branch ────────────────────────────────────────────────────────────
type BranchWithManager = Branch & { manager?: Pick<User, "firstName" | "lastName" | "username"> | null };

export function serializeBranch(b: BranchWithManager) {
  const managerName = b.manager ? fullName(b.manager) || b.manager.username : null;
  return {
    id: b.id,
    name: b.name,
    address: b.address,
    phone: b.phone,
    email: b.email,
    latitude: dec(b.latitude, 7),
    longitude: dec(b.longitude, 7),
    delivery_radius_km: decOr0(b.deliveryRadiusKm, 1),
    brand_type: b.brandType,
    prep_time_minutes: b.prepTimeMinutes,
    pickup_enabled: b.pickupEnabled,
    pickup_address: b.pickupAddress,
    pickup_phone: b.pickupPhone,
    bkash_number: b.bkashNumber,
    // PHASE S — manual bKash acceptance settings for this branch.
    bkash_enabled: b.bkashEnabled,
    bkash_instructions: b.bkashInstructions,
    manager: b.managerId ?? null,
    manager_name: managerName,
    is_active: b.isActive,
    // PHASE 11 — branch-level delivery fee (radius fee fallback).
    delivery_fee: decOr0(b.deliveryFee, 2),
    // req #1 — archive state is part of the branch's public shape so the UI and
    // reporting can tell "archived" apart from merely "inactive".
    is_archived: b.isArchived,
    archived_at: b.archivedAt ? iso(b.archivedAt) : null,
    hold_reason: b.holdReason,
    opening_time: b.openingTime ?? null,
    closing_time: b.closingTime ?? null,
    logo: b.logo ?? null,
    created_at: iso(b.createdAt),
    updated_at: iso(b.updatedAt),
  };
}

/** Customer-facing branch (no internal fields). */
export function serializePublicBranch(b: Branch) {
  return {
    id: b.id,
    name: b.name,
    address: b.address,
    phone: b.phone,
    brand_type: b.brandType,
    delivery_radius_km: decOr0(b.deliveryRadiusKm, 1),
    opening_time: b.openingTime ?? null,
    closing_time: b.closingTime ?? null,
    logo: b.logo ?? null,
  };
}

// ── Catalog ───────────────────────────────────────────────────────────
export function serializeCategory(
  c: Category & { _count?: { products: number }; product_count?: number; branch?: { name: string } | null },
) {
  return {
    id: c.id,
    branch: c.branchId, // null = global ("Main Branch")
    branch_name: c.branch?.name ?? null,
    is_global: c.branchId === null,
    name: c.name,
    description: c.description,
    is_active: c.isActive,
    product_count: c._count?.products ?? c.product_count ?? 0,
    created_at: iso(c.createdAt),
    updated_at: iso(c.updatedAt),
  };
}

function discountedPrice(price: Prisma.Decimal, discount: Prisma.Decimal): number {
  const p = price.toNumber();
  const d = discount.toNumber();
  return d > 0 ? p - (p * d) / 100 : p;
}

export function serializeVariation(v: ProductVariation) {
  const price = v.price instanceof Prisma.Decimal ? v.price : new Prisma.Decimal(v.price);
  return {
    id: v.id,
    product: v.productId,
    name: v.name,
    size_label: v.sizeLabel,
    price: decOr0(price, 2),
    compare_at_price: v.compareAtPrice != null ? dec(v.compareAtPrice, 2) : null,
    serving_info: v.servingInfo,
    variant_type: v.variantType,
    sort_order: v.sortOrder,
    is_default: v.isDefault,
    is_enabled: v.isEnabled,
  };
}

type ProductRel = Product & {
  category?: Pick<Category, "name"> | null;
  branch?: Pick<Branch, "name" | "brandType"> | null;
  variations?: ProductVariation[];
};

export function serializeProduct(p: ProductRel) {
  const variations = (p.variations ?? []).slice().sort((a, b) => a.sortOrder - b.sortOrder);
  const enabled = variations.filter((v) => v.isEnabled);
  const active = enabled.find((v) => v.isDefault) ?? enabled[0] ?? variations[0];
  // Effective base price = default variation price when present, else legacy price.
  const basePrice = active ? (active.price instanceof Prisma.Decimal ? active.price : new Prisma.Decimal(active.price)) : p.price;
  return {
    id: p.id,
    branch: p.branchId,
    branch_name: p.branch?.name ?? "",
    brand: p.brand ?? null,
    category: p.categoryId ?? null,
    category_name: p.category?.name ?? null,
    name: p.name,
    description: p.description,
    price: decOr0(basePrice, 2),
    discount: decOr0(p.discount, 2),
    discounted_price: discountedPrice(basePrice, p.discount).toFixed(2),
    image: p.image ?? null,
    is_available: p.isAvailable,
    deactivation_reason: p.deactivationReason,
    held_by_admin: p.heldByAdmin,
    preparation_time: p.preparationTime,
    is_popular: p.isPopular,
    is_recommended: p.isRecommended,
    // req #4 — product crust policy (THICK | THIN | BOTH).
    variation_type: p.variationType,
    default_variation_id: active?.id ?? null,
    has_variations: enabled.length > 0,
    variations: variations.map(serializeVariation),
    created_at: iso(p.createdAt),
    updated_at: iso(p.updatedAt),
  };
}

// ── Orders ────────────────────────────────────────────────────────────
type OrderItemRel = OrderItem & { product?: (Pick<Product, "name" | "image">) | null };

/**
 * The order line's own IMMUTABLE snapshot, falling back to the live product only
 * for rows written before the snapshot columns existed (the migration backfilled
 * those, so the fallback should never fire — it exists so a legacy row can never
 * render blank).
 */
function itemProductName(i: OrderItemRel): string {
  return i.productName || i.product?.name || "";
}
function itemProductImage(i: OrderItemRel): string | null {
  return i.productImage ?? i.product?.image ?? null;
}

function serializeOrderItem(i: OrderItemRel) {
  const unit = i.unitPrice instanceof Prisma.Decimal ? i.unitPrice.toNumber() : Number(i.unitPrice);
  return {
    id: i.id,
    product: i.productId,
    product_name: itemProductName(i),
    product_image: itemProductImage(i),
    variation: i.variationId ?? null,
    variation_name: i.variationName,
    // req #4 — immutable crust snapshot for this order line.
    variation_type: i.variationType,
    quantity: i.quantity,
    unit_price: unit.toFixed(2),
    food_note: i.foodNote,
    subtotal: (unit * i.quantity).toFixed(2),
  };
}

type OrderAssignmentRel = {
  id: number;
  status: string;
  distanceKm: unknown;
  rejectionReason: string;
  respondedAt: Date | null;
  rider?: Pick<User, "firstName" | "lastName" | "phone" | "username"> | null;
};

type OrderRel = Order & {
  items?: OrderItemRel[];
  customer?: Pick<User, "firstName" | "lastName" | "phone"> | null;
  branch?: Pick<Branch, "name"> | null;
  rider?: Pick<User, "firstName" | "lastName" | "phone"> | null;
  assignments?: OrderAssignmentRel[];
};

export function serializeOrder(o: OrderRel) {
  return {
    id: o.id,
    // #15 — customer-facing unique number (ORD-YYYYMMDD-000001); falls back to
    // "#<id>" only for any legacy row without one (never after the backfill).
    order_number: o.orderNumber ?? null,
    customer: o.customerId,
    customer_name: o.customer ? fullName(o.customer) : "",
    customer_phone: o.customer?.phone ?? "",
    branch: o.branchId,
    branch_name: o.branch?.name ?? "",
    rider: o.riderId ?? null,
    rider_name: o.rider ? fullName(o.rider) : null,
    rider_phone: o.rider?.phone ?? null,
    status: o.status,
    status_display: orderStatusDisplay(o.status),
    payment_method: o.paymentMethod,
    payment_method_display: paymentDisplay(o.paymentMethod),
    // PHASE S — payment lifecycle + manual bKash audit (destination number is a
    // snapshot of what the customer was told to pay).
    // PHASE J — append-only transition audit (present when included).
    status_events: (o as unknown as { statusEvents?: { id: number; fromStatus: string; toStatus: string; actorId: number | null; reason: string; createdAt: Date }[] })
      .statusEvents?.map((e) => ({
        id: e.id,
        from_status: e.fromStatus,
        to_status: e.toStatus,
        actor: e.actorId ?? null,
        reason: e.reason,
        created_at: iso(e.createdAt),
      })) ?? [],
    payment_status: o.paymentStatus,
    bkash_transaction_id: o.bkashTransactionId,
    bkash_payer_phone: o.bkashPayerPhone,
    bkash_destination_number: o.bkashDestinationNumber,
    payment_submitted_at: iso(o.paymentSubmittedAt),
    payment_verified_by: o.paymentVerifiedById ?? null,
    payment_verified_at: iso(o.paymentVerifiedAt),
    payment_rejection_reason: o.paymentRejectionReason,
    total_amount: decOr0(o.totalAmount, 2),
    food_notes: o.foodNotes,
    delivery_address: o.deliveryAddress,
    fulfillment_type: o.fulfillmentType,
    prep_time_snapshot: o.prepTimeSnapshot ?? null,
    // #1/#13 — immutable delivery snapshots.
    delivery_area: o.deliveryAreaId ?? null,
    delivery_area_name: o.deliveryAreaName ?? "",
    delivery_charge: decOr0(o.deliveryCharge, 2),
    delivery_estimate_minutes: o.deliveryEstimateMinutes ?? null,
    // PHASE 11 — immutable snapshots of the radius rule that authorised delivery.
    delivery_distance_km: o.deliveryDistanceKm != null ? Number(o.deliveryDistanceKm) : null,
    delivery_radius_km_snapshot: o.deliveryRadiusKmSnapshot != null ? Number(o.deliveryRadiusKmSnapshot) : null,
    // #7/#14 — acceptance details from the DB (never inferred from UI state).
    assignment: o.assignments && o.assignments[0]
      ? {
          status: o.assignments[0].status,
          distance_km: o.assignments[0].distanceKm != null ? Number(o.assignments[0].distanceKm) : null,
          rejection_reason: o.assignments[0].rejectionReason,
          responded_at: o.assignments[0].respondedAt ? o.assignments[0].respondedAt.toISOString() : null,
          rider_name: o.assignments[0].rider
            ? fullName(o.assignments[0].rider) || o.assignments[0].rider.username
            : null,
          rider_phone: o.assignments[0].rider?.phone ?? null,
        }
      : null,
    items: (o.items ?? []).map(serializeOrderItem),
    created_at: iso(o.createdAt),
    updated_at: iso(o.updatedAt),
  };
}

// ── Riders ────────────────────────────────────────────────────────────
type RiderProfileRel = RiderProfile & {
  user?: Pick<User, "firstName" | "lastName" | "username" | "phone"> | null;
  assignedBranch?: Pick<Branch, "name"> | null;
};

export function serializeRiderProfile(p: RiderProfileRel) {
  return {
    id: p.id,
    user: p.userId,
    rider_name: p.user ? fullName(p.user) : "",
    rider_username: p.user?.username ?? "",
    rider_phone: p.user?.phone ?? "",
    assigned_branch: p.assignedBranchId ?? null,
    assigned_branch_name: p.assignedBranch?.name ?? null,
    blood_group: p.bloodGroup,
    education: p.education,
    present_address: p.presentAddress,
    permanent_address: p.permanentAddress,
    nid_number: p.nidNumber,
    driving_license_number: p.drivingLicenseNumber,
    bike_registration_number: p.bikeRegistrationNumber,
    vehicle_type: p.vehicleType,
    emergency_contact_name: p.emergencyContactName,
    emergency_contact_phone: p.emergencyContactPhone,
    nid_front_image: p.nidFrontImage ?? null,
    nid_back_image: p.nidBackImage ?? null,
    license_image: p.licenseImage ?? null,
    created_at: iso(p.createdAt),
    updated_at: iso(p.updatedAt),
  };
}

type DutyLogRel = RiderDutyLog & {
  branch?: Pick<Branch, "name"> | null;
  rider?: Pick<User, "firstName" | "lastName"> | null;
};

function dutyDurationMinutes(log: RiderDutyLog): number | null {
  if (!log.clockOut) return null;
  return Math.floor((log.clockOut.getTime() - log.clockIn.getTime()) / 60000);
}

export function serializeDutyLog(log: DutyLogRel) {
  const minutes = dutyDurationMinutes(log);
  const durationStr =
    minutes === null ? "ডিউটিতে আছেন" : `${Math.floor(minutes / 60)}ঘ ${minutes % 60}মি`;
  return {
    id: log.id,
    rider: log.riderId,
    rider_name: log.rider ? fullName(log.rider) : "",
    branch: log.branchId,
    branch_name: log.branch?.name ?? "",
    date: dateOnly(log.date),
    clock_in: iso(log.clockIn),
    clock_out: iso(log.clockOut),
    is_on_duty: log.clockOut === null,
    duration_minutes: minutes,
    duration_str: durationStr,
  };
}

// ── Branch manager assignment / activity log ──────────────────────────
type AssignmentRel = BranchManagerAssignment & {
  manager?: Pick<User, "firstName" | "lastName" | "username"> | null;
  branch?: Pick<Branch, "name"> | null;
  assignedBy?: Pick<User, "firstName" | "lastName"> | null;
};

export function serializeAssignment(a: AssignmentRel) {
  const end = a.relievedAt ?? new Date();
  const durationDays = Math.floor((end.getTime() - a.assignedAt.getTime()) / 86400000);
  return {
    id: a.id,
    manager: a.managerId,
    manager_name: a.manager ? fullName(a.manager) : "",
    manager_username: a.manager?.username ?? "",
    branch: a.branchId,
    branch_name: a.branch?.name ?? "",
    assigned_at: iso(a.assignedAt),
    relieved_at: iso(a.relievedAt),
    is_active: a.relievedAt === null,
    duration_days: durationDays,
    assigned_by: a.assignedById ?? null,
    assigned_by_name: a.assignedBy ? fullName(a.assignedBy) || null : null,
    notes: a.notes,
  };
}

type ActivityLogRel = ManagerActivityLog & {
  manager?: Pick<User, "firstName" | "lastName" | "username"> | null;
  branch?: Pick<Branch, "name"> | null;
};

// ── Money flow ────────────────────────────────────────────────────────
type CommissionRel = RiderCommission & {
  rider?: Pick<User, "firstName" | "lastName" | "username"> | null;
  branch?: Pick<Branch, "name"> | null;
};

export function serializeCommission(c: CommissionRel) {
  return {
    id: c.id,
    rider: c.riderId,
    rider_name: c.rider ? fullName(c.rider) || c.rider.username : "",
    order: c.orderId,
    branch: c.branchId ?? null,
    branch_name: c.branch?.name ?? null,
    amount: decOr0(c.amount, 2),
    created_at: iso(c.createdAt),
  };
}

type WithdrawalRel = RiderWithdrawal & {
  rider?: Pick<User, "firstName" | "lastName" | "username"> | null;
  decidedBy?: Pick<User, "firstName" | "lastName"> | null;
};

export function serializeWithdrawal(w: WithdrawalRel) {
  return {
    id: w.id,
    rider: w.riderId,
    rider_name: w.rider ? fullName(w.rider) || w.rider.username : "",
    rider_username: w.rider?.username ?? "",
    amount: decOr0(w.amount, 2),
    status: w.status,
    status_display: withdrawalStatusDisplay(w.status),
    note: w.note,
    rejection_reason: w.rejectionReason,
    decided_by: w.decidedById ?? null,
    decided_by_name: w.decidedBy ? fullName(w.decidedBy) || null : null,
    decided_at: iso(w.decidedAt),
    paid_at: iso(w.paidAt),
    created_at: iso(w.createdAt),
  };
}

// ── Notifications & notices ───────────────────────────────────────────
export function serializeNotification(n: Notification) {
  // Complaint detail is a shared route. Normalize links written by older
  // versions so existing notifications remain usable without rewriting data.
  const legacyComplaintLink = n.link?.match(
    /^\/(?:admin|branch-manager|accounts|management|marketing)\/complaints\/(\d+)$/,
  );
  return {
    id: n.id,
    type: n.type,
    // Raw fallback / user-written content (e.g. a complaint subject).
    title: n.title,
    body: n.body,
    // System-generated notifications carry i18n keys + params; the client
    // translates these to the viewer's locale (falling back to title/body).
    title_key: n.titleKey ?? null,
    body_key: n.bodyKey ?? null,
    params: (n.params ?? null) as Record<string, string | number> | null,
    link: legacyComplaintLink ? `/complaints/${legacyComplaintLink[1]}` : (n.link ?? null),
    is_read: n.isRead,
    created_at: iso(n.createdAt),
  };
}

type NoticeRel = Notice & { author?: Pick<User, "firstName" | "lastName" | "username"> | null };

export function serializeNotice(n: NoticeRel) {
  return {
    id: n.id,
    author: n.authorId,
    author_name: n.author ? fullName(n.author) || n.author.username : "",
    title: n.title,
    body: n.body,
    audience: n.audience,
    audience_display: NOTICE_AUDIENCE_DISPLAY[n.audience] ?? n.audience,
    type: n.type,
    recipients: n.recipients,
    created_at: iso(n.createdAt),
  };
}

// ── Complaints ────────────────────────────────────────────────────────
type ComplaintMessageRel = ComplaintMessage & {
  sender?: Pick<User, "firstName" | "lastName" | "username" | "role"> | null;
};

export function serializeComplaintMessage(m: ComplaintMessageRel) {
  return {
    id: m.id,
    sender: m.senderId,
    sender_name: m.sender ? fullName(m.sender) || m.sender.username : "",
    sender_role: m.sender?.role ?? "",
    body: m.body,
    created_at: iso(m.createdAt),
  };
}

type ComplaintRel = Complaint & {
  complainant?: Pick<User, "firstName" | "lastName" | "username" | "role"> | null;
  branch?: Pick<Branch, "name"> | null;
  assignedTo?: Pick<User, "firstName" | "lastName"> | null;
  messages?: ComplaintMessageRel[];
  _count?: { messages: number };
};

export function serializeComplaint(c: ComplaintRel) {
  return {
    id: c.id,
    complainant: c.complainantId,
    complainant_name: c.complainant ? fullName(c.complainant) || c.complainant.username : "",
    complainant_role: c.complainant?.role ?? "",
    recipient_role: c.recipientRole,
    recipient_role_display: roleDisplay(c.recipientRole),
    branch: c.branchId ?? null,
    branch_name: c.branch?.name ?? null,
    order: c.orderId ?? null,
    category: c.category,
    category_display: complaintCategoryDisplay(c.category),
    subject: c.subject,
    message: c.message,
    status: c.status,
    status_display: complaintStatusDisplay(c.status),
    assigned_to: c.assignedToId ?? null,
    assigned_to_name: c.assignedTo ? fullName(c.assignedTo) || null : null,
    message_count: c._count?.messages ?? c.messages?.length ?? 0,
    messages: c.messages ? c.messages.map(serializeComplaintMessage) : undefined,
    created_at: iso(c.createdAt),
    updated_at: iso(c.updatedAt),
  };
}

export function serializeActivityLog(l: ActivityLogRel) {
  return {
    id: l.id,
    manager: l.managerId,
    manager_name: l.manager ? fullName(l.manager) : "",
    manager_username: l.manager?.username ?? "",
    branch: l.branchId ?? null,
    branch_name: l.branch?.name ?? null,
    activity_type: l.activityType,
    activity_type_display: ACTIVITY_DISPLAY[l.activityType as ActivityType] ?? l.activityType,
    description: l.description,
    ip_address: l.ipAddress ?? null,
    timestamp: iso(l.timestamp),
  };
}

/**
 * PHASE H — reward earning rule. Numbers stay numbers (the client formats
 * them); the actor + timestamps are exposed so the admin list can show who last
 * touched a rule without a second request.
 */
export function serializeRewardEarningRule(
  r: RewardEarningRule & {
    branch?: { id: number; name: string } | null;
    createdBy?: { firstName: string; lastName: string; username: string } | null;
    updatedBy?: { firstName: string; lastName: string; username: string } | null;
  },
) {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    is_active: r.isActive,
    is_archived: r.isArchived,
    fixed_points: r.fixedPoints,
    points_per_currency: r.pointsPerCurrency,
    min_order_amount: r.minOrderAmount,
    eligible_order_status: r.eligibleOrderStatus,
    eligible_payment_status: r.eligiblePaymentStatus,
    starts_at: iso(r.startsAt),
    ends_at: iso(r.endsAt),
    priority: r.priority,
    branch: r.branchId ?? null,
    branch_name: r.branch?.name ?? null,
    created_by: r.createdBy ? fullName(r.createdBy) : "",
    updated_by: r.updatedBy ? fullName(r.updatedBy) : "",
    created_at: iso(r.createdAt),
    updated_at: iso(r.updatedAt),
  };
}
