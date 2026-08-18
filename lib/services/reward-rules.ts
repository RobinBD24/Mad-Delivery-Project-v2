import "server-only";
import type { Prisma, RewardEarningRule, User } from "@prisma/client";

import { prisma } from "@/lib/db";
import { conflict, forbidden, notFound, sk, validationError } from "@/lib/http/errors";
import { createNotification } from "@/lib/services/notifications";
import { PAYMENT_STATUSES } from "@/lib/services/payments";
import { rewardProgramActive } from "@/lib/services/rewards";

/**
 * PHASE H — SUPER ADMIN earning rules for delivered orders.
 *
 * Design notes that matter:
 * - Money is NEVER multiplied as a float. The order total is converted to
 *   integer poisha and the rate to integer thousandths, so `12.35 Tk × 0.1` can
 *   never drift to 1.2350000000000002 coins.
 * - Editing a rule changes FUTURE awards only: an award is written once, with
 *   the coin amount and the rule id frozen into the ledger row.
 * - Two active rules that could both claim the same order at the same priority
 *   are ambiguous, so the WRITE is refused (409). Distinct priorities are a
 *   deliberate, explicit resolution and are allowed.
 * - A rule that has already paid out is archived, never deleted, so the ledger
 *   keeps pointing at the exact rule that produced each entry.
 */

export const RULE_ORDER_STATUSES = ["delivered", "on_the_way", "picked_up", "ready"] as const;
export const RULE_PAYMENT_STATUSES = ["any", ...PAYMENT_STATUSES] as const;

export interface EarningRuleInput {
  name?: string;
  description?: string;
  isActive?: boolean;
  fixedPoints?: number;
  pointsPerCurrency?: number;
  minOrderAmount?: number;
  eligibleOrderStatus?: string;
  eligiblePaymentStatus?: string;
  startsAt?: string | null;
  endsAt?: string | null;
  priority?: number;
  branchId?: number | null;
}

/**
 * snake_case request body → service input. Only keys the caller actually sent
 * are forwarded, so a PATCH never silently resets a field it did not mention.
 */
export function parseRuleBody(body: Record<string, unknown>): EarningRuleInput {
  return {
    ...(body.name !== undefined ? { name: String(body.name) } : {}),
    ...(body.description !== undefined ? { description: String(body.description) } : {}),
    ...(body.is_active !== undefined ? { isActive: Boolean(body.is_active) } : {}),
    ...(body.fixed_points !== undefined ? { fixedPoints: Number(body.fixed_points) } : {}),
    ...(body.points_per_currency !== undefined ? { pointsPerCurrency: Number(body.points_per_currency) } : {}),
    ...(body.min_order_amount !== undefined ? { minOrderAmount: Number(body.min_order_amount) } : {}),
    ...(body.eligible_order_status !== undefined ? { eligibleOrderStatus: String(body.eligible_order_status) } : {}),
    ...(body.eligible_payment_status !== undefined
      ? { eligiblePaymentStatus: String(body.eligible_payment_status) }
      : {}),
    ...(body.starts_at !== undefined ? { startsAt: body.starts_at === null ? null : String(body.starts_at) } : {}),
    ...(body.ends_at !== undefined ? { endsAt: body.ends_at === null ? null : String(body.ends_at) } : {}),
    ...(body.priority !== undefined ? { priority: Number(body.priority) } : {}),
    ...(body.branch_id !== undefined ? { branchId: body.branch_id === null ? null : Number(body.branch_id) } : {}),
  };
}

function requireSuperAdmin(user: User) {
  if (user.role !== "super_admin") throw forbidden(sk("errors.rewards.forbidden"));
}

/** Integer poisha from a Decimal/number/string amount — no float rounding. */
function toPoisha(amount: unknown): number {
  return Math.round(Number(amount ?? 0) * 100);
}

/**
 * coins = fixedPoints + floor(total × pointsPerCurrency), evaluated in integer
 * space: poisha (2dp) × milli-rate (3dp) / 100_000.
 */
export function computeRuleCoins(rule: Pick<RewardEarningRule, "fixedPoints" | "pointsPerCurrency">, total: unknown): number {
  const poisha = toPoisha(total);
  const milliRate = Math.round(Number(rule.pointsPerCurrency ?? 0) * 1000);
  const variable = Math.floor((poisha * milliRate) / 100_000);
  return Math.max(0, Math.floor(rule.fixedPoints ?? 0) + variable);
}

function parseDate(value: string | null | undefined, field: string): Date | null {
  if (value === undefined || value === null || value === "") return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw validationError({ [field]: sk("errors.rewardRules.invalidDate") });
  return d;
}

async function validate(input: EarningRuleInput, existing?: RewardEarningRule) {
  const name = String(input.name ?? existing?.name ?? "").trim();
  if (!name) throw validationError({ name: sk("errors.rewardRules.nameRequired") });
  if (name.length > 120) throw validationError({ name: sk("errors.rewardRules.nameTooLong") });

  const num = (value: unknown, fallback: number, field: string) => {
    if (value === undefined || value === null || value === "") return fallback;
    const n = Number(value);
    // No negative points or values — a rule can only ever add coins.
    if (Number.isNaN(n) || n < 0) throw validationError({ [field]: sk("errors.rewardRules.negativeValue") });
    return n;
  };

  const fixedPoints = Math.floor(num(input.fixedPoints, existing?.fixedPoints ?? 0, "fixed_points"));
  const pointsPerCurrency = num(input.pointsPerCurrency, existing?.pointsPerCurrency ?? 0, "points_per_currency");
  const minOrderAmount = num(input.minOrderAmount, existing?.minOrderAmount ?? 0, "min_order_amount");
  const priority = Math.floor(num(input.priority, existing?.priority ?? 0, "priority"));

  // A rule that can never award anything is a configuration mistake, not a
  // silent no-op that quietly stops customers earning.
  if (fixedPoints === 0 && pointsPerCurrency === 0) {
    throw validationError({ fixed_points: sk("errors.rewardRules.noPoints") });
  }

  const eligibleOrderStatus = String(input.eligibleOrderStatus ?? existing?.eligibleOrderStatus ?? "delivered");
  if (!(RULE_ORDER_STATUSES as readonly string[]).includes(eligibleOrderStatus)) {
    throw validationError({ eligible_order_status: sk("errors.rewardRules.invalidOrderStatus") });
  }
  const eligiblePaymentStatus = String(input.eligiblePaymentStatus ?? existing?.eligiblePaymentStatus ?? "any");
  if (!(RULE_PAYMENT_STATUSES as readonly string[]).includes(eligiblePaymentStatus)) {
    throw validationError({ eligible_payment_status: sk("errors.rewardRules.invalidPaymentStatus") });
  }

  const startsAt = input.startsAt !== undefined ? parseDate(input.startsAt, "starts_at") : existing?.startsAt ?? null;
  const endsAt = input.endsAt !== undefined ? parseDate(input.endsAt, "ends_at") : existing?.endsAt ?? null;
  if (startsAt && endsAt && endsAt.getTime() <= startsAt.getTime()) {
    throw validationError({ ends_at: sk("errors.rewardRules.endBeforeStart") });
  }

  let branchId = input.branchId !== undefined ? input.branchId : existing?.branchId ?? null;
  if (branchId !== null && branchId !== undefined) {
    branchId = Number(branchId);
    if (!Number.isInteger(branchId)) throw validationError({ branch_id: sk("errors.rewardRules.invalidBranch") });
    const branch = await prisma.branch.findUnique({ where: { id: branchId } });
    if (!branch) throw validationError({ branch_id: sk("errors.rewardRules.invalidBranch") });
  }

  const isActive = input.isActive !== undefined ? Boolean(input.isActive) : existing?.isActive ?? true;

  return {
    name,
    description: String(input.description ?? existing?.description ?? "").trim().slice(0, 500),
    isActive,
    fixedPoints,
    pointsPerCurrency,
    minOrderAmount,
    eligibleOrderStatus,
    eligiblePaymentStatus,
    startsAt,
    endsAt,
    priority,
    branchId: (branchId ?? null) as number | null,
  };
}

/** Do two [start, end] windows (null = open-ended) overlap at all? */
function windowsOverlap(aStart: Date | null, aEnd: Date | null, bStart: Date | null, bEnd: Date | null): boolean {
  if (aEnd && bStart && aEnd.getTime() <= bStart.getTime()) return false;
  if (bEnd && aStart && bEnd.getTime() <= aStart.getTime()) return false;
  return true;
}

/**
 * Ambiguity guard. Two ACTIVE rules collide when they could both claim the same
 * order: same eligible order status, overlapping branch scope (a global rule
 * overlaps every branch), overlapping date window — AND the same priority, which
 * leaves no deterministic winner.
 */
interface RuleScope {
  isActive: boolean;
  priority: number;
  eligibleOrderStatus: string;
  branchId: number | null;
  startsAt: Date | null;
  endsAt: Date | null;
}

async function assertNoAmbiguity(candidate: RuleScope, excludeId?: number) {
  if (!candidate.isActive) return;
  const rivals = await prisma.rewardEarningRule.findMany({
    where: {
      isActive: true,
      isArchived: false,
      priority: candidate.priority,
      eligibleOrderStatus: candidate.eligibleOrderStatus,
      ...(excludeId ? { id: { not: excludeId } } : {}),
      ...(candidate.branchId === null ? {} : { OR: [{ branchId: candidate.branchId }, { branchId: null }] }),
    },
  });
  const clash = rivals.find((r) => windowsOverlap(candidate.startsAt, candidate.endsAt, r.startsAt, r.endsAt));
  if (clash) throw conflict(sk("errors.rewardRules.ambiguous", { name: clash.name, priority: clash.priority }));
}

const RULE_INCLUDE = {
  branch: { select: { id: true, name: true } },
  createdBy: { select: { id: true, firstName: true, lastName: true, username: true } },
  updatedBy: { select: { id: true, firstName: true, lastName: true, username: true } },
} satisfies Prisma.RewardEarningRuleInclude;

export async function listEarningRules(user: User, opts: { includeArchived?: boolean } = {}) {
  requireSuperAdmin(user);
  return prisma.rewardEarningRule.findMany({
    where: opts.includeArchived ? {} : { isArchived: false },
    include: RULE_INCLUDE,
    orderBy: [{ priority: "desc" }, { id: "asc" }],
  });
}

export async function getEarningRule(user: User, id: number) {
  requireSuperAdmin(user);
  const rule = await prisma.rewardEarningRule.findUnique({ where: { id }, include: RULE_INCLUDE });
  if (!rule) throw notFound(sk("errors.rewardRules.notFound"));
  return rule;
}

export async function createEarningRule(user: User, input: EarningRuleInput) {
  requireSuperAdmin(user);
  const data = await validate(input);
  await assertNoAmbiguity(data);
  return prisma.rewardEarningRule.create({
    data: { ...data, createdById: user.id, updatedById: user.id },
    include: RULE_INCLUDE,
  });
}

export async function updateEarningRule(user: User, id: number, input: EarningRuleInput) {
  requireSuperAdmin(user);
  const existing = await prisma.rewardEarningRule.findUnique({ where: { id } });
  if (!existing) throw notFound(sk("errors.rewardRules.notFound"));
  if (existing.isArchived) throw conflict(sk("errors.rewardRules.archived"));
  const data = await validate(input, existing);
  await assertNoAmbiguity(data, id);
  return prisma.rewardEarningRule.update({
    where: { id },
    data: { ...data, updatedById: user.id },
    include: RULE_INCLUDE,
  });
}

/** Activate / deactivate. Repeating the current state is a 409, as in Phase G. */
export async function setEarningRuleActive(user: User, id: number, active: boolean) {
  requireSuperAdmin(user);
  const existing = await prisma.rewardEarningRule.findUnique({ where: { id } });
  if (!existing) throw notFound(sk("errors.rewardRules.notFound"));
  if (existing.isArchived) throw conflict(sk("errors.rewardRules.archived"));
  if (existing.isActive === active) throw conflict(sk("errors.rewardRules.alreadyInState"));
  if (active) await assertNoAmbiguity({ ...existing, isActive: true }, id);
  return prisma.rewardEarningRule.update({
    where: { id },
    data: { isActive: active, updatedById: user.id },
    include: RULE_INCLUDE,
  });
}

/**
 * Safe delete. A rule that has never paid out is genuinely removed; one that
 * appears in the ledger is ARCHIVED so history keeps its reference. The caller
 * is told which of the two happened.
 */
export async function deleteEarningRule(user: User, id: number) {
  requireSuperAdmin(user);
  const existing = await prisma.rewardEarningRule.findUnique({ where: { id } });
  if (!existing) throw notFound(sk("errors.rewardRules.notFound"));
  const used = await prisma.rewardLedger.count({ where: { ruleId: id } });
  if (used > 0) {
    const archived = await prisma.rewardEarningRule.update({
      where: { id },
      data: { isArchived: true, isActive: false, updatedById: user.id },
      include: RULE_INCLUDE,
    });
    return { archived: true, rule: archived, ledgerEntries: used };
  }
  await prisma.rewardEarningRule.delete({ where: { id } });
  return { archived: false, rule: existing, ledgerEntries: 0 };
}

/**
 * The rule that prices this order, or null. Highest priority wins; a tie is
 * impossible for active rules because the write path refuses to create one.
 */
export async function matchEarningRule(order: {
  branchId: number;
  status: string;
  paymentStatus: string;
  totalAmount: unknown;
}, now = new Date()): Promise<RewardEarningRule | null> {
  const candidates = await prisma.rewardEarningRule.findMany({
    where: {
      isActive: true,
      isArchived: false,
      eligibleOrderStatus: order.status,
      OR: [{ branchId: null }, { branchId: order.branchId }],
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
      ],
    },
    orderBy: [{ priority: "desc" }, { id: "asc" }],
  });
  const totalPoisha = toPoisha(order.totalAmount);
  return (
    candidates.find(
      (r) =>
        totalPoisha >= toPoisha(r.minOrderAmount) &&
        (r.eligiblePaymentStatus === "any" || r.eligiblePaymentStatus === order.paymentStatus),
    ) ?? null
  );
}

/**
 * Award for a qualifying order. Returns the coins written (0 when nothing
 * applies or the order was already paid out — the ledger's
 * (userId, reason, dedupeKey) unique index is the duplicate guard, so a replay
 * can never pay twice).
 */
export async function awardOrderCoinsByRule(order: {
  id: number;
  customerId: number;
  branchId: number;
  status: string;
  paymentStatus: string;
  totalAmount: unknown;
}): Promise<{ coins: number; rule: RewardEarningRule } | null> {
  if (!(await rewardProgramActive())) return null;
  const rule = await matchEarningRule(order);
  if (!rule) return null;
  const coins = computeRuleCoins(rule, order.totalAmount);
  if (coins <= 0) return null;
  try {
    await prisma.rewardLedger.create({
      data: {
        userId: order.customerId,
        coins,
        reason: "order_delivered",
        dedupeKey: `order:${order.id}`,
        ruleId: rule.id,
      },
    });
  } catch {
    // Already awarded for this order — never pay a second time.
    return null;
  }
  await createNotification(order.customerId, {
    type: "system",
    titleKey: "notifications.reward.earned.title",
    bodyKey: "notifications.reward.earned.body",
    params: { coins },
    link: "/customer/rewards",
  });
  return { coins, rule };
}
