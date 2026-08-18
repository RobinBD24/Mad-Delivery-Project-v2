import "server-only";
import { Prisma } from "@prisma/client";
import type { User } from "@prisma/client";

import { prisma } from "@/lib/db";
import { conflict, forbidden, sk, validationError } from "@/lib/http/errors";
import { createNotification } from "@/lib/services/notifications";
import { getSetting, setSetting } from "@/lib/services/settings";

const REWARD_RULE_KEYS = ["profile_complete", "daily_login", "order_delivered"] as const;
export type RewardRuleKey = (typeof REWARD_RULE_KEYS)[number];

const REWARD_SETTING_KEYS = {
  coinValueTk: "reward_coin_value_tk", // Tk value of 1 coin
  minRedeemCoins: "reward_min_redeem_coins",
  // PHASE G — global on/off for the whole reward programme. Stored in the
  // existing SystemSetting table (which already records actor + timestamp), so
  // there is no second, competing reward engine.
  programActive: "reward_program_active",
} as const;

const DEFAULT_RULES: Record<RewardRuleKey, number> = {
  profile_complete: 50,
  daily_login: 5,
  order_delivered: 10,
};
const DEFAULT_COIN_VALUE = "0.50";
const DEFAULT_MIN_REDEEM = "100";
const DEFAULT_PROGRAM_ACTIVE = "true";

/** All rules (auto-creating defaults on first call) + settings. */
export async function rewardConfig() {
  for (const key of REWARD_RULE_KEYS) {
    await prisma.rewardRule.upsert({
      where: { key },
      update: {},
      create: { key, coins: DEFAULT_RULES[key], isActive: true },
    });
  }
  const [rules, coinValue, minRedeem, active] = await Promise.all([
    prisma.rewardRule.findMany({ orderBy: { id: "asc" } }),
    getSetting(REWARD_SETTING_KEYS.coinValueTk),
    getSetting(REWARD_SETTING_KEYS.minRedeemCoins),
    getSetting(REWARD_SETTING_KEYS.programActive),
  ]);
  return {
    rules,
    coinValueTk: coinValue ?? DEFAULT_COIN_VALUE,
    minRedeemCoins: Number(minRedeem ?? DEFAULT_MIN_REDEEM),
    programActive: (active ?? DEFAULT_PROGRAM_ACTIVE) === "true",
  };
}

export async function updateRewardConfig(
  input: { rules: { key: string; coins: number; isActive: boolean }[]; coinValueTk: string; minRedeemCoins: number },
  actorId: number,
) {
  for (const r of input.rules) {
    if (!REWARD_RULE_KEYS.includes(r.key as RewardRuleKey)) continue;
    const coins = Math.max(0, Math.floor(Number(r.coins) || 0));
    await prisma.rewardRule.upsert({
      where: { key: r.key },
      update: { coins, isActive: Boolean(r.isActive) },
      create: { key: r.key, coins, isActive: Boolean(r.isActive) },
    });
  }
  const value = Number(input.coinValueTk);
  if (Number.isNaN(value) || value < 0) throw validationError({ coin_value_tk: sk("errors.ops.coinValueInvalid") });
  const minRedeem = Math.max(0, Math.floor(Number(input.minRedeemCoins) || 0));
  await setSetting(REWARD_SETTING_KEYS.coinValueTk, value.toFixed(2), actorId);
  await setSetting(REWARD_SETTING_KEYS.minRedeemCoins, String(minRedeem), actorId);
}

/** PHASE G — is the reward programme currently switched on? */
export async function rewardProgramActive(): Promise<boolean> {
  return (await getSetting(REWARD_SETTING_KEYS.programActive) ?? DEFAULT_PROGRAM_ACTIVE) === "true";
}

/**
 * PHASE G — activate / deactivate the whole reward programme. SUPER ADMIN ONLY.
 * Repeating the current state is a CONFLICT (409) rather than a silent no-op, so
 * a double-submit can never be mistaken for a real transition. Deactivating stops
 * FUTURE earning and redemption only — the ledger and every historical entry are
 * untouched and still readable, so balances survive a pause.
 */
export async function setRewardProgramActive(user: User, active: boolean) {
  if (user.role !== "super_admin") throw forbidden(sk("errors.rewards.forbidden"));
  const current = await rewardProgramActive();
  if (current === active) throw conflict(sk("errors.rewards.alreadyInState"));
  await setSetting(REWARD_SETTING_KEYS.programActive, active ? "true" : "false", user.id);
  return { programActive: active };
}

/** Coin balance = signed sum of the ledger. */
export async function coinBalance(userId: number): Promise<number> {
  const agg = await prisma.rewardLedger.aggregate({ where: { userId }, _sum: { coins: true } });
  return agg._sum.coins ?? 0;
}

/**
 * Award coins for a rule — idempotent via the (userId, reason, dedupeKey)
 * unique constraint. Returns coins awarded (0 if duplicate/inactive/zero).
 */
export async function awardCoins(userId: number, ruleKey: RewardRuleKey, dedupeKey: string): Promise<number> {
  // PHASE G — no new points while the programme is paused.
  if (!(await rewardProgramActive())) return 0;
  const rule = await prisma.rewardRule.findUnique({ where: { key: ruleKey } });
  if (!rule || !rule.isActive || rule.coins <= 0) return 0;
  try {
    await prisma.rewardLedger.create({
      data: { userId, coins: rule.coins, reason: ruleKey, dedupeKey },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return 0;
    throw err;
  }
  await createNotification(userId, {
    type: "system",
    titleKey: "notifications.reward.earned.title",
    bodyKey: "notifications.reward.earned.body",
    params: { coins: rule.coins },
    link: "/customer/rewards",
  });
  return rule.coins;
}

/** Daily-login award (dedupe on today's date). */
export function awardDailyLogin(userId: number): Promise<number> {
  return awardCoins(userId, "daily_login", new Date().toISOString().slice(0, 10));
}

/** Profile-complete award — fires once when the profile has all core fields. */
export async function maybeAwardProfileComplete(user: User): Promise<number> {
  const complete = Boolean(
    user.firstName && user.phone && user.address && user.dateOfBirth && user.gender,
  );
  if (!complete) return 0;
  return awardCoins(user.id, "profile_complete", "once");
}

/** Redeem coins per the configured rules (min amount, positive balance). */
export async function redeemCoins(userId: number, coins: number) {
  const amount = Math.floor(Number(coins) || 0);
  const { minRedeemCoins, coinValueTk, programActive } = await rewardConfig();
  // PHASE G — redemption is blocked while paused; the balance itself is kept.
  if (!programActive) throw validationError({ coins: sk("errors.rewards.paused") });
  if (amount <= 0) throw validationError({ coins: sk("errors.ops.coinAmountInvalid") });
  if (amount < minRedeemCoins) {
    throw validationError({ coins: sk("errors.ops.coinMinRedeem", { min: minRedeemCoins }) });
  }
  const balance = await coinBalance(userId);
  if (amount > balance) {
    throw validationError({ coins: sk("errors.ops.coinInsufficient", { balance }) });
  }
  const entry = await prisma.rewardLedger.create({
    data: {
      userId,
      coins: -amount,
      reason: "redeem",
      dedupeKey: `redeem:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
    },
  });
  const tk = (amount * Number(coinValueTk)).toFixed(2);
  await createNotification(userId, {
    type: "system",
    titleKey: "notifications.reward.redeemed.title",
    bodyKey: "notifications.reward.redeemed.body",
    params: { coins: amount, tk },
    link: "/customer/rewards",
  });
  return { entry, tkValue: tk };
}
