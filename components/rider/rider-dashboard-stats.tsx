import { Icon } from "@/components/layout/icons";
import { ChipRow, StatChip } from "@/components/ui/stat-chip";
import { getT } from "@/lib/i18n/server";
import type { RiderDashboard } from "@/types";

/**
 * The design's compact 5-metric strip (Today's Earnings / Today's Orders /
 * Distance Travelled / Online Time / Rating) rendered with the shared
 * .chip-row system. All values are real: commission ledger, delivered counts,
 * GPS route distance, duty clock and customer reviews — this rider's own data
 * only, never another rider's.
 */
export async function RiderDashboardStats({ data }: { data: RiderDashboard }) {
  const { t, fmt } = await getT();
  const active = data.active_orders.length;
  const hours = Math.floor(data.online_minutes / 60);
  const mins = data.online_minutes % 60;

  return (
    <ChipRow>
      <StatChip
        label={t("rider.todaysEarnings")}
        value={fmt.money(data.earnings_today)}
        icon={<Icon name="money" className="size-4.5" />}
        accent="green"
        mono
      />
      <StatChip
        label={t("rider.todaysOrders")}
        value={`${fmt.num(data.delivered_today + active)}`}
        icon={<Icon name="bag" className="size-4.5" />}
        accent="brand"
      />
      <StatChip
        label={t("rider.distanceTravelled")}
        value={`${fmt.num(data.distance_today_km)} ${t("rider.kmUnit")}`}
        icon={<Icon name="pin" className="size-4.5" />}
        accent="blue"
        mono
      />
      <StatChip
        label={t("rider.onlineTime")}
        value={`${fmt.num(hours)}${t("rider.hourShort")} ${fmt.num(mins)}${t("rider.minShort")}`}
        icon={<Icon name="clock" className="size-4.5" />}
        accent="violet"
        mono
      />
      <StatChip
        label={t("rider.rating")}
        value={data.avg_rating === null ? "—" : `${fmt.num(data.avg_rating)} ★`}
        icon={<Icon name="chart" className="size-4.5" />}
        accent="amber"
      />
    </ChipRow>
  );
}
