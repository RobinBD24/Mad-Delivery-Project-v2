import { requireApiRole } from "@/lib/auth/current-user";
import { handle } from "@/lib/http/errors";
import { json } from "@/lib/http/respond";
import { prisma } from "@/lib/db";
import { awardDailyLogin, coinBalance, redeemCoins, rewardConfig } from "@/lib/services/rewards";

// GET /api/customer/rewards — balance + rules + own ledger. Visiting the
// rewards hub also counts as the daily-login activity (idempotent per day).
export const GET = handle(async () => {
  const me = await requireApiRole("customer");
  await awardDailyLogin(me.id);

  const [config, balance, ledger] = await Promise.all([
    rewardConfig(),
    coinBalance(me.id),
    prisma.rewardLedger.findMany({
      where: { userId: me.id },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);

  return json({
    balance,
    balance_tk: (balance * Number(config.coinValueTk)).toFixed(2),
    coin_value_tk: config.coinValueTk,
    min_redeem_coins: config.minRedeemCoins,
    // PHASE G — customers are told plainly when rewards are paused.
    program_active: config.programActive,
    rules: config.rules.map((r) => ({ key: r.key, coins: r.coins, is_active: r.isActive })),
    ledger: ledger.map((l) => ({
      id: l.id,
      coins: l.coins,
      reason: l.reason,
      created_at: l.createdAt.toISOString(),
    })),
  });
});

// POST /api/customer/rewards  { coins } — redeem against own balance.
export const POST = handle(async (req: Request) => {
  const me = await requireApiRole("customer");
  const body = (await req.json().catch(() => ({}))) as { coins?: number | string };
  const { tkValue } = await redeemCoins(me.id, Number(body.coins ?? 0));
  const balance = await coinBalance(me.id);
  return json({ ok: true, redeemed_tk: tkValue, balance });
});
