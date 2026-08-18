import type { Metadata } from "next";

import { OrderStatusBadge } from "@/components/ui/badge";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, Td } from "@/components/ui/table";
import { getJSON } from "@/lib/api/client";
import { ORDER_STATUS_LABELS } from "@/lib/constants";
import { requireRole } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import type { Order, OrderStatus, Paginated } from "@/types";
import { FIELD_CLASS, SELECT_EXTRA_CLASS } from "@/components/ui/field-class";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("pages.transactionsTitle") };
}

type Params = {
  searchParams: Promise<{ status?: string; method?: string; from?: string; to?: string; q?: string }>;
};

/** /accounts/transactions — filterable order-payment ledger. */
export default async function AccountsTransactionsPage({ searchParams }: Params) {
  const { t, fmt } = await getT();
  await requireRole("accounts", "super_admin");
  const sp = await searchParams;

  const query = new URLSearchParams({ page_size: "100" });
  for (const key of ["status", "method", "from", "to", "q"] as const) {
    if (sp[key]) query.set(key, sp[key]!);
  }
  const data = await getJSON<Paginated<Order>>(`/accounts/transactions/?${query}`);

  const field = FIELD_CLASS;
  const selectField = `${FIELD_CLASS} ${SELECT_EXTRA_CLASS}`;

  return (
    <>
      <PageHeader title={t("pages.transactionsTitle")} subtitle={t("pages.transactionsSub")} />

      {/* GET filter bar — server-rendered, no JS needed. Every control is an
          optional filter with no constraint to validate, so the only part of
          the form standard that applies is suppressing the browser's bubbles. */}
      <form method="GET" noValidate className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-border-base bg-surface-card p-4 shadow-card">
        <label className="flex flex-col gap-1 text-xs font-medium text-fg-muted">
          {t("wallet.filterOrderId")}
          <input name="q" defaultValue={sp.q ?? ""} className={field} placeholder="#" inputMode="numeric" />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-fg-muted">
          {t("pages.colStatus")}
          <select name="status" defaultValue={sp.status ?? ""} className={selectField}>
            <option value="">{t("complaints.filterAll")}</option>
            {(Object.keys(ORDER_STATUS_LABELS) as OrderStatus[]).map((s) => (
              <option key={s} value={s}>
                {t(`orderStatus.${s}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-fg-muted">
          {t("pages.colMethod")}
          <select name="method" defaultValue={sp.method ?? ""} className={selectField}>
            <option value="">{t("complaints.filterAll")}</option>
            <option value="cash">{t("payment.cash")}</option>
            <option value="bkash">{t("payment.bkash")}</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-fg-muted">
          {t("wallet.filterFrom")}
          <input type="date" name="from" defaultValue={sp.from ?? ""} className={field} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-fg-muted">
          {t("wallet.filterTo")}
          <input type="date" name="to" defaultValue={sp.to ?? ""} className={field} />
        </label>
        <button
          type="submit"
          className="h-9 rounded-xl bg-brand-500 px-4 text-sm font-semibold text-white hover:bg-brand-600"
        >
          {t("wallet.applyFilters")}
        </button>
      </form>

      <Card>
        {data.results.length === 0 ? (
          <EmptyState title={t("pages.noData")} />
        ) : (
          <Table
            headers={["#", t("pages.colDate"), t("pages.colBranch"), t("pages.colMethod"), t("pages.colStatus"), t("pages.colAmount")]}
          >
            {data.results.map((o) => (
              <tr key={o.id} className="hover:bg-surface-hover/70">
                <Td><span className="font-semibold text-fg-base">#{fmt.num(o.id)}</span></Td>
                <Td><span className="text-xs text-fg-muted">{fmt.dateTime(o.created_at)}</span></Td>
                <Td>{o.branch_name}</Td>
                <Td>{t(`payment.${o.payment_method}`)}</Td>
                <Td><OrderStatusBadge status={o.status} /></Td>
                <Td><span className="font-semibold">{fmt.money(o.total_amount)}</span></Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
