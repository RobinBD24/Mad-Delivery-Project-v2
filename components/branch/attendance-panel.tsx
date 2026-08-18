"use client";

import { useCallback, useEffect, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { FieldError } from "@/components/ui/field-error";
import { Field, Input, Select } from "@/components/ui/input";
import { useTranslation } from "@/lib/i18n/use-translation";
import { parseFieldErrors, type FieldErrors } from "@/lib/validation/contract";
import { date as dateRule, notFuture, oneOf } from "@/lib/validation/rules";

const STATUSES = ["present", "absent", "late", "leave", "half_day"] as const;
const ROLES = ["kitchen", "chef", "waiter", "cashier", "delivery", "cleaner", "security", "supervisor", "others"] as const;

interface Employee { id: number; name: string; employee_code: string; role: string; is_active: boolean }
interface Att { employee: number; status: string; date: string }
interface Summary { present: number; absent: number; late: number; leave: number; half_day: number; total: number }

/** Today's date as YYYY-MM-DD in local time (no Date.now string parsing issues). */
function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function AttendancePanel() {
  const { t } = useTranslation();
  const [date, setDate] = useState(todayStr());
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [byEmployee, setByEmployee] = useState<Record<number, string>>({});
  const [summary, setSummary] = useState<Summary>({ present: 0, absent: 0, late: 0, leave: 0, half_day: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [dateError, setDateError] = useState<string | null>(null);
  /** Per-row marking errors, keyed by employee id. */
  const [rowErrors, setRowErrors] = useState<FieldErrors>({});

  /** Attendance is recorded for a real, non-future day. */
  function checkDate(value: string): string | null {
    const problem = dateRule(value, {}) ?? notFuture(value, {});
    return problem ? t(problem.key, problem.vars) : null;
  }

  const load = useCallback(async () => {
    const eqs = new URLSearchParams({ status: "active", page_size: "200" });
    if (roleFilter) eqs.set("role", roleFilter);
    const emps = (await (await fetch(`/api/employees?${eqs}`)).json()).results as Employee[];
    setEmployees(emps);

    const aqs = new URLSearchParams({ from: date, to: date });
    if (roleFilter) aqs.set("role", roleFilter);
    if (statusFilter) aqs.set("status", statusFilter);
    const att = await (await fetch(`/api/employee-attendance?${aqs}`)).json();
    const map: Record<number, string> = {};
    for (const a of att.results as Att[]) map[a.employee] = a.status;
    setByEmployee(map);
    setSummary(att.summary);
  }, [date, roleFilter, statusFilter]);

  // Client data hydration from the API (external system) — see use-cart.tsx.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  async function setStatus(employeeId: number, status: string) {
    setError(null);
    // Client validation first — nothing is written for an invalid date or an
    // option the UI does not offer, and the selection stays as it was.
    const dateProblem = checkDate(date);
    if (dateProblem) {
      setDateError(dateProblem);
      return;
    }
    setDateError(null);
    const statusProblem = oneOf(STATUSES)(status, {});
    if (statusProblem) {
      setRowErrors((m) => ({ ...m, [employeeId]: t(statusProblem.key, statusProblem.vars) }));
      return;
    }
    setRowErrors((m) => {
      const next = { ...m };
      delete next[employeeId];
      return next;
    });

    const res = await fetch("/api/employee-attendance", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employee_id: employeeId, date, status }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      const { fieldErrors, formError } = parseFieldErrors(data, t("errors.generic"));
      // "Attendance already recorded for this date" belongs on the row.
      const rowMessage = fieldErrors.status ?? fieldErrors.employee_id ?? null;
      if (fieldErrors.date) setDateError(fieldErrors.date);
      if (rowMessage) setRowErrors((m) => ({ ...m, [employeeId]: rowMessage }));
      else if (!fieldErrors.date) setError(formError);
      return;
    }
    setByEmployee((m) => ({ ...m, [employeeId]: status }));
    load();
  }

  return (
    <div className="space-y-4">
      <Alert tone="error" message={error} />

      <div className="flex flex-wrap items-end gap-3">
        <Field label={t("b6.date")} name="date" error={dateError ?? undefined}>
          <Input
            type="date"
            name="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              setDateError(checkDate(e.target.value));
            }}
            data-testid="att-date"
          />
        </Field>
        <Field label={t("b5.role")}>
          <Select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} data-testid="att-role-filter">
            <option value="">{t("common.all")}</option>
            {ROLES.map((r) => <option key={r} value={r}>{t(`b5.roles.${r}`)}</option>)}
          </Select>
        </Field>
        <Field label={t("common.status")}>
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} data-testid="att-status-filter">
            <option value="">{t("common.all")}</option>
            {STATUSES.map((s) => <option key={s} value={s}>{t(`b6.status.${s}`)}</option>)}
          </Select>
        </Field>
      </div>

      {/* Real summary counts */}
      <div className="flex flex-wrap gap-2 text-sm" data-testid="att-summary">
        {STATUSES.map((s) => (
          <span key={s} className="rounded-lg border border-border-strong px-3 py-1.5">
            {t(`b6.status.${s}`)}: <b>{summary[s]}</b>
          </span>
        ))}
        <span className="rounded-lg border border-border-strong px-3 py-1.5">{t("b6.total")}: <b>{summary.total}</b></span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border-strong">
        <table className="w-full text-sm">
          <thead className="bg-surface-hover text-left text-xs text-fg-muted">
            <tr>
              <th className="px-3 py-2">{t("b5.employee")}</th>
              <th className="px-3 py-2">{t("b5.role")}</th>
              <th className="px-3 py-2">{t("b6.markStatus")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-base">
            {employees.length === 0 ? (
              <tr><td colSpan={3} className="px-3 py-6 text-center text-fg-muted">{t("b5.noEmployees")}</td></tr>
            ) : employees.map((e) => (
              <tr key={e.id} data-testid="att-row">
                <td className="px-3 py-2 font-medium text-fg-base">{e.name} <span className="text-xs text-fg-muted">({e.employee_code})</span></td>
                <td className="px-3 py-2">{t(`b5.roles.${e.role}`)}</td>
                <td className="px-3 py-2">
                  <Select
                    value={byEmployee[e.id] ?? ""}
                    onChange={(ev) => setStatus(e.id, ev.target.value)}
                    className="max-w-40"
                    aria-label={t("b6.markStatus")}
                    aria-invalid={Boolean(rowErrors[e.id])}
                    aria-describedby={rowErrors[e.id] ? `att-error-${e.id}` : undefined}
                    data-testid={`att-select-${e.id}`}
                  >
                    <option value="" disabled>{t("b6.notMarked")}</option>
                    {STATUSES.map((s) => <option key={s} value={s}>{t(`b6.status.${s}`)}</option>)}
                  </Select>
                  {/* The row's own message, directly below the control. */}
                  <FieldError id={`att-error-${e.id}`} message={rowErrors[e.id]} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
