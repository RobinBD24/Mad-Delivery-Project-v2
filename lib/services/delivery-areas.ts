import "server-only";
import { Prisma } from "@prisma/client";
import type { BranchDeliveryArea, User } from "@prisma/client";

import { prisma } from "@/lib/db";
import type {
  DeliveryAreaListQuery,
  DeliveryAreaListResult,
  DeliveryAreaRow,
} from "@/lib/delivery-areas/query";
import { forbidden, notFound, sk, validationError } from "@/lib/http/errors";
import { branchForManager } from "@/lib/selectors";
import { isValidLatLng } from "@/lib/services/geo";
import {
  LIMITS,
  decimalPlaces,
  isFiniteNumber,
} from "@/lib/validation/limits";

/** Case/space-insensitive normalized form for scoped duplicate detection (#1). */
export function normalizeAreaName(name: string): string {
  return name.trim().toLowerCase();
}

type SerializableArea = BranchDeliveryArea & {
  branch?: {
    name: string;
    address?: string;
    brandType?: string;
  } | null;
};

export function serializeArea(a: SerializableArea): DeliveryAreaRow {
  return {
    id: a.id,
    branch: a.branchId,
    branch_name: a.branch?.name ?? null,
    branch_address: a.branch?.address ?? null,
    branch_brand_type: a.branch?.brandType ?? null,
    name: a.name,
    is_active: a.isActive,
    is_held: a.isHeld,
    hold_reason: a.holdReason,
    estimated_delivery_minutes: a.estimatedDeliveryMinutes,
    delivery_charge: (a.deliveryCharge instanceof Prisma.Decimal ? a.deliveryCharge : new Prisma.Decimal(a.deliveryCharge)).toFixed(2),
    center_lat: a.centerLat != null ? Number(a.centerLat) : null,
    center_lng: a.centerLng != null ? Number(a.centerLng) : null,
    created_at: a.createdAt.toISOString(),
    updated_at: a.updatedAt.toISOString(),
  };
}

/**
 * The branch a user may manage delivery areas in.
 * - super_admin: the submitted branch (must exist).
 * - branch_manager: ALWAYS their own assigned branch — a submitted branchId is
 *   ignored, so a BM can never spoof another branch (IDOR).
 * Anyone else is forbidden.
 */
export async function resolveAreaBranch(user: User, submittedBranchId?: number) {
  if (user.role === "branch_manager") {
    const branch = await branchForManager(user.id);
    if (!branch) throw forbidden(sk("errors.catalog.noBranchAssigned"));
    return branch;
  }
  if (user.role === "super_admin") {
    if (!submittedBranchId || Number.isNaN(submittedBranchId)) {
      throw validationError({ branch_id: sk("errors.catalog.selectBranch") });
    }
    const branch = await prisma.branch.findUnique({ where: { id: submittedBranchId } });
    if (!branch) throw validationError({ branch_id: sk("errors.catalog.selectBranch") });
    return branch;
  }
  throw forbidden(sk("errors.deliveryArea.forbidden"));
}

/** Load an area the user may manage (SA any; BM own branch), or throw 403/404. */
export async function areaForManage(user: User, areaId: number) {
  const area = await prisma.branchDeliveryArea.findUnique({
    where: { id: areaId },
    include: {
      branch: {
        select: { name: true, address: true, brandType: true },
      },
    },
  });
  if (!area) throw notFound(sk("errors.deliveryArea.notFound"));
  if (user.role === "super_admin") return area;
  if (user.role === "branch_manager") {
    const branch = await branchForManager(user.id);
    if (!branch) throw forbidden(sk("errors.catalog.noBranchAssigned"));
    if (area.branchId !== branch.id) throw forbidden(sk("errors.deliveryArea.notYourBranch"));
    return area;
  }
  throw forbidden(sk("errors.deliveryArea.forbidden"));
}

function parseMinutes(v: unknown): number {
  const n = Number(v);
  if (
    !isFiniteNumber(v) ||
    !Number.isInteger(n) ||
    n < LIMITS.minutesMin ||
    n > LIMITS.minutesMax
  ) {
    throw validationError({ estimated_delivery_minutes: sk("errors.deliveryArea.invalidMinutes") });
  }
  return Math.round(n);
}

function parseCharge(v: unknown): Prisma.Decimal {
  const raw = typeof v === "number" || typeof v === "string" ? String(v).trim() : "";
  const n = Number(raw);
  if (
    !raw ||
    !isFiniteNumber(raw) ||
    decimalPlaces(raw) > LIMITS.moneyDecimals ||
    n < LIMITS.moneyMin ||
    n > LIMITS.moneyMax
  ) {
    throw validationError({ delivery_charge: sk("errors.deliveryArea.invalidCharge") });
  }
  return new Prisma.Decimal(n.toFixed(2));
}

function parseCoords(lat: unknown, lng: unknown): { lat: Prisma.Decimal; lng: Prisma.Decimal } | null {
  if (lat === undefined || lat === null || lat === "" || lng === undefined || lng === null || lng === "") return null;
  if (!isValidLatLng(Number(lat), Number(lng))) {
    throw validationError({ center_lat: sk("errors.orders.invalidCoordinates") });
  }
  return { lat: new Prisma.Decimal(Number(lat).toFixed(7)), lng: new Prisma.Decimal(Number(lng).toFixed(7)) };
}

export interface AreaInput {
  branchId?: number;
  name: string;
  estimatedDeliveryMinutes?: unknown;
  deliveryCharge?: unknown;
  centerLat?: unknown;
  centerLng?: unknown;
  isActive?: unknown;
}

function validatedName(value: unknown): string {
  const name = String(value ?? "").trim();
  if (!name) throw validationError({ name: sk("errors.deliveryArea.nameRequired") });
  if (name.length < LIMITS.nameMin || name.length > LIMITS.nameMax) {
    throw validationError({
      name: sk("errors.deliveryArea.invalidNameLength", {
        min: LIMITS.nameMin,
        max: LIMITS.nameMax,
      }),
    });
  }
  return name;
}

function parseActive(value: unknown): boolean {
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  throw validationError({ is_active: sk("errors.deliveryArea.invalidActive") });
}

export async function createArea(user: User, input: AreaInput) {
  const branch = await resolveAreaBranch(user, input.branchId);
  if (!branch.isActive || branch.isArchived) {
    throw validationError({ branch_id: sk("errors.deliveryArea.branchUnavailable") });
  }
  const name = validatedName(input.name);
  const normalizedName = normalizeAreaName(name);
  const clash = await prisma.branchDeliveryArea.findFirst({ where: { branchId: branch.id, normalizedName } });
  if (clash) throw validationError({ name: sk("errors.deliveryArea.duplicate") });
  const coords = parseCoords(input.centerLat, input.centerLng);
  return prisma.branchDeliveryArea.create({
    data: {
      branchId: branch.id,
      name,
      normalizedName,
      estimatedDeliveryMinutes: input.estimatedDeliveryMinutes === undefined ? 45 : parseMinutes(input.estimatedDeliveryMinutes),
      deliveryCharge: input.deliveryCharge === undefined ? new Prisma.Decimal(0) : parseCharge(input.deliveryCharge),
      isActive: input.isActive === undefined ? true : parseActive(input.isActive),
      centerLat: coords?.lat ?? null,
      centerLng: coords?.lng ?? null,
      updatedById: user.id,
    },
    include: { branch: { select: { name: true } } },
  });
}

export async function updateArea(user: User, areaId: number, input: Partial<AreaInput>) {
  const area = await areaForManage(user, areaId);
  const data: Prisma.BranchDeliveryAreaUpdateInput = { updatedById: user.id };
  if (input.name !== undefined) {
    const name = validatedName(input.name);
    const normalizedName = normalizeAreaName(name);
    const clash = await prisma.branchDeliveryArea.findFirst({
      where: { branchId: area.branchId, normalizedName, id: { not: areaId } },
    });
    if (clash) throw validationError({ name: sk("errors.deliveryArea.duplicate") });
    data.name = name;
    data.normalizedName = normalizedName;
  }
  if (input.estimatedDeliveryMinutes !== undefined) data.estimatedDeliveryMinutes = parseMinutes(input.estimatedDeliveryMinutes);
  if (input.deliveryCharge !== undefined) data.deliveryCharge = parseCharge(input.deliveryCharge);
  if (input.isActive !== undefined) data.isActive = parseActive(input.isActive);
  if (input.centerLat !== undefined || input.centerLng !== undefined) {
    const coords = parseCoords(input.centerLat, input.centerLng);
    data.centerLat = coords?.lat ?? null;
    data.centerLng = coords?.lng ?? null;
  }
  return prisma.branchDeliveryArea.update({
    where: { id: areaId },
    data,
    include: { branch: { select: { name: true } } },
  });
}

/** Hold (block new delivery orders) or resume an area. Existing orders untouched. */
export async function setAreaHold(user: User, areaId: number, held: boolean, reason = "") {
  await areaForManage(user, areaId);
  return prisma.branchDeliveryArea.update({
    where: { id: areaId },
    data: { isHeld: held, holdReason: held ? String(reason ?? "") : "", updatedById: user.id },
    include: { branch: { select: { name: true } } },
  });
}

/** List areas visible to the user, optional branch + status filter. */
export async function areasForUser(
  user: User,
  opts: { branchId?: number; status?: "active" | "held" } = {},
) {
  let where: Prisma.BranchDeliveryAreaWhereInput;
  if (user.role === "branch_manager") {
    const branch = await branchForManager(user.id);
    where = { branchId: branch?.id ?? -1 };
  } else if (user.role === "super_admin") {
    where = opts.branchId ? { branchId: opts.branchId } : {};
  } else {
    throw forbidden(sk("errors.deliveryArea.forbidden"));
  }
  if (opts.status === "held") where = { ...where, isHeld: true };
  else if (opts.status === "active") where = { ...where, isHeld: false, isActive: true };
  return prisma.branchDeliveryArea.findMany({
    where,
    include: { branch: { select: { name: true } } },
    orderBy: [{ branchId: "asc" }, { name: "asc" }],
  });
}

function listScopeWhere(user: User, managerBranchId: number | null): Prisma.BranchDeliveryAreaWhereInput {
  if (user.role === "branch_manager") return { branchId: managerBranchId ?? -1 };
  if (user.role === "super_admin") return {};
  throw forbidden(sk("errors.deliveryArea.forbidden"));
}

function listOrderBy(
  query: DeliveryAreaListQuery,
): Prisma.BranchDeliveryAreaOrderByWithRelationInput[] {
  const direction = query.direction;
  switch (query.sort) {
    case "branch":
      return [{ branch: { name: direction } }, { name: "asc" }, { id: "asc" }];
    case "minutes":
      return [{ estimatedDeliveryMinutes: direction }, { name: "asc" }, { id: "asc" }];
    case "charge":
      return [{ deliveryCharge: direction }, { name: "asc" }, { id: "asc" }];
    case "updated":
      return [{ updatedAt: direction }, { name: "asc" }, { id: "asc" }];
    default:
      return [{ name: direction }, { branchId: "asc" }, { id: "asc" }];
  }
}

/**
 * Server-paginated Delivery Areas management query. Scope is derived from the
 * authenticated user first, then every optional filter is ANDed inside it.
 */
export async function deliveryAreaListForUser(
  user: User,
  query: DeliveryAreaListQuery,
): Promise<DeliveryAreaListResult> {
  const managerBranch =
    user.role === "branch_manager" ? await branchForManager(user.id) : null;
  const scopeWhere = listScopeWhere(user, managerBranch?.id ?? null);
  const filters: Prisma.BranchDeliveryAreaWhereInput[] = [scopeWhere];

  if (user.role === "super_admin" && query.branchId) {
    filters.push({ branchId: query.branchId });
  }
  if (query.activeStatus) filters.push({ isActive: query.activeStatus === "active" });
  if (query.deliveryState) filters.push({ isHeld: query.deliveryState === "held" });
  if (query.search) {
    filters.push({
      OR: [
        { name: { contains: query.search } },
        { branch: { name: { contains: query.search } } },
        { branch: { address: { contains: query.search } } },
      ],
    });
  }

  const where: Prisma.BranchDeliveryAreaWhereInput = { AND: filters };
  const count = await prisma.branchDeliveryArea.count({ where });
  const totalPages = Math.max(1, Math.ceil(count / query.pageSize));
  const page = Math.min(query.page, totalPages);

  const [rows, total, active, held, inactive, covered] = await Promise.all([
    prisma.branchDeliveryArea.findMany({
      where,
      include: {
        branch: {
          select: { name: true, address: true, brandType: true },
        },
      },
      orderBy: listOrderBy(query),
      skip: (page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.branchDeliveryArea.count({ where: scopeWhere }),
    prisma.branchDeliveryArea.count({ where: { AND: [scopeWhere, { isActive: true }] } }),
    prisma.branchDeliveryArea.count({ where: { AND: [scopeWhere, { isHeld: true }] } }),
    prisma.branchDeliveryArea.count({ where: { AND: [scopeWhere, { isActive: false }] } }),
    prisma.branchDeliveryArea.groupBy({ by: ["branchId"], where: scopeWhere }),
  ]);

  return {
    count,
    page,
    pageSize: query.pageSize,
    results: rows.map(serializeArea),
    summary: {
      total,
      active,
      held,
      inactive,
      branches: covered.length,
    },
  };
}

/**
 * Resolve + validate a delivery area for a NEW order on a branch (#1/#13/#22):
 * area must belong to the branch, be active, and NOT be held (held → 400).
 * Returns the snapshot fields to persist immutably on the order.
 */
export async function resolveOrderDeliveryArea(branchId: number, areaId: number | null | undefined) {
  if (areaId == null) return null;
  const area = await prisma.branchDeliveryArea.findUnique({ where: { id: areaId } });
  if (!area || area.branchId !== branchId) {
    throw validationError({ delivery_area_id: sk("errors.deliveryArea.notForBranch") });
  }
  if (!area.isActive) throw validationError({ delivery_area_id: sk("errors.deliveryArea.inactive") });
  if (area.isHeld) throw validationError({ delivery_area_id: sk("errors.deliveryArea.held") });
  return area;
}
