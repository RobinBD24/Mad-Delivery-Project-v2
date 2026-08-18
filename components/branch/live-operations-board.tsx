"use client";

import { Badge } from "@/components/ui/badge";
import { useLiveData } from "@/lib/hooks/use-live-data";
import { useTranslation } from "@/lib/i18n/use-translation";

/**
 * PHASE I/D — the Branch Manager's live operational board.
 *
 * Every tile is a real count for the manager's own branch, refreshed every
 * 2 seconds by swapping the JSON in place. Nothing here reloads the page, so
 * the manager can be halfway through a form elsewhere on screen and the numbers
 * still move. When the branch is missing or archived the board says so instead
 * of rendering zeros as if the outlet were merely quiet.
 */

interface Snapshot {
  branch: { id: number; name: string; is_active: boolean; is_archived: boolean } | null;
  orders: Record<string, number>;
  orders_total: number;
  rider_assigned: number;
  riders: { total: number; online: number };
  staff: { active: number; quit: number };
  attendance: Record<string, number>;
  delivery_areas: { total: number; held: number; inactive: number };
  payments: { pending_verification: number };
  notifications: { unread: number };
  generated_at: string;
}

const ORDER_TILES = ["pending", "accepted", "preparing", "ready", "picked_up", "on_the_way", "delivered"] as const;

function Tile({ label, value, testid, tone }: { label: string; value: number; testid: string; tone?: "warn" }) {
  return (
    <div
      className={`rounded-xl border p-3 ${tone === "warn" && value > 0 ? "border-amber-300 bg-amber-50 dark:bg-amber-500/10" : "border-border-strong"}`}
      data-testid={testid}
    >
      <p className="text-xs text-fg-subtle">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-fg-base" data-testid={`${testid}-value`}>
        {value}
      </p>
    </div>
  );
}

export function LiveOperationsBoard({ pollMs = 2000 }: { pollMs?: number }) {
  const { t } = useTranslation();
  const { data, error } = useLiveData<Snapshot>("/api/dashboard/branch-manager/live", pollMs);

  if (!data) {
    // A first load that FAILED must say so and offer a way forward. Showing
    // "loading" for ever would leave the manager waiting on a board that is
    // never going to arrive.
    if (error) {
      return (
        <p className="text-sm text-amber-600" data-testid="live-board-error">
          {t("bmLive.stale")}
        </p>
      );
    }
    return (
      <p className="text-sm text-fg-muted" data-testid="live-board-loading">
        {t("common.loading")}
      </p>
    );
  }

  if (!data.branch) {
    return (
      <p className="rounded-xl border border-border-base px-3 py-6 text-center text-sm text-fg-muted" data-testid="live-board-no-branch">
        {t("bmLive.noBranch")}
      </p>
    );
  }

  return (
    <div className="space-y-4" data-testid="live-board">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-fg-base">{data.branch.name}</span>
        {data.branch.is_archived ? (
          <span data-testid="live-branch-archived"><Badge tone="red">{t("bmLive.branchArchived")}</Badge></span>
        ) : data.branch.is_active ? (
          <span data-testid="live-branch-active"><Badge tone="green">{t("common.active")}</Badge></span>
        ) : (
          <span data-testid="live-branch-inactive"><Badge tone="amber">{t("common.inactive")}</Badge></span>
        )}
        {/* A stale board must announce itself rather than quietly lying. */}
        {error ? (
          <span data-testid="live-board-stale" className="text-xs text-amber-600">
            {t("bmLive.stale")}
          </span>
        ) : null}
      </div>

      <div>
        <h3 className="mb-2 text-sm font-medium text-fg-base">{t("bmLive.ordersToday")}</h3>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
          {ORDER_TILES.map((status) => (
            <Tile
              key={status}
              label={t(`orderStatus.${status}`)}
              value={data.orders[status] ?? 0}
              testid={`live-orders-${status}`}
            />
          ))}
          <Tile label={t("bmLive.riderAssigned")} value={data.rider_assigned} testid="live-rider-assigned" />
        </div>
        {data.orders_total === 0 ? (
          <p className="mt-2 text-xs text-fg-subtle" data-testid="live-orders-empty">
            {t("bmLive.noOrdersToday")}
          </p>
        ) : null}
      </div>

      <div>
        <h3 className="mb-2 text-sm font-medium text-fg-base">{t("bmLive.people")}</h3>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
          <Tile label={t("bmLive.ridersOnline")} value={data.riders.online} testid="live-riders-online" />
          <Tile label={t("bmLive.ridersTotal")} value={data.riders.total} testid="live-riders-total" />
          <Tile label={t("bmLive.activeStaff")} value={data.staff.active} testid="live-staff-active" />
          <Tile label={t("bmLive.attendancePresent")} value={data.attendance.present ?? 0} testid="live-attendance-present" />
          <Tile label={t("bmLive.attendanceAbsent")} value={data.attendance.absent ?? 0} testid="live-attendance-absent" />
          <Tile label={t("bmLive.attendanceLate")} value={data.attendance.late ?? 0} testid="live-attendance-late" />
          <Tile label={t("bmLive.attendanceLeave")} value={data.attendance.leave ?? 0} testid="live-attendance-leave" />
          <Tile label={t("bmLive.attendanceHalfDay")} value={data.attendance.half_day ?? 0} testid="live-attendance-half-day" />
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-medium text-fg-base">{t("bmLive.attention")}</h3>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
          <Tile label={t("bmLive.areasHeld")} value={data.delivery_areas.held} testid="live-areas-held" tone="warn" />
          <Tile label={t("bmLive.areasInactive")} value={data.delivery_areas.inactive} testid="live-areas-inactive" tone="warn" />
          <Tile
            label={t("bmLive.pendingPayments")}
            value={data.payments.pending_verification}
            testid="live-pending-payments"
            tone="warn"
          />
          <Tile label={t("bmLive.unreadNotifications")} value={data.notifications.unread} testid="live-unread" />
        </div>
      </div>
    </div>
  );
}
