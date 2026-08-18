import { DashboardPage, DashboardPageHeader } from "@/components/dashboard/dashboard-page";
import { SummaryCard, SummaryCardGrid } from "@/components/dashboard/summary-card";
import { Icon } from "@/components/layout/icons";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { NotificationList } from "@/components/notifications/notification-list";
import { getJSON } from "@/lib/api/client";
import { requireApiUser } from "@/lib/auth/current-user";
import { getT } from "@/lib/i18n/server";
import { getNotificationInboxSummary } from "@/lib/services/page-summaries";
import type { Notification, Paginated } from "@/types";

/**
 * Shared notifications inbox rendered by every role's /…/notifications page.
 *
 * The summary counts the signed-in user's OWN inbox only — the same `userId`
 * scope the list endpoint applies — so no role is ever shown another user's
 * totals. It is one grouped query, not a request per card, and it counts the
 * whole inbox rather than the fetched page.
 */
export async function NotificationsView() {
  const { t, fmt } = await getT();
  const me = await requireApiUser();
  const [data, summary] = await Promise.all([
    getJSON<Paginated<Notification>>("/notifications/?page_size=100"),
    getNotificationInboxSummary(me.id),
  ]);

  return (
    <DashboardPage density="compact">
      <DashboardPageHeader title={t("notifications.title")} subtitle={t("notifications.subtitle")} />

      <SummaryCardGrid>
        <SummaryCard
          title={t("common.total")}
          value={fmt.num(summary.total)}
          icon={<Icon name="bell" />}
        />
        <SummaryCard
          title={t("notifications.filterUnread")}
          value={fmt.num(summary.unread)}
          icon={<Icon name="bell" />}
          accent={summary.unread > 0 ? "warning" : "neutral"}
        />
        <SummaryCard
          title={t("notifications.filterRead")}
          value={fmt.num(summary.read)}
          icon={<Icon name="check" />}
          accent="success"
        />
      </SummaryCardGrid>

      <Card>
        <CardContent>
          {data.results.length === 0 ? (
            <EmptyState
              title={t("notifications.emptyTitle")}
              description={t("notifications.emptyDesc")}
            />
          ) : (
            <NotificationList items={data.results} />
          )}
        </CardContent>
      </Card>
    </DashboardPage>
  );
}
