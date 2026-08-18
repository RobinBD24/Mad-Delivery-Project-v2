"use client";

import { useCallback, useEffect, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
import { Field, Input, Select } from "@/components/ui/input";
import { useTranslation } from "@/lib/i18n/use-translation";
import { parseFieldErrors } from "@/lib/validation/contract";
import { money, positive, required } from "@/lib/validation/rules";

interface Txn {
  id: number; reservation_id: number; branch_name: string; customer_name: string; booking_date: string;
  amount: string; paid_amount: string; refunded_amount: string; status: string;
}
const STATUSES = ["unpaid", "pending", "paid", "failed", "refunded"] as const;
const TONE: Record<string, "amber" | "green" | "red" | "blue" | "slate"> = { unpaid: "slate", pending: "amber", paid: "green", failed: "red", refunded: "blue" };

export function RamadanTransactionsPanel({ canRefund }: { canRefund: boolean }) {
  const { t, fmt } = useTranslation();
  const [rows, setRows] = useState<Txn[]>([]);
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [error, setError] = useState<string | null>(null);
  /** Inline refund editor (replaces the old browser prompt, which could not be
   * validated and showed no message under the field). */
  const [refundingId, setRefundingId] = useState<number | null>(null);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundError, setRefundError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const qs = new URLSearchParams();
    if (status) qs.set("status", status);
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    const d = await (await fetch(`/api/ramadan/transactions?${qs}`)).json();
    setRows(d.results ?? []);
  }, [status, from, to]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  function openRefund(row: Txn) {
    const refundable = Number(row.paid_amount) - Number(row.refunded_amount);
    setRefundingId(refundingId === row.id ? null : row.id);
    setRefundAmount(refundable.toFixed(2));
    setRefundError(null);
    setError(null);
  }

  async function submitRefund(row: Txn) {
    const refundable = Number(row.paid_amount) - Number(row.refunded_amount);
    // Client validation FIRST — money shape, positive, and within the amount
    // that is actually refundable. The server re-checks all three.
    const problem =
      required(refundAmount, {}) ?? money(refundAmount, {}) ?? positive(refundAmount, {});
    if (problem) {
      setRefundError(t(problem.key, problem.vars));
      return;
    }
    if (Number(refundAmount) > refundable) {
      setRefundError(t("financials.errRefundExceeds", { amount: refundable.toFixed(2) }));
      return;
    }
    setRefundError(null);
    setError(null);

    const res = await fetch(`/api/ramadan/reservations/${row.reservation_id}/refund`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: Number(refundAmount) }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      const { fieldErrors, formError } = parseFieldErrors(data, t("errors.generic"));
      setRefundError(fieldErrors.amount ?? null);
      setError(fieldErrors.amount ? null : formError);
      return; // the typed amount is kept so it can be corrected
    }
    setRefundingId(null);
    setRefundAmount("");
    load();
  }

  return (
    <div className="space-y-4">
      <Alert tone="error" message={error} />
      <div className="flex flex-wrap items-end gap-3">
        <Field label={t("common.status")}>
          <Select value={status} onChange={(e) => setStatus(e.target.value)} data-testid="txn-status-filter">
            <option value="">{t("common.all")}</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
        </Field>
        <Field label={t("b6.date")}><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label={t("b6.date")}><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
      </div>
      <div className="overflow-x-auto rounded-xl border border-border-strong">
        <table className="w-full text-sm" data-testid="ramadan-txns">
          <thead className="text-left text-xs text-fg-muted"><tr><th className="px-2 py-1">{t("ramadan.selectBranch")}</th><th className="px-2 py-1">{t("b5.employee")}</th><th className="px-2 py-1">{t("ramadan.advanceRequired")}</th><th className="px-2 py-1">{t("ramadan.paid")}</th><th className="px-2 py-1">{t("ramadan.refund")}</th><th className="px-2 py-1">{t("common.status")}</th>{canRefund ? <th className="px-2 py-1 text-right">{t("common.actions")}</th> : null}</tr></thead>
          <tbody className="divide-y divide-border-base">
            {rows.length === 0 ? <tr><td colSpan={canRefund ? 7 : 6} className="px-2 py-4 text-center text-fg-muted">{t("pages.noData")}</td></tr> : rows.map((r) => (
              <tr key={r.id} data-testid="txn-row">
                <td className="px-2 py-1">{r.branch_name}</td>
                <td className="px-2 py-1">{r.customer_name}</td>
                <td className="px-2 py-1">{fmt.money(r.amount)}</td>
                <td className="px-2 py-1">{fmt.money(r.paid_amount)}</td>
                <td className="px-2 py-1">{fmt.money(r.refunded_amount)}</td>
                <td className="px-2 py-1"><Badge tone={TONE[r.status] ?? "slate"}>{r.status}</Badge></td>
                {canRefund ? (
                  <td className="px-2 py-1 text-right">
                    {r.status === "paid" && Number(r.paid_amount) > Number(r.refunded_amount) ? (
                      <span className="flex flex-col items-end gap-1.5">
                        <button type="button" className="text-brand-600 hover:underline" data-testid="txn-refund" onClick={() => openRefund(r)}>
                          {t("ramadan.refund")}
                        </button>
                        {refundingId === r.id ? (
                          <form
                            noValidate
                            className="flex flex-col items-end gap-1"
                            onSubmit={(ev) => {
                              ev.preventDefault();
                              void submitRefund(r);
                            }}
                          >
                            <span className="flex items-center gap-2">
                              <Input
                                name="amount"
                                className="w-32"
                                inputMode="decimal"
                                aria-label={t("wallet.amountLabel")}
                                aria-invalid={Boolean(refundError)}
                                aria-describedby={refundError ? `txn-refund-${r.id}-error` : undefined}
                                value={refundAmount}
                                onChange={(ev) => {
                                  setRefundAmount(ev.target.value);
                                  if (refundError) setRefundError(null);
                                }}
                                data-testid="txn-refund-amount"
                              />
                              <Button type="submit" size="sm">{t("ramadan.refund")}</Button>
                            </span>
                            <FieldError id={`txn-refund-${r.id}-error`} message={refundError} />
                          </form>
                        ) : null}
                      </span>
                    ) : null}
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
