"use client";

import { useCallback, useEffect, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { Field, Input, Textarea } from "@/components/ui/input";
import { useTranslation } from "@/lib/i18n/use-translation";
import { parseFieldErrors, type FieldErrors } from "@/lib/validation/contract";
import { LIMITS } from "@/lib/validation/limits";
import { maxLength, minLength, required } from "@/lib/validation/rules";
import { useFormValidation, type FieldRules } from "@/lib/validation/use-form-validation";

const RULES: FieldRules = {
  name: [required, minLength(LIMITS.nameMin), maxLength(LIMITS.nameMax)],
  description: [maxLength(LIMITS.longTextMax)],
};

/**
 * PHASE M — staff TEAMS for the manager's own branch.
 *
 * The API is branch-scoped, so this component never sends a branch id and can
 * never be pointed at another branch. Deleting a team that still has members
 * archives it instead; the response says which happened and the UI repeats it
 * rather than guessing.
 */

interface Team {
  id: number;
  name: string;
  description: string;
  is_active: boolean;
  is_archived: boolean;
  member_count: number;
}

export function TeamsPanel() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<Team[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<Team | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [serverErrors, setServerErrors] = useState<FieldErrors>({});
  const [submissionId, setSubmissionId] = useState(0);

  async function load() {
    const res = await fetch("/api/employee-teams");
    const data = res.ok ? await res.json() : { results: [] };
    setRows(data.results ?? []);
  }
  // Client data hydration from the API (external system) — see employees-panel.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, []);

  /** Returns the response body, or null when the request failed. */
  async function send(
    url: string,
    method: string,
    body?: unknown,
  ): Promise<Record<string, unknown> | null> {
    const res = await fetch(url, {
      method,
      ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const { fieldErrors, formError } = parseFieldErrors(data, t("errors.generic"));
      setSubmissionId((n) => n + 1);
      setServerErrors(fieldErrors);
      // A duplicate team name arrives as `name` and shows under that field.
      setError(Object.keys(fieldErrors).length ? null : formError);
      return null;
    }
    return data ?? {};
  }

  /** Runs only after every client rule passed. */
  const submit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const payload = {
        name: String(form.get("name") ?? "").trim(),
        description: String(form.get("description") ?? "").trim(),
      };
      setError(null);
      setNotice(null);
      setBusy(true);
      void (async () => {
        const ok = editing
          ? await send(`/api/employee-teams/${editing.id}/`, "PATCH", payload)
          : await send("/api/employee-teams/", "POST", payload);
        setBusy(false);
        if (!ok) return; // the form stays open with the manager's values
        setServerErrors({});
        setNotice(t(editing ? "employees.teamUpdated" : "employees.teamCreated"));
        setShowForm(false);
        setEditing(null);
        await load();
      })();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editing, t],
  );

  const { errors, formProps } = useFormValidation(RULES, {
    onSubmitValid: submit,
    serverErrors,
    submissionId,
    pending: busy,
  });

  return (
    <div className="space-y-4" data-testid="teams-panel">
      <Alert tone="error" message={error} />
      <Alert tone="success" message={notice} />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-fg-subtle">{t("employees.teamsSub")}</p>
        <Button
          type="button"
          size="sm"
          onClick={() => { setEditing(null); setServerErrors({}); setShowForm(true); }}
          data-testid="team-add"
        >
          + {t("employees.teamNew")}
        </Button>
      </div>

      {showForm ? (
        <form {...formProps} className="grid gap-3 rounded-xl border border-border-strong p-4 sm:grid-cols-2" data-testid="team-form">
          <Field label={t("employees.teamName")} name="name" required error={errors.name}>
            <Input name="name" defaultValue={editing?.name} data-testid="team-name" />
          </Field>
          <Field label={t("employees.teamDescription")} name="description" error={errors.description}>
            <Textarea name="description" defaultValue={editing?.description} data-testid="team-description" />
          </Field>
          <div className="flex items-end gap-2 sm:col-span-2">
            <Button type="submit" disabled={busy} data-testid="team-save">{t("employees.teamSave")}</Button>
            <Button type="button" variant="outline" onClick={() => setShowForm(false)}>{t("rewards.ruleCancel")}</Button>
          </div>
        </form>
      ) : null}

      {rows.length === 0 ? (
        <p className="rounded-xl border border-border-base px-3 py-6 text-center text-sm text-fg-muted" data-testid="teams-empty">
          {t("employees.teamEmptyDesc")}
        </p>
      ) : (
        <ul className="space-y-2.5">
          {rows.map((team) => (
            <li key={team.id} className="rounded-xl border border-border-strong p-3.5" data-testid={`team-${team.id}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium text-fg-base">{team.name}</p>
                  <p className="mt-0.5 text-xs text-fg-subtle">
                    {t("employees.teamMembers", { count: team.member_count })}
                    {team.description ? ` · ${team.description}` : ""}
                  </p>
                </div>
                {team.is_archived ? (
                  <span data-testid={`team-archived-${team.id}`}><Badge tone="slate">{t("employees.teamArchived")}</Badge></span>
                ) : null}
              </div>
              {team.is_archived ? null : (
                <div className="mt-2.5 flex flex-wrap gap-3 text-sm">
                  <button
                    type="button"
                    className="font-medium text-brand-600 hover:underline"
                    onClick={() => { setEditing(team); setServerErrors({}); setShowForm(true); }}
                    data-testid={`team-edit-${team.id}`}
                  >
                    {t("employees.teamEdit")}
                  </button>
                  <ConfirmModal
                    trigger={
                      <button type="button" className="font-medium text-red-600 hover:underline" data-testid={`team-delete-${team.id}`}>
                        {t("employees.teamDelete")}
                      </button>
                    }
                    title={t("employees.teamsTitle")}
                    description={t("employees.teamEmptyDesc")}
                    confirmLabel={t("employees.teamDelete")}
                    action={async () => {
                      const res = await send(`/api/employee-teams/${team.id}/`, "DELETE");
                      if (res) {
                        setNotice(t(res.archived ? "employees.teamArchivedResult" : "employees.teamDeleted"));
                        await load();
                      }
                      return { error: null };
                    }}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
