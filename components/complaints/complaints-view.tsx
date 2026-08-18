import Link from "next/link";

import { DashboardPage, DashboardPageHeader } from "@/components/dashboard/dashboard-page";
import { SummaryCard, SummaryCardGrid } from "@/components/dashboard/summary-card";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/layout/icons";
import { ComplaintStatusBadge } from "@/components/complaints/complaint-status-badge";
import { getJSON } from "@/lib/api/client";
import { requireApiUser } from "@/lib/auth/current-user";
import { COMPLAINT_STATUSES } from "@/lib/constants/enums";
import { getT } from "@/lib/i18n/server";
import { complaintsWhereForUser } from "@/lib/services/complaints";
import { getComplaintListSummary } from "@/lib/services/page-summaries";
import { cn } from "@/lib/utils";
import type { Complaint, ComplaintStatus, Paginated, Role } from "@/types";

const RECIPIENT_ROLES: Role[] = ["super_admin", "branch_manager", "accounts", "management", "marketing"];

/** Shared complaints list rendered by every role's /…/complaints page. */
export async function ComplaintsView({
  role,
  basePath,
  searchParams,
}: {
  role: Role;
  basePath: string;
  searchParams: { status?: string; box?: string };
}) {
  const { t, fmt } = await getT();
  const status = searchParams.status ?? "";
  const box = searchParams.box ?? "";
  const canReceive = RECIPIENT_ROLES.includes(role);

  const query = new URLSearchParams({ page_size: "100" });
  if (status) query.set("status", status);
  if (box) query.set("box", box);
  // The summary reuses the caller's OWN visibility clause, so it can never
  // aggregate complaints the signed-in role is not allowed to list, and it
  // counts every match rather than only the fetched page.
  const me = await requireApiUser();
  const [data, summary] = await Promise.all([
    getJSON<Paginated<Complaint>>(`/complaints/?${query.toString()}`),
    complaintsWhereForUser(me).then(getComplaintListSummary),
  ]);

  const boxHref = (b: string) => {
    const q = new URLSearchParams();
    if (b) q.set("box", b);
    if (status) q.set("status", status);
    const s = q.toString();
    return s ? `${basePath}?${s}` : basePath;
  };
  const statusHref = (s: string) => {
    const q = new URLSearchParams();
    if (box) q.set("box", box);
    if (s) q.set("status", s);
    const str = q.toString();
    return str ? `${basePath}?${str}` : basePath;
  };

  const tab = "rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors";

  return (
    <DashboardPage density="compact">
      <DashboardPageHeader
        title={t("complaints.title")}
        subtitle={t("complaints.subtitle")}
        actions={
          <ButtonLink href="/complaints/new">
            <Icon name="plus" className="size-4" /> {t("complaints.new")}
          </ButtonLink>
        }
      />

      {/* Each status card links to the SAME `?status=` filter the tabs below
          use, so a card click is an ordinary navigation: Back/Forward work and
          the state stays in the URL. */}
      <SummaryCardGrid>
        <SummaryCard
          title={t("common.total")}
          value={fmt.num(summary.total)}
          icon={<Icon name="inbox" />}
          href={statusHref("")}
        />
        <SummaryCard
          title={t("complaintStatus.pending")}
          value={fmt.num(summary.pending)}
          icon={<Icon name="clock" />}
          accent="warning"
          href={statusHref("pending")}
        />
        <SummaryCard
          title={t("complaintStatus.in_progress")}
          value={fmt.num(summary.inProgress)}
          icon={<Icon name="bolt" />}
          accent="info"
          href={statusHref("in_progress")}
        />
        <SummaryCard
          title={t("complaintStatus.resolved")}
          value={fmt.num(summary.resolved)}
          icon={<Icon name="check" />}
          accent="success"
          href={statusHref("resolved")}
        />
        <SummaryCard
          title={t("complaintStatus.closed")}
          value={fmt.num(summary.closed)}
          icon={<Icon name="history" />}
          accent="neutral"
          href={statusHref("closed")}
        />
      </SummaryCardGrid>

      <div className="flex flex-wrap items-center gap-2">
        {canReceive ? (
          <div className="flex items-center gap-1.5 rounded-full bg-surface-muted p-1">
            {[
              { key: "", label: t("complaints.boxAll") },
              { key: "inbox", label: t("complaints.boxInbox") },
              { key: "sent", label: t("complaints.boxSent") },
            ].map((b) => (
              <Link
                key={b.key}
                href={boxHref(b.key)}
                className={cn(tab, box === b.key ? "bg-surface-card text-brand-600 shadow-sm" : "text-fg-muted")}
              >
                {b.label}
              </Link>
            ))}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-1.5">
          <Link
            href={statusHref("")}
            className={cn(tab, !status ? "bg-brand-50 text-brand-600" : "text-fg-muted hover:bg-surface-hover")}
          >
            {t("complaints.filterAll")}
          </Link>
          {COMPLAINT_STATUSES.map((s) => (
            <Link
              key={s}
              href={statusHref(s)}
              className={cn(tab, status === s ? "bg-brand-50 text-brand-600" : "text-fg-muted hover:bg-surface-hover")}
            >
              {t(`complaintStatus.${s}`)}
            </Link>
          ))}
        </div>
      </div>

      {data.results.length === 0 ? (
        <Card>
          {/* "Nothing matched this filter" is a different situation from "you
              have no complaints at all" — the first needs a way back, the
              second needs a way to start. */}
          {status || box ? (
            <EmptyState
              title={t("states.noResultsTitle")}
              description={t("states.noResultsDesc")}
              action={
                <ButtonLink href={basePath} size="sm" variant="outline">
                  {t("complaints.filterAll")}
                </ButtonLink>
              }
            />
          ) : (
            <EmptyState
              title={t("complaints.emptyTitle")}
              description={t("complaints.emptyDesc")}
              action={
                <ButtonLink href="/complaints/new" size="sm">
                  {t("complaints.new")}
                </ButtonLink>
              }
            />
          )}
        </Card>
      ) : (
        <ul className="space-y-2.5">
          {data.results.map((c) => (
            <li key={c.id}>
              <Link href={`/complaints/${c.id}`} className="block">
                <Card className="transition-shadow hover:shadow-md">
                  <CardContent className="flex items-start gap-4">
                    <span className="mt-0.5 flex size-10 items-center justify-center rounded-xl bg-surface-muted text-fg-muted">
                      <Icon name="inbox" className="size-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate font-semibold text-fg-base">{c.subject}</p>
                        <ComplaintStatusBadge status={c.status as ComplaintStatus} />
                      </div>
                      <p className="mt-0.5 line-clamp-1 text-sm text-fg-muted">{c.message}</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-subtle">
                        <span>#{fmt.num(c.id)}</span>
                        <span>
                          {t("complaints.toLabel")}: {t(`roles.${c.recipient_role}`)}
                        </span>
                        <span>{t(`complaintCategory.${c.category}`)}</span>
                        {c.branch_name ? <span>{c.branch_name}</span> : null}
                        <span>{fmt.dateTime(c.created_at)}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </DashboardPage>
  );
}
