"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { Field, Input, Select } from "@/components/ui/input";
import { useTranslation } from "@/lib/i18n/use-translation";
import { parseFieldErrors, type FieldErrors } from "@/lib/validation/contract";
import { LIMITS } from "@/lib/validation/limits";
import {
  email as emailRule,
  maxLength,
  notFuture,
  oneOf,
  phone as phoneRule,
  required,
} from "@/lib/validation/rules";
import { useFormValidation, type FieldRules } from "@/lib/validation/use-form-validation";

// PHASE M — "others" joins the existing validated job terms; picking it reveals
// a required free-text term rather than turning the whole field into free text.
const ROLES = ["kitchen", "chef", "waiter", "cashier", "delivery", "cleaner", "security", "supervisor", "others"] as const;

interface Team {
  id: number;
  name: string;
}

interface Employee {
  id: number;
  name: string;
  first_name: string;
  last_name: string;
  employee_code: string;
  phone: string;
  email: string;
  role: string;
  custom_role: string;
  role_label: string;
  employment_status: string;
  quit_reason: string;
  team: number | null;
  team_name: string | null;
  department: string;
  is_active: boolean;
  joining_date: string | null;
}

/** POST/PATCH a FormData payload. Returns the parsed error map, or null on success. */
async function apiForm(url: string, method: string, form: FormData, fallback: string) {
  const res = await fetch(url, { method, body: form });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    return parseFieldErrors(data, fallback);
  }
  return null;
}

const FILES = { photo: false };

export function EmployeesPanel() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<Employee[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [roleFilter, setRoleFilter] = useState("");
  const [teamFilter, setTeamFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  // Mirrors the role <select> so the custom-term field can appear for "others".
  const [formRole, setFormRole] = useState("waiter");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [serverErrors, setServerErrors] = useState<FieldErrors>({});
  const [submissionId, setSubmissionId] = useState(0);

  const RULES: FieldRules = useMemo(
    () => ({
      first_name: [required, maxLength(LIMITS.nameMax)],
      last_name: [maxLength(LIMITS.nameMax)],
      employee_code: [required, maxLength(LIMITS.shortTextMax)],
      role: [required, oneOf(ROLES)],
      // Revealed only for "others", and then it is mandatory — matching the server.
      ...(formRole === "others" ? { custom_role: [required, maxLength(LIMITS.nameMax)] } : {}),
      phone: [phoneRule],
      email: [emailRule],
      department: [maxLength(LIMITS.shortTextMax)],
      joining_date: [notFuture],
    }),
    [formRole],
  );

  async function load() {
    const qs = new URLSearchParams();
    if (roleFilter) qs.set("role", roleFilter);
    if (teamFilter) qs.set("team_id", teamFilter);
    // "" = All, which is a filter only — it is never a stored status.
    if (statusFilter) qs.set("status", statusFilter);
    if (search.trim()) qs.set("search", search.trim());
    qs.set("page_size", "200");
    const res = await fetch(`/api/employees?${qs.toString()}`);
    const data = await res.json();
    setRows(data.results ?? []);
  }
  // Client data hydration from the API (external system) — see use-cart.tsx.
  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [roleFilter, teamFilter, statusFilter]);

  // Teams are branch-scoped server-side; this only needs loading once.
  useEffect(() => {
    fetch("/api/employee-teams")
      .then((r) => (r.ok ? r.json() : { results: [] }))
      .then((d) => setTeams(d.results ?? []))
      .catch(() => setTeams([]));
  }, []);

  function openCreate() { setEditing(null); setFormRole("waiter"); setServerErrors({}); setShowForm(true); }
  function openEdit(e: Employee) { setEditing(e); setFormRole(e.role); setServerErrors({}); setShowForm(true); }

  /** PHASE M — Quit Job / reactivate. Never a delete: history is untouched. */
  async function setEmploymentStatus(e: Employee, status: string, reason: string) {
    setError(null);
    const res = await fetch(`/api/employees/${e.id}/status/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employment_status: status, reason }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(parseFieldErrors(data, t("errors.generic")).formError);
      return;
    }
    await load();
  }

  /** Runs only after every client rule passed. */
  const submitForm = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      setError(null);
      setBusy(true);
      void (async () => {
        try {
          const failure = editing
            ? await apiForm(`/api/employees/${editing.id}/`, "PATCH", form, t("errors.generic"))
            : await apiForm("/api/employees/", "POST", form, t("errors.generic"));
          setSubmissionId((n) => n + 1);
          setServerErrors(failure?.fieldErrors ?? {});
          if (failure) {
            // A duplicate employee code arrives as `employee_code` and is shown
            // under that field; the form stays open with every value intact.
            setError(Object.keys(failure.fieldErrors).length ? null : failure.formError);
            return;
          }
          setShowForm(false);
          setEditing(null);
          await load();
        } finally {
          setBusy(false);
        }
      })();
    },
    // `load` is intentionally omitted — it is redefined every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editing, t],
  );

  const { errors, formProps } = useFormValidation(RULES, {
    files: FILES,
    onSubmitValid: submitForm,
    serverErrors,
    submissionId,
    pending: busy,
  });

  async function toggleActive(e: Employee) {
    const form = new FormData();
    form.set("is_active", String(!e.is_active));
    const failure = await apiForm(`/api/employees/${e.id}/`, "PATCH", form, t("errors.generic"));
    if (failure) {
      setError(failure.formError);
      return;
    }
    await load();
  }

  return (
    <div className="space-y-4">
      <Alert tone="error" message={error} />

      <div className="flex flex-wrap items-end gap-3">
        <Field label={t("common.search")}>
          <Input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load()} data-testid="emp-search" placeholder={t("b5.searchPlaceholder")} />
        </Field>
        <Field label={t("b5.role")}>
          <Select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} data-testid="emp-role-filter">
            <option value="">{t("common.all")}</option>
            {ROLES.map((r) => <option key={r} value={r}>{t(`b5.roles.${r}`)}</option>)}
          </Select>
        </Field>
        <Field label={t("employees.filterTeam")}>
          <Select value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)} data-testid="emp-team-filter">
            <option value="">{t("common.all")}</option>
            {teams.map((tm) => <option key={tm.id} value={tm.id}>{tm.name}</option>)}
          </Select>
        </Field>
        <Field label={t("common.status")}>
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} data-testid="emp-status-filter">
            {/* "All" is a filter, never a stored status. */}
            <option value="">{t("employees.statusAll")}</option>
            <option value="active">{t("employees.statusActive")}</option>
            <option value="quit_job">{t("employees.statusQuit")}</option>
          </Select>
        </Field>
        <Button type="button" onClick={openCreate} data-testid="emp-add">+ {t("b5.addEmployee")}</Button>
      </div>

      {showForm ? (
        <form {...formProps} className="grid gap-4 rounded-xl border border-border-strong p-4 sm:grid-cols-2" data-testid="emp-form" encType="multipart/form-data">
          <Field label={t("b5.firstName")} name="first_name" required error={errors.first_name}>
            <Input name="first_name" defaultValue={editing?.first_name} data-testid="emp-first" />
          </Field>
          <Field label={t("b5.lastName")} name="last_name" error={errors.last_name}>
            <Input name="last_name" defaultValue={editing?.last_name} />
          </Field>
          <Field label={t("b5.employeeCode")} name="employee_code" required error={errors.employee_code}>
            <Input name="employee_code" defaultValue={editing?.employee_code} data-testid="emp-code" />
          </Field>
          <Field label={t("employees.jobTerm")} name="role" required error={errors.role}>
            <Select
              name="role"
              value={formRole}
              onChange={(e) => setFormRole(e.target.value)}
              data-testid="emp-form-role"
            >
              {ROLES.map((r) => <option key={r} value={r}>{t(`b5.roles.${r}`)}</option>)}
            </Select>
          </Field>
          {formRole === "others" ? (
            <Field label={t("employees.customRole")} name="custom_role" required error={errors.custom_role}>
              <Input name="custom_role" defaultValue={editing?.custom_role} data-testid="emp-form-custom-role" />
            </Field>
          ) : null}
          <Field label={t("employees.filterTeam")} name="team_id" error={errors.team_id}>
            <Select name="team_id" defaultValue={editing?.team ? String(editing.team) : ""} data-testid="emp-form-team">
              <option value="">{t("employees.teamNone")}</option>
              {teams.map((tm) => <option key={tm.id} value={tm.id}>{tm.name}</option>)}
            </Select>
          </Field>
          <Field label={t("common.phone")} name="phone" error={errors.phone}>
            <Input name="phone" defaultValue={editing?.phone} placeholder="01XXXXXXXXX" />
          </Field>
          <Field label={t("common.email")} name="email" error={errors.email}>
            <Input name="email" type="email" defaultValue={editing?.email} />
          </Field>
          <Field label={t("b5.department")} name="department" error={errors.department}>
            <Input name="department" defaultValue={editing?.department} />
          </Field>
          <Field label={t("b5.joiningDate")} name="joining_date" error={errors.joining_date}>
            <Input name="joining_date" type="date" defaultValue={editing?.joining_date ?? ""} />
          </Field>
          {/* Left empty on edit → the saved photo is kept. */}
          <Field label={t("b5.photo")} name="photo" error={errors.photo}>
            <Input name="photo" type="file" accept="image/*" className="py-2" />
          </Field>
          <div className="flex items-end gap-2 sm:col-span-2">
            <Button type="submit" disabled={busy}>{editing ? t("common.update") : t("common.create")}</Button>
            <Button type="button" variant="outline" onClick={() => setShowForm(false)}>{t("common.cancel")}</Button>
          </div>
        </form>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-border-strong">
        <table className="w-full text-sm" data-testid="emp-table">
          <thead className="bg-surface-hover text-left text-xs text-fg-muted">
            <tr>
              <th className="px-3 py-2">{t("b5.employee")}</th>
              <th className="px-3 py-2">{t("b5.employeeCode")}</th>
              <th className="px-3 py-2">{t("employees.jobTerm")}</th>
              <th className="px-3 py-2">{t("employees.filterTeam")}</th>
              <th className="px-3 py-2">{t("common.phone")}</th>
              <th className="px-3 py-2">{t("common.status")}</th>
              <th className="px-3 py-2 text-right">{t("common.actions")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-base">
            {rows.length === 0 ? (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-fg-muted">{t("b5.noEmployees")}</td></tr>
            ) : rows.map((e) => (
              <tr key={e.id} data-testid="emp-row">
                <td className="px-3 py-2 font-medium text-fg-base">{e.name}</td>
                <td className="px-3 py-2">{e.employee_code}</td>
                <td className="px-3 py-2">{e.role === "others" ? e.custom_role : t(`b5.roles.${e.role}`)}</td>
                <td className="px-3 py-2">{e.team_name ?? "—"}</td>
                <td className="px-3 py-2">{e.phone || "—"}</td>
                <td className="px-3 py-2">
                  {/* Status is never colour-only — the label carries the meaning. */}
                  <span data-testid={`emp-status-${e.id}`}>
                    {e.employment_status === "quit_job"
                      ? <Badge tone="red">{t("employees.statusQuit")}</Badge>
                      : <Badge tone="green">{t("employees.statusActive")}</Badge>}
                  </span>
                </td>
                <td className="px-3 py-2 text-right">
                  <span className="flex justify-end gap-3">
                    <button type="button" className="text-brand-600 hover:underline" onClick={() => openEdit(e)}>{t("common.edit")}</button>
                    <button type="button" className="text-fg-muted hover:underline" onClick={() => toggleActive(e)}>{e.is_active ? t("common.disable") : t("common.enable")}</button>
                    {e.employment_status === "quit_job" ? (
                      <button
                        type="button"
                        className="text-emerald-600 hover:underline"
                        onClick={() => setEmploymentStatus(e, "active", "")}
                        data-testid={`emp-reactivate-${e.id}`}
                      >
                        {t("employees.reactivate")}
                      </button>
                    ) : (
                      <ConfirmModal
                        trigger={
                          <button type="button" className="text-red-600 hover:underline" data-testid={`emp-quit-${e.id}`}>
                            {t("employees.quitJob")}
                          </button>
                        }
                        title={t("employees.quitConfirmTitle")}
                        description={t("employees.quitConfirmDesc")}
                        confirmLabel={t("employees.quitJob")}
                        withReason
                        reasonPlaceholder={t("employees.quitReason")}
                        action={async (reason: string) => {
                          await setEmploymentStatus(e, "quit_job", reason);
                          return { error: null };
                        }}
                      />
                    )}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
