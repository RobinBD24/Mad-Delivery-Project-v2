"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
import { Field, Input, Select } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { Table, Td } from "@/components/ui/table";
import { useTranslation } from "@/lib/i18n/use-translation";
import { parseFieldErrors, type FieldErrors } from "@/lib/validation/contract";
import { LIMITS } from "@/lib/validation/limits";
import { integer, max, min, money, required, selectRequired } from "@/lib/validation/rules";
import { useFormValidation, type FieldRules } from "@/lib/validation/use-form-validation";

const ADD_RULES: FieldRules = {
  name: [required],
  estimated_delivery_minutes: [
    required,
    integer,
    min(LIMITS.minutesMin),
    max(LIMITS.minutesMax),
  ],
  delivery_charge: [required, money],
};

/** Super admin also picks the branch; a branch manager's is fixed server-side. */
const ADD_RULES_SUPER: FieldRules = { ...ADD_RULES, branch_id: [selectRequired] };

export interface AreaRow {
  id: number;
  branch: number;
  branch_name: string | null;
  name: string;
  is_active: boolean;
  is_held: boolean;
  hold_reason: string;
  estimated_delivery_minutes: number;
  delivery_charge: string;
}
export interface BranchOpt { id: number; name: string }

/**
 * Delivery-areas management (req #1). Super admin: all branches + a branch
 * filter + a branch picker in the add form. Branch manager: own branch only (no
 * branch picker — the server also forbids other branches). Add / edit / hold /
 * resume / update time + charge; all changes go through the server-authorized
 * /api/delivery-areas endpoints.
 */
export function DeliveryAreasManager({
  areas: initial,
  branches,
  isSuperAdmin,
}: {
  areas: AreaRow[];
  branches?: BranchOpt[];
  isSuperAdmin: boolean;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const [areas, setAreas] = useState<AreaRow[]>(initial);
  const [branchFilter, setBranchFilter] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [serverErrors, setServerErrors] = useState<FieldErrors>({});
  const [submissionId, setSubmissionId] = useState(0);
  /** Inline-edit errors, keyed by the row's own field id. */
  const [rowErrors, setRowErrors] = useState<FieldErrors>({});

  // add-form state
  const [name, setName] = useState("");
  const [minutes, setMinutes] = useState("45");
  const [charge, setCharge] = useState("0");
  const [branchId, setBranchId] = useState<string>(branches?.[0]?.id ? String(branches[0].id) : "");

  const shown = useMemo(
    () => (branchFilter ? areas.filter((a) => String(a.branch) === branchFilter) : areas),
    [areas, branchFilter],
  );

  /**
   * Returns the parsed error map on failure, or null on success. Field keys the
   * API sends (`name`, `branch_id`, …) match the form's input names exactly.
   */
  const api = useCallback(
    async (path: string, method: string, body?: unknown) => {
      setBusy(true);
      setError(null);
      setSuccess(null);
      try {
        const res = await fetch(`/api/delivery-areas${path}`, {
          method,
          headers: { "content-type": "application/json" },
          body: body ? JSON.stringify(body) : undefined,
        });
        const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        if (!res.ok) return parseFieldErrors(data, t("common.error"));
        return null;
      } finally {
        setBusy(false);
      }
    },
    [t],
  );

  const refresh = useCallback(async () => {
    const q = isSuperAdmin && branchFilter ? `?branch_id=${branchFilter}` : "";
    const res = await fetch(`/api/delivery-areas${q}`);
    const data = (await res.json()) as { results: AreaRow[] };
    setAreas(data.results);
    router.refresh();
  }, [branchFilter, isSuperAdmin, router]);

  /** Runs only after the client rules passed. */
  const addArea = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      void (async () => {
        const failure = await api("/", "POST", {
          name: name.trim(),
          estimated_delivery_minutes: Number(minutes),
          delivery_charge: Number(charge),
          ...(isSuperAdmin ? { branch_id: Number(branchId) } : {}),
        });
        setSubmissionId((n) => n + 1);
        setServerErrors(failure?.fieldErrors ?? {});
        if (failure) {
          // A duplicate area name arrives as `name` and shows under that field.
          setError(failure.fieldErrors.name ? null : failure.formError);
          return;
        }
        // Cleared ONLY after the area was actually created.
        setName("");
        setMinutes("45");
        setCharge("0");
        setSuccess(t("deliveryArea.added"));
        await refresh();
      })();
    },
    [api, branchId, charge, isSuperAdmin, minutes, name, refresh, t],
  );

  const { errors, formProps } = useFormValidation(isSuperAdmin ? ADD_RULES_SUPER : ADD_RULES, {
    onSubmitValid: addArea,
    serverErrors,
    submissionId,
    pending: busy,
  });

  /** Inline row edit — validated with the SAME rules the add form uses. */
  async function saveEdit(a: AreaRow) {
    const found: FieldErrors = {};
    if (!a.name.trim()) found[`area-${a.id}-name`] = t("validation.required");
    const minutesProblem =
      integer(String(a.estimated_delivery_minutes), {}) ??
      min(LIMITS.minutesMin)(String(a.estimated_delivery_minutes), {}) ??
      max(LIMITS.minutesMax)(String(a.estimated_delivery_minutes), {});
    if (minutesProblem) {
      found[`area-${a.id}-minutes`] = t(minutesProblem.key, minutesProblem.vars);
    }
    const chargeProblem = money(String(a.delivery_charge), {});
    if (chargeProblem) found[`area-${a.id}-charge`] = t(chargeProblem.key, chargeProblem.vars);

    if (Object.keys(found).length > 0) {
      // Nothing is sent and the row keeps every edited value.
      setRowErrors(found);
      return;
    }

    const failure = await api(`/${a.id}/`, "PATCH", {
      name: a.name.trim(),
      estimated_delivery_minutes: a.estimated_delivery_minutes,
      delivery_charge: Number(a.delivery_charge),
    });
    if (failure) {
      setRowErrors({
        ...(failure.fieldErrors.name ? { [`area-${a.id}-name`]: failure.fieldErrors.name } : {}),
        ...(failure.fieldErrors.estimated_delivery_minutes
          ? { [`area-${a.id}-minutes`]: failure.fieldErrors.estimated_delivery_minutes }
          : {}),
        ...(failure.fieldErrors.delivery_charge
          ? { [`area-${a.id}-charge`]: failure.fieldErrors.delivery_charge }
          : {}),
      });
      setError(failure.formError);
      return; // the row stays in edit mode with the user's values
    }
    setRowErrors({});
    setEditingId(null);
    setSuccess(t("deliveryArea.updated"));
    await refresh();
  }

  async function toggleHold(a: AreaRow) {
    const failure = await api(
      `/${a.id}/${a.is_held ? "resume" : "hold"}/`,
      "POST",
      a.is_held ? undefined : { reason: "" },
    );
    if (failure) {
      setError(failure.formError);
      return;
    }
    setSuccess(a.is_held ? t("deliveryArea.resumed") : t("deliveryArea.held"));
    await refresh();
  }

  function patchLocal(id: number, patch: Partial<AreaRow>) {
    setAreas((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  }

  return (
    <div className="space-y-5">
      <Alert tone="error" message={error} />
      <Alert tone="success" message={success} />

      <Card>
        <CardHeader title={t("deliveryArea.addTitle")} subtitle={t("deliveryArea.addSub")} />
        <CardContent>
          <form {...formProps} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {isSuperAdmin && branches ? (
              <Field label={t("deliveryArea.branch")} name="branch_id" required error={errors.branch_id}>
                <Select name="branch_id" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </Select>
              </Field>
            ) : null}
            <Field label={t("deliveryArea.name")} name="name" required error={errors.name}>
              <Input
                name="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("deliveryArea.namePlaceholder")}
              />
            </Field>
            <Field
              label={t("deliveryArea.minutes")}
              name="estimated_delivery_minutes"
              required
              error={errors.estimated_delivery_minutes}
            >
              <Input
                name="estimated_delivery_minutes"
                type="number"
                min="1"
                value={minutes}
                onChange={(e) => setMinutes(e.target.value)}
              />
            </Field>
            <Field
              label={t("deliveryArea.charge")}
              name="delivery_charge"
              required
              error={errors.delivery_charge}
            >
              <Input
                name="delivery_charge"
                type="number"
                min="0"
                step="1"
                value={charge}
                onChange={(e) => setCharge(e.target.value)}
              />
            </Field>
            <div className="flex items-end">
              <Button type="submit" disabled={busy}>{t("deliveryArea.add")}</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {isSuperAdmin && branches ? (
        <div className="max-w-xs">
          <Field label={t("deliveryArea.filterBranch")}>
            <Select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}>
              <option value="">{t("common.all")}</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </Select>
          </Field>
        </div>
      ) : null}

      <Card>
        <CardHeader title={t("deliveryArea.listTitle")} />
        {shown.length === 0 ? (
          <EmptyState title={t("deliveryArea.empty")} description={t("deliveryArea.emptyDesc")} />
        ) : (
          <Table headers={[
            ...(isSuperAdmin ? [t("deliveryArea.branch")] : []),
            t("deliveryArea.name"),
            t("deliveryArea.minutes"),
            t("deliveryArea.charge"),
            t("common.status"),
            "",
          ]}>
            {shown.map((a) => (
              <tr key={a.id} className="hover:bg-surface-hover/70">
                {isSuperAdmin ? <Td>{a.branch_name}</Td> : null}
                <Td>
                  {editingId === a.id ? (
                    <>
                      <Input
                        aria-label={t("deliveryArea.name")}
                        value={a.name}
                        aria-invalid={Boolean(rowErrors[`area-${a.id}-name`])}
                        aria-describedby={rowErrors[`area-${a.id}-name`] ? `area-${a.id}-name-error` : undefined}
                        onChange={(e) => patchLocal(a.id, { name: e.target.value })}
                      />
                      <FieldError id={`area-${a.id}-name-error`} message={rowErrors[`area-${a.id}-name`]} />
                    </>
                  ) : (
                    <span className="font-medium text-fg-base">{a.name}</span>
                  )}
                </Td>
                <Td>
                  {editingId === a.id ? (
                    <>
                      <Input aria-label={t("deliveryArea.minutes")} type="number" min="1" value={a.estimated_delivery_minutes}
                        aria-invalid={Boolean(rowErrors[`area-${a.id}-minutes`])}
                        aria-describedby={rowErrors[`area-${a.id}-minutes`] ? `area-${a.id}-minutes-error` : undefined}
                        onChange={(e) => patchLocal(a.id, { estimated_delivery_minutes: Number(e.target.value) })} className="w-20" />
                      <FieldError id={`area-${a.id}-minutes-error`} message={rowErrors[`area-${a.id}-minutes`]} />
                    </>
                  ) : (
                    `${a.estimated_delivery_minutes} ${t("deliveryArea.min")}`
                  )}
                </Td>
                <Td>
                  {editingId === a.id ? (
                    <>
                      <Input aria-label={t("deliveryArea.charge")} type="number" min="0" value={a.delivery_charge}
                        aria-invalid={Boolean(rowErrors[`area-${a.id}-charge`])}
                        aria-describedby={rowErrors[`area-${a.id}-charge`] ? `area-${a.id}-charge-error` : undefined}
                        onChange={(e) => patchLocal(a.id, { delivery_charge: e.target.value })} className="w-24" />
                      <FieldError id={`area-${a.id}-charge-error`} message={rowErrors[`area-${a.id}-charge`]} />
                    </>
                  ) : (
                    a.delivery_charge
                  )}
                </Td>
                <Td>
                  {a.is_held ? <Badge tone="red">{t("deliveryArea.heldBadge")}</Badge> : <Badge tone="green">{t("deliveryArea.activeBadge")}</Badge>}
                </Td>
                <Td className="text-right">
                  <span className="flex flex-wrap justify-end gap-2">
                    {editingId === a.id ? (
                      <>
                        <Button size="sm" onClick={() => void saveEdit(a)} disabled={busy}>{t("common.save")}</Button>
                        <Button size="sm" variant="ghost" onClick={() => { setEditingId(null); setRowErrors({}); void refresh(); }}>{t("common.cancel")}</Button>
                      </>
                    ) : (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => { setEditingId(a.id); setRowErrors({}); }}>{t("common.edit")}</Button>
                        <Button size="sm" variant={a.is_held ? "success" : "outline"} onClick={() => void toggleHold(a)} disabled={busy}>
                          {a.is_held ? t("deliveryArea.resume") : t("deliveryArea.hold")}
                        </Button>
                      </>
                    )}
                  </span>
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}
