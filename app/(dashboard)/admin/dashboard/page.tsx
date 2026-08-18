import type { Metadata } from "next";
import Link from "next/link";

import { WeeklySalesChart } from "@/components/dashboard/bar-chart";
import { DonutChart } from "@/components/dashboard/donut-chart";
import { ApproveRejectButtons } from "@/components/dashboard/approve-reject-buttons";
import { Icon } from "@/components/layout/icons";
import { PageHeader } from "@/components/layout/page-header";
import { OrderTable } from "@/components/orders/order-table";
import { Badge, RoleBadge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardContent, CardHeader, PeriodPill, ViewAllLink } from "@/components/ui/card";
import { RankedList } from "@/components/dashboard/ranked-list";
import { EmptyState } from "@/components/ui/empty-state";
import { StatCard } from "@/components/ui/stat-card";
import { ChipRow, StatChip } from "@/components/ui/stat-chip";
import { Table, Td } from "@/components/ui/table";
import { requireRole } from "@/lib/auth/session";
import { ROLE_LABELS } from "@/lib/constants";
import { getT } from "@/lib/i18n/server";
import { superAdminDashboard } from "@/lib/services/dashboards";
import type { Role, SuperAdminDashboard } from "@/types";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("superAdmin.title") };
}

const QUICK_ACTIONS = [
  { href: "/admin/users/create", label: "nav.createUser", icon: "plus" },
  { href: "/admin/users", label: "nav.userManagement", icon: "users" },
  { href: "/admin/branches/create", label: "nav.newBranch", icon: "store" },
  { href: "/admin/branches", label: "nav.branchManagement", icon: "grid" },
  { href: "/admin/branch-manager-history", label: "nav.managerHistory", icon: "history" },
  { href: "/admin/activity-logs", label: "nav.activityLogs", icon: "list" },
];

export default async function SuperAdminDashboardPage() {
  const { t, fmt, locale } = await getT();
  await requireRole("super_admin");
  const data = (await superAdminDashboard()) as SuperAdminDashboard;
  const b = data.orders.status_breakdown;

  return (
    <>
      <PageHeader
        title={t("superAdmin.title")}
        subtitle={t("superAdmin.subtitle")}
        action={
          <span className="flex gap-2">
            <ButtonLink href="/admin/users/create" variant="outline">+ {t("nav.createUser")}</ButtonLink>
            <ButtonLink href="/admin/branches/create">+ {t("nav.newBranch")}</ButtonLink>
          </span>
        }
      />

      {/* ── KPI chip strip (mockup .chip-row) ─────────────────── */}
      <ChipRow>
        <StatChip label={t("superAdmin.totalUsers")} value={fmt.num(data.users.total)} icon={<Icon name="users" className="size-4.5" />} accent="blue" />
        <StatChip label={t("superAdmin.approved")} value={fmt.num(data.users.approved)} icon={<Icon name="check" className="size-4.5" />} accent="green" />
        <StatChip label={t("superAdmin.pending")} value={fmt.num(data.users.pending)} icon={<Icon name="clock" className="size-4.5" />} accent="amber" />
        <StatChip label={t("superAdmin.rejected")} value={fmt.num(data.users.rejected)} icon={<Icon name="x" className="size-4.5" />} accent="red" />
        <StatChip label={t("superAdmin.totalCustomers")} value={fmt.num(data.users.customers)} icon={<Icon name="user" className="size-4.5" />} accent="teal" />
        <StatChip label={t("superAdmin.ridersManagers")} value={`${fmt.num(data.users.riders)} / ${fmt.num(data.users.branch_managers)}`} icon={<Icon name="bike" className="size-4.5" />} accent="violet" />
        <StatChip label={t("superAdmin.totalBranches")} value={fmt.num(data.branches.total)} icon={<Icon name="store" className="size-4.5" />} accent="violet" />
        <StatChip label={t("superAdmin.activeBranches")} value={fmt.num(data.branches.active)} icon={<Icon name="store" className="size-4.5" />} accent="green" />
      </ChipRow>

      {/* ── Big KPI cards (mockup .kpi-row) ───────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={t("superAdmin.todayOrders")} value={fmt.num(data.orders.today)} icon={<Icon name="bag" />} accent="brand" />
        <StatCard label={t("superAdmin.todaySales")} value={fmt.money(data.orders.today_sales)} icon={<Icon name="money" />} accent="green" />
        <StatCard label={t("superAdmin.totalOrders")} value={fmt.num(data.orders.total)} icon={<Icon name="cart" />} accent="blue" />
        <StatCard label={t("superAdmin.totalSales")} value={fmt.money(data.orders.total_sales)} icon={<Icon name="chart" />} accent="violet" />
      </div>

      {/* ── Quick actions ─────────────────────────────────────── */}
      <Card>
        <CardHeader title={t("superAdmin.quickActions")} subtitle={t("superAdmin.quickActionsSub")} />
        <CardContent>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
            {QUICK_ACTIONS.map((a) => (
              <Link
                key={a.href}
                href={a.href}
                className="flex flex-col items-center gap-2 rounded-2xl border border-border-base bg-surface-muted px-3 py-4 text-center text-sm font-medium text-fg-base transition hover:border-brand-500/40 hover:bg-surface-hover hover:text-brand-500"
              >
                <span className="flex size-10 items-center justify-center rounded-xl bg-brand-500/15 text-brand-500">
                  <Icon name={a.icon} />
                </span>
                {t(a.label)}
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── Reports / analytics ───────────────────────────────── */}
      <div className="grid gap-4.5 xl:grid-cols-3">
        <Card>
          <CardHeader title={t("superAdmin.weeklyOrders")} subtitle={t("superAdmin.sunToSat")} action={<PeriodPill>{t("dashboard.thisWeek")}</PeriodPill>} />
          <CardContent>
            <WeeklySalesChart data={data.weekly_orders} format="count" locale={locale} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader title={t("superAdmin.weeklySales")} subtitle={t("superAdmin.deliveredOrders")} action={<PeriodPill>{t("dashboard.thisWeek")}</PeriodPill>} />
          <CardContent>
            <WeeklySalesChart data={data.weekly_sales} locale={locale} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader title={t("superAdmin.orderStatusTitle")} subtitle={t("superAdmin.totalBreakdown")} />
          <CardContent>
            <DonutChart locale={locale}
              centerLabel={t("superAdmin.totalOrders")}
              slices={[
                { label: t("superAdmin.sliceWaiting"), value: b.pending + b.accepted, color: "#f4a261" },
                { label: t("superAdmin.slicePreparing"), value: b.preparing + b.ready, color: "#8b5cf6" },
                { label: t("superAdmin.sliceDelivering"), value: b.picked_up + b.on_the_way, color: "#3b82f6" },
                { label: t("superAdmin.sliceCompleted"), value: b.delivered, color: "#2dc653" },
                { label: t("superAdmin.sliceCancelled"), value: b.cancelled, color: "#e63946" },
              ]}
            />
          </CardContent>
        </Card>
      </div>

      {/* ── Pending approvals + recent orders ─────────────────── */}
      <div className="grid gap-4.5 xl:grid-cols-2">
        <Card>
          <CardHeader
            title={t("superAdmin.pendingApprovals")}
            subtitle={t("superAdmin.pendingApprovalsSub")}
            action={<ViewAllLink href="/admin/users?status=pending">{t("common.viewAll")}</ViewAllLink>}
          />
          {data.pending_queue.length === 0 ? (
            <EmptyState
              title={t("superAdmin.noPending")}
              description={t("superAdmin.noPendingDesc")}
              action={<ButtonLink href="/admin/users" variant="outline" size="sm">{t("nav.userManagement")}</ButtonLink>}
            />
          ) : (
            <Table headers={[t("superAdmin.nameEmail"), t("common.role"), t("common.date"), t("common.actions")]}>
              {data.pending_queue.map((u) => (
                <tr key={u.id} className="hover:bg-surface-hover/70">
                  <Td>
                    <Link href={`/admin/users/${u.id}`} className="font-medium text-fg-base hover:text-brand-600">
                      {u.full_name || u.username}
                    </Link>
                    <span className="block text-xs text-fg-subtle">{u.email || u.phone}</span>
                  </Td>
                  <Td><RoleBadge role={u.role} /></Td>
                  <Td><span className="text-xs text-fg-muted">{fmt.date(u.date_joined)}</span></Td>
                  <Td><ApproveRejectButtons userId={u.id} /></Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>

        <Card>
          <CardHeader
            title={t("superAdmin.recentOrders")}
            action={<span className="text-sm text-fg-muted">{t("superAdmin.totalColon")} <b>{fmt.num(data.orders.total)}</b></span>}
          />
          {data.recent_orders.length === 0 ? (
            <EmptyState title={t("superAdmin.noOrders")} description={t("superAdmin.noOrdersDesc")} />
          ) : (
            <OrderTable orders={data.recent_orders} hrefBase="/admin/orders" showBranch />
          )}
        </Card>
      </div>

      {/* ── Branch overview ───────────────────────────────────── */}
      <Card>
        <CardHeader
          title={t("superAdmin.branchOverview")}
          subtitle={t("superAdmin.branchOverviewSub")}
          action={<ViewAllLink href="/admin/branches">{t("superAdmin.allBranches")}</ViewAllLink>}
        />
        {data.branch_overview.length === 0 ? (
          <EmptyState
            title={t("superAdmin.noBranches")}
            description={t("superAdmin.noBranchesDesc")}
            action={<ButtonLink href="/admin/branches/create" size="sm">{t("nav.newBranch")}</ButtonLink>}
          />
        ) : (
          <Table headers={[t("superAdmin.branchCol"), t("superAdmin.manager"), t("common.status"), t("superAdmin.todayOrders"), t("superAdmin.todaySales"), t("superAdmin.riders"), ""]}>
            {data.branch_overview.map((br) => (
              <tr key={br.id} className="hover:bg-surface-hover/70">
                <Td><span className="font-medium text-fg-base">{br.name}</span></Td>
                <Td><span className="text-sm text-fg-muted">{br.manager_name ?? t("common.notAssigned")}</span></Td>
                <Td>
                  <Badge tone={br.is_active ? "green" : "slate"}>
                    {br.is_active ? t("common.active") : t("common.inactive")}
                  </Badge>
                </Td>
                <Td mono>{fmt.num(br.today_orders)}</Td>
                <Td mono><span className="font-semibold">{fmt.money(br.today_sales)}</span></Td>
                <Td mono>{fmt.num(br.riders)}</Td>
                <Td>
                  <Link href={`/admin/branches/${br.id}`} className="text-xs font-semibold text-brand-500 hover:text-brand-400">
                    {t("superAdmin.viewArrow")}
                  </Link>
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      {/* ── User overview by role + recent activity ───────────── */}
      <div className="grid gap-4.5 xl:grid-cols-2">
        <Card>
          <CardHeader
            title={t("superAdmin.usersByRole")}
            subtitle={t("superAdmin.usersByRoleSub")}
            action={<ViewAllLink href="/admin/users">{t("common.viewAll")}</ViewAllLink>}
          />
          <CardContent>
            <RankedList
              emptyTitle={t("superAdmin.noPending")}
              items={(Object.keys(ROLE_LABELS) as Role[])
                .map((r) => ({ role: r, count: data.users.by_role[r] ?? 0 }))
                .sort((a, b) => b.count - a.count)
                .map(({ role: r, count }) => ({
                  key: r,
                  title: t(`roles.${r}`),
                  value: fmt.num(count),
                  visual: <Icon name="users" className="size-4" />,
                  href: `/admin/users?role=${r}`,
                }))}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader
            title={t("superAdmin.recentActivity")}
            subtitle={t("superAdmin.recentActivitySub")}
            action={<ViewAllLink href="/admin/activity-logs">{t("common.viewAll")}</ViewAllLink>}
          />
          {data.recent_activity.length === 0 ? (
            <EmptyState title={t("superAdmin.noActivity")} />
          ) : (
            <CardContent className="space-y-2.5">
              {data.recent_activity.map((log) => (
                <div key={log.id} className="flex items-start gap-3">
                  <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-surface-muted text-fg-muted">
                    <Icon name={log.activity_type === "logout" ? "logout" : log.activity_type === "login" ? "user" : "list"} className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-fg-base">
                      <span className="font-medium text-fg-base">{log.manager_name || log.manager_username}</span>{" "}
                      {log.description || t("activityType." + log.activity_type)}
                    </p>
                    <p className="text-xs text-fg-subtle">
                      {log.branch_name ? `${log.branch_name} · ` : ""}{fmt.dateTime(log.timestamp)}
                    </p>
                  </div>
                </div>
              ))}
            </CardContent>
          )}
        </Card>
      </div>
    </>
  );
}
