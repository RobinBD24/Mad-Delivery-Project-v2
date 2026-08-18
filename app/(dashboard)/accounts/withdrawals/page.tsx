import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, Td } from "@/components/ui/table";
import { WithdrawalActions } from "@/components/wallet/withdrawal-actions";
import { WithdrawalStatusBadge } from "@/components/wallet/withdrawal-status-badge";
import { getJSON } from "@/lib/api/client";
import { WITHDRAWAL_STATUSES } from "@/lib/constants/enums";
import { requireRole } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { cn } from "@/lib/utils";
import type { Paginated, RiderWithdrawalT } from "@/types";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("wallet.withdrawalsTitle") };
}

type Params = { searchParams: Promise<{ status?: string }> };

/** /accounts/withdrawals — review queue: approve / reject(reason) / mark paid. */
export default async function AccountsWithdrawalsPage({ searchParams }: Params) {
  const { t, fmt } = await getT();
  await requireRole("accounts", "super_admin");
  const { status = "" } = await searchParams;

  const query = new URLSearchParams({ page_size: "100" });
  if (status) query.set("status", status);
  const data = await getJSON<Paginated<RiderWithdrawalT>>(`/accounts/withdrawals/?${query}`);

  const tab = "rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors";

  return (
    <>
      <PageHeader title={t("wallet.withdrawalsTitle")} subtitle={t("wallet.reviewSub")} />

      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        <Link
          href="/accounts/withdrawals"
          className={cn(tab, !status ? "bg-brand-50 text-brand-600" : "text-fg-muted hover:bg-surface-hover")}
        >
          {t("complaints.filterAll")}
        </Link>
        {WITHDRAWAL_STATUSES.map((s) => (
          <Link
            key={s}
            href={`/accounts/withdrawals?status=${s}`}
            className={cn(tab, status === s ? "bg-brand-50 text-brand-600" : "text-fg-muted hover:bg-surface-hover")}
          >
            {t(`withdrawalStatus.${s}`)}
          </Link>
        ))}
      </div>

      <Card>
        {data.results.length === 0 ? (
          <EmptyState title={t("wallet.noWithdrawalsTitle")} description={t("wallet.noRequestsDesc")} />
        ) : (
          <Table
            headers={[
              t("pages.colDate"),
              t("wallet.colRider"),
              t("pages.colAmount"),
              t("wallet.noteLabel"),
              t("pages.colStatus"),
              t("pages.colActions"),
            ]}
          >
            {data.results.map((w) => (
              <tr key={w.id} className="hover:bg-surface-hover/70">
                <Td><span className="text-xs text-fg-muted">{fmt.dateTime(w.created_at)}</span></Td>
                <Td>
                  <span className="font-medium text-fg-base">{w.rider_name}</span>
                  <span className="block text-xs text-fg-subtle">@{w.rider_username}</span>
                </Td>
                <Td><span className="font-semibold">{fmt.money(w.amount)}</span></Td>
                <Td><span className="text-xs text-fg-muted">{w.note || "—"}</span></Td>
                <Td>
                  <WithdrawalStatusBadge status={w.status} />
                  {w.status === "rejected" && w.rejection_reason ? (
                    <p className="mt-1 text-xs text-red-500">{w.rejection_reason}</p>
                  ) : null}
                  {w.decided_by_name ? (
                    <p className="mt-1 text-xs text-fg-subtle">{w.decided_by_name}</p>
                  ) : null}
                </Td>
                <Td className="text-right">
                  <WithdrawalActions withdrawal={w} />
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
