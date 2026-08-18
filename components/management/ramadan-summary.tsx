"use client";

import { useEffect, useState } from "react";

import { useTranslation } from "@/lib/i18n/use-translation";

interface Summary {
  reservations: Record<string, number>; total_reservations: number; total_guests: number;
  payments: Record<string, number>; total_paid: string; total_refunded: string;
}

/** Read-only Ramadan summary — all values from real DB aggregates. */
export function RamadanSummary() {
  const { t, fmt } = useTranslation();
  const [s, setS] = useState<Summary | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/ramadan/summary").then((r) => (r.ok ? r.json() : null)).then((d) => { if (active && d) setS(d); }).catch(() => {});
    return () => { active = false; };
  }, []);

  if (!s) return null;
  const tile = (label: string, value: string | number, testid?: string) => (
    <div className="rounded-xl border border-border-strong p-4" data-testid={testid}>
      <p className="text-xs uppercase tracking-wide text-fg-subtle">{label}</p>
      <p className="mt-1 text-2xl font-bold text-fg-base">{value}</p>
    </div>
  );

  return (
    <div className="space-y-6" data-testid="ramadan-summary-cards">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tile(t("ramadan.reservations"), fmt.num(s.total_reservations), "sum-reservations")}
        {tile(t("ramadan.guests"), fmt.num(s.total_guests))}
        {tile(t("ramadan.paid"), fmt.money(s.total_paid), "sum-paid")}
        {tile(t("ramadan.refund"), fmt.money(s.total_refunded))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-border-strong p-4">
          <p className="mb-2 text-sm font-semibold">{t("ramadan.reservations")}</p>
          <ul className="space-y-1 text-sm">
            {Object.entries(s.reservations).map(([k, v]) => (
              <li key={k} className="flex justify-between"><span className="text-fg-muted">{t(`ramadanStatus.${k}`)}</span><b>{fmt.num(v)}</b></li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl border border-border-strong p-4">
          <p className="mb-2 text-sm font-semibold">{t("ramadan.paymentStatus")}</p>
          <ul className="space-y-1 text-sm">
            {Object.entries(s.payments).map(([k, v]) => (
              <li key={k} className="flex justify-between"><span className="text-fg-muted">{k}</span><b>{fmt.num(v)}</b></li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
