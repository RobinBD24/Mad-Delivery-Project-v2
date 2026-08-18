import { requireApiRole } from "@/lib/auth/current-user";
import { handle } from "@/lib/http/errors";
import { json } from "@/lib/http/respond";
import { rewardConfig, updateRewardConfig } from "@/lib/services/rewards";

// GET /api/admin/rewards — reward rules + coin value (super admin).
export const GET = handle(async () => {
  await requireApiRole("super_admin");
  const config = await rewardConfig();
  return json({
    coin_value_tk: config.coinValueTk,
    min_redeem_coins: config.minRedeemCoins,
    // PHASE G — global programme switch (paused = no new earning/redemption).
    program_active: config.programActive,
    rules: config.rules.map((r) => ({ key: r.key, coins: r.coins, is_active: r.isActive })),
  });
});

// PUT /api/admin/rewards  { coin_value_tk, min_redeem_coins, rules: [{key,coins,is_active}] }
export const PUT = handle(async (req: Request) => {
  const me = await requireApiRole("super_admin");
  const body = (await req.json().catch(() => ({}))) as {
    coin_value_tk?: string | number;
    min_redeem_coins?: string | number;
    rules?: { key: string; coins: number; is_active: boolean }[];
  };
  await updateRewardConfig(
    {
      rules: (body.rules ?? []).map((r) => ({ key: r.key, coins: r.coins, isActive: r.is_active })),
      coinValueTk: String(body.coin_value_tk ?? "0.50"),
      minRedeemCoins: Number(body.min_redeem_coins ?? 100),
    },
    me.id,
  );
  const config = await rewardConfig();
  return json({
    coin_value_tk: config.coinValueTk,
    min_redeem_coins: config.minRedeemCoins,
    // PHASE G — global programme switch (paused = no new earning/redemption).
    program_active: config.programActive,
    rules: config.rules.map((r) => ({ key: r.key, coins: r.coins, is_active: r.isActive })),
  });
});
