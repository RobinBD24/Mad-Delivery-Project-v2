import type { Metadata } from "next";

import { SummaryCard, SummaryCardGrid } from "@/components/dashboard/summary-card";
import { PageHeader } from "@/components/layout/page-header";
import { Icon } from "@/components/layout/icons";
import { UsersExplorer } from "@/components/dashboard/users/users-explorer";
import { ButtonLink } from "@/components/ui/button";
import { getJSON } from "@/lib/api/client";
import { requireRole } from "@/lib/auth/session";
import { ROLES, USER_LIST_STATUS_FILTERS } from "@/lib/constants/enums";
import { getT } from "@/lib/i18n/server";
import { getAdminUserListSummary } from "@/lib/services/page-summaries";
import type { Paginated, User } from "@/types";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("users.allUsers") };
}

/**
 * Super Admin user list. The server renders the first result set from the
 * current URL (so refresh/shared links show data immediately); UsersExplorer
 * then takes over with client-side search/filter/pagination.
 */
export default async function AllUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string; status?: string; search?: string; page?: string }>;
}) {
  const me = await requireRole("super_admin");
  const { t } = await getT();
  const params = await searchParams;

  const query = new URLSearchParams();
  const search = (params.search ?? "").trim();
  if (search) query.set("search", search);
  if (params.role && (ROLES as string[]).includes(params.role)) query.set("role", params.role);
  if (params.status && (USER_LIST_STATUS_FILTERS as readonly string[]).includes(params.status)) {
    query.set("status", params.status);
  }
  const page = Math.max(1, Number(params.page ?? "1") || 1);
  if (page > 1) query.set("page", String(page));

  const qs = query.toString();
  const [data, summary] = await Promise.all([
    getJSON<Paginated<User>>(`/auth/users/${qs ? `?${qs}` : ""}`),
    getAdminUserListSummary(me.id),
  ]);

  return (
    <>
      <PageHeader
        title={t("users.allUsers")}
        subtitle={t("users.allUsersSubtitle")}
        action={<ButtonLink href="/admin/users/create">+ {t("users.newUser")}</ButtonLink>}
      />
      <SummaryCardGrid className="mb-5">
        <SummaryCard
          title={t("superAdmin.totalUsers")}
          value={summary.total}
          icon={<Icon name="users" />}
          href="/admin/users"
          testId="users-total-card"
        />
        <SummaryCard
          title={t("superAdmin.approved")}
          value={summary.approved}
          icon={<Icon name="check" />}
          accent="success"
          href="/admin/users?status=approved"
        />
        <SummaryCard
          title={t("superAdmin.pending")}
          value={summary.pending}
          icon={<Icon name="clock" />}
          accent="warning"
          href="/admin/users?status=pending"
        />
        <SummaryCard
          title={t("users.statusBlocked")}
          value={summary.blocked}
          icon={<Icon name="lock" />}
          accent="danger"
          href="/admin/users?status=blocked"
        />
      </SummaryCardGrid>
      <UsersExplorer initial={data} initialQuery={qs} />
    </>
  );
}
