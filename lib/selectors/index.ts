// Role-scoped query helpers — ported from the previous app selectors.
import type { Prisma, User } from "@prisma/client";

import { ROLES } from "@/lib/constants/enums";
import { looksLikePhoneQuery, normalizeBdPhoneForSearch } from "@/lib/validation/server";
import { prisma } from "@/lib/db";
import { resolvedBranchIdFor } from "@/lib/services/customer-branch";
import { customerProductWhere } from "@/lib/services/product-eligibility";
import { daysAgo, midnight } from "@/lib/utils/dates";

// Shared includes so serializers always get their relations.
export const ORDER_INCLUDE = {
  items: { include: { product: true } },
  // PHASE J — append-only status audit, oldest first.
  statusEvents: { orderBy: { createdAt: "asc" as const } },
  customer: true,
  branch: true,
  rider: true,
  // #7/#14 — latest assignment offer + accepting rider for BM acceptance details.
  assignments: {
    orderBy: { createdAt: "desc" as const },
    take: 1,
    include: { rider: { select: { firstName: true, lastName: true, phone: true, username: true } } },
  },
} satisfies Prisma.OrderInclude;

export const USER_INCLUDE = { approvedBy: true } satisfies Prisma.UserInclude;

// ── Branches ──────────────────────────────────────────────────────────
export function activeBranchesWhere(): Prisma.BranchWhereInput {
  // req #5 — archived branches are never "active" (excluded from customer choices).
  return { isActive: true, isArchived: false };
}

/** The branch currently managed by this user, or null. */
export async function branchForManager(userId: number) {
  return prisma.branch.findFirst({ where: { managerId: userId } });
}

// ── Users ─────────────────────────────────────────────────────────────
export function adminUserWhere(excludeUserId?: number): Prisma.UserWhereInput {
  return excludeUserId ? { id: { not: excludeUserId } } : {};
}

export interface AdminUserListFilters {
  excludeUserId?: number;
  role?: string | null;
  status?: string | null;
  isActive?: string | null;
  search?: string | null;
}

/**
 * `where` for the Super Admin user list. Validates every param and silently
 * ignores unsupported values. `status` accepts the approval states
 * (pending/approved/rejected) plus `active`/`inactive` (isActive) and
 * `blocked` (isBlocked).
 */
export function adminUserListWhere(filters: AdminUserListFilters): Prisma.UserWhereInput {
  const and: Prisma.UserWhereInput[] = [];
  if (filters.excludeUserId) and.push({ id: { not: filters.excludeUserId } });
  if (filters.role && (ROLES as string[]).includes(filters.role)) and.push({ role: filters.role });

  switch (filters.status) {
    case "pending":
    case "approved":
    case "rejected":
      and.push({ status: filters.status });
      break;
    case "active":
      and.push({ isActive: true });
      break;
    case "inactive":
      and.push({ isActive: false });
      break;
    case "blocked":
      and.push({ isBlocked: true });
      break;
    default:
      break;
  }
  if (filters.isActive === "true" || filters.isActive === "false") {
    and.push({ isActive: filters.isActive === "true" });
  }

  const search = (filters.search ?? "").trim().slice(0, 80);
  // PHASE 10 — a phone-shaped query is normalized to its national significant
  // digits so "+880 1711-111111", "8801711111111", "01711111111" and a partial
  // "0171" all find the same stored "01711111111". Name/email search is
  // unaffected; a phone query still also tries the raw string.
  if (search && looksLikePhoneQuery(search)) {
    const significant = normalizeBdPhoneForSearch(search);
    if (significant) {
      and.push({
        OR: [
          { phone: { contains: significant } },
          { phone: { contains: search } },
          { username: { contains: search } },
        ],
      });
      return and.length ? { AND: and } : {};
    }
  }
  if (search) {
    const terms = search.split(/\s+/).filter(Boolean).slice(0, 4);
    if (terms.length > 1) {
      // Multi-word input: every term must hit a name part (full-name search),
      // or the whole string matches username/email/phone verbatim.
      and.push({
        OR: [
          {
            AND: terms.map((term) => ({
              OR: [
                { firstName: { contains: term } },
                { lastName: { contains: term } },
                { username: { contains: term } },
              ],
            })),
          },
          { username: { contains: search } },
          { email: { contains: search } },
          { phone: { contains: search } },
        ],
      });
    } else {
      and.push({
        OR: [
          { username: { contains: search } },
          { firstName: { contains: search } },
          { lastName: { contains: search } },
          { email: { contains: search } },
          { phone: { contains: search } },
        ],
      });
    }
  }

  return and.length ? { AND: and } : {};
}

export async function approvedBranchManagers() {
  return prisma.user.findMany({
    where: { role: "branch_manager", status: "approved" },
    orderBy: { firstName: "asc" },
  });
}

export async function approvedRiders() {
  return prisma.user.findMany({
    where: { role: "rider", status: "approved" },
    orderBy: { firstName: "asc" },
  });
}

// ── Catalog ───────────────────────────────────────────────────────────
// A branch's eligible categories = its OWN categories PLUS every global
// (branchId null = "Main Branch") category (req #8/#10). Branch managers and
// the public menu see only active, in-scope categories; the super admin sees
// all (optionally filtered to a branch's own + global).
/**
 * req #8 — PUBLIC homepage branch list. The landing page previously rendered a
 * hardcoded array of 10 demo branches (names, addresses and coverage invented in
 * source). Customer-facing pages must be driven by the real database, so this is
 * the single authoritative read: active, non-archived branches plus the names of
 * their ACTIVE delivery areas. Returns [] when there is nothing to show — the
 * page then renders an empty state rather than fabricated branches.
 */
export interface PublicHomeBranch {
  id: number;
  name: string;
  address: string;
  brandType: string;
  isActive: boolean;
  openingTime: string | null;
  closingTime: string | null;
  coverage: string[];
}

export async function publicHomeBranches(): Promise<PublicHomeBranch[]> {
  const branches = await prisma.branch.findMany({
    where: { isActive: true, isArchived: false },
    select: {
      id: true,
      name: true,
      address: true,
      brandType: true,
      isActive: true,
      openingTime: true,
      closingTime: true,
      deliveryAreas: {
        where: { isActive: true },
        select: { name: true },
        orderBy: { name: "asc" },
      },
    },
    orderBy: { name: "asc" },
  });
  return branches.map((b) => ({
    id: b.id,
    name: b.name,
    address: b.address,
    brandType: b.brandType,
    isActive: b.isActive,
    openingTime: b.openingTime,
    closingTime: b.closingTime,
    coverage: b.deliveryAreas.map((a) => a.name),
  }));
}

export async function categoriesForUser(user: User, branchId?: number, search?: string) {
  // req #11 — normalized search term (trim; SQLite LIKE is case-insensitive for
  // ASCII, matching the convention already used by adminUserListWhere).
  const term = (search ?? "").trim().slice(0, 80);
  const nameFilter: Prisma.CategoryWhereInput = term ? { name: { contains: term } } : {};
  // A branch is only "customer visible" when it is active AND not archived.
  const visibleBranch = { isActive: true, isArchived: false } as const;
  let where: Prisma.CategoryWhereInput;
  if (user.role === "branch_manager") {
    const branch = await branchForManager(user.id);
    where = { isActive: true, OR: [{ branchId: branch?.id ?? -1 }, { branchId: null }] };
  } else if (user.role === "super_admin") {
    // Filtered view = the branch's own categories + globals; unfiltered = all.
    where = branchId ? { OR: [{ branchId }, { branchId: null }] } : {};
  } else if (user.role === "customer") {
    // A customer's category list is scoped to their SERVER-RESOLVED branch, for
    // the same reason their product list is: the `branch` query parameter is
    // caller-supplied, and honouring it would expose another branch's category
    // names and let the homepage's category filter reach across branches.
    // Globals stay in scope — but the products under them are branch-scoped by
    // productsForUser, so a global category never mixes two branches' products.
    const resolved = await resolvedBranchIdFor(user.id);
    if (resolved == null) return [];
    where = { isActive: true, OR: [{ branchId: resolved, branch: visibleBranch }, { branchId: null }] };
  } else {
    // Any other unauthenticated/public read (req #9): only ACTIVE categories, and
    // a branch-scoped category must belong to a branch that is itself active and
    // NOT archived. Globals (branchId null) are always in scope.
    where = branchId
      ? { isActive: true, OR: [{ branchId, branch: visibleBranch }, { branchId: null }] }
      : { isActive: true, OR: [{ branchId: null }, { branch: visibleBranch }] };
  }
  return prisma.category.findMany({
    where: { ...where, ...nameFilter },
    include: { branch: true, _count: { select: { products: true } } },
    orderBy: { name: "asc" },
  });
}

export async function productsForUser(
  user: User,
  branchId?: number,
  brand?: string,
  opts: { search?: string; categoryId?: number } = {},
) {
  const brandFilter = brand ? { brand } : {};
  // Soft-deleted products (req #4) are hidden from every catalog list, for every
  // role; historical orders still resolve them directly by id.
  const notDeleted = { deletedAt: null } as const;
  // req #11 — server-side search (trim; SQLite LIKE is case-insensitive for ASCII).
  const term = (opts.search ?? "").trim().slice(0, 80);
  const searchFilter: Prisma.ProductWhereInput = term
    ? { OR: [{ name: { contains: term } }, { description: { contains: term } }] }
    : {};
  const categoryFilter: Prisma.ProductWhereInput =
    opts.categoryId != null ? { categoryId: opts.categoryId } : {};
  let where: Prisma.ProductWhereInput;
  if (user.role === "branch_manager") {
    const branch = await branchForManager(user.id);
    where = { branchId: branch?.id ?? -1, ...notDeleted, ...brandFilter };
  } else if (user.role === "super_admin") {
    where = { ...notDeleted, ...(branchId ? { branchId } : {}), ...brandFilter };
  } else {
    // req #9 — customer visibility is NOT defined here. It comes from the one
    // shared definition in lib/services/product-eligibility, which the
    // storefront, the menu, search, product detail, the cart and order creation
    // all compose. Re-stating the rules locally is exactly how this list and
    // the order pipeline drifted apart.
    //
    // BRANCH SCOPE IS SERVER-RESOLVED. A customer orders from exactly one
    // nearest eligible branch, computed from their own trusted coordinates, so
    // the caller's `branchId` argument is IGNORED for this role: it arrives from
    // a query string (`?branch=`/`?branch_id=`) and would otherwise let anyone
    // read another branch's catalogue by editing the URL. With no resolvable
    // branch there is nothing this customer may order, and the honest answer is
    // an empty list rather than every branch's products.
    const resolved = await resolvedBranchIdFor(user.id);
    if (resolved == null) return [];
    where = customerProductWhere({ branchId: resolved, brand });
  }
  return prisma.product.findMany({
    where: { AND: [where, searchFilter, categoryFilter] },
    include: { branch: true, category: true, variations: { orderBy: { sortOrder: "asc" } } },
    orderBy: [{ isPopular: "desc" }, { name: "asc" }],
  });
}

// ── Orders ────────────────────────────────────────────────────────────
/** Prisma `where` limiting which orders a user may see (queryset scoping). */
export async function ordersWhereForUser(
  user: Pick<User, "id" | "role">,
): Promise<Prisma.OrderWhereInput | null> {
  switch (user.role) {
    case "super_admin":
    case "management":
    case "accounts":
      return {};
    case "branch_manager": {
      const branch = await branchForManager(user.id);
      return branch ? { branchId: branch.id } : null; // null => empty result
    }
    case "rider":
      return { riderId: user.id };
    case "customer":
      return { customerId: user.id };
    default:
      return null;
  }
}

// ── Riders ────────────────────────────────────────────────────────────
export async function ridersForBranch(branchId: number) {
  return prisma.riderProfile.findMany({
    where: { assignedBranchId: branchId },
    include: { user: true, assignedBranch: true },
  });
}

export async function todayDuty(riderId: number) {
  return prisma.riderDutyLog.findUnique({
    where: { riderId_date: { riderId, date: midnight() } },
    include: { branch: true },
  });
}

export async function dutyHistory(riderId: number, days = 30) {
  return prisma.riderDutyLog.findMany({
    where: { riderId, date: { gte: daysAgo(days) } },
    include: { branch: true },
    orderBy: [{ date: "desc" }, { clockIn: "desc" }],
  });
}
