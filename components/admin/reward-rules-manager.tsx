"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import type { EarningRuleFormValues } from "@/lib/api/action-state";
import {
  createEarningRuleAction,
  deleteEarningRuleAction,
  setEarningRuleActiveAction,
  updateEarningRuleAction,
} from "@/lib/api/actions";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { useTranslation } from "@/lib/i18n/use-translation";
import type { FieldErrors } from "@/lib/validation/contract";
import { LIMITS } from "@/lib/validation/limits";
import {
  integer,
  max,
  maxLength,
  min,
  money,
  number,
  oneOf,
  required,
} from "@/lib/validation/rules";
import { useFormValidation, type FieldRules } from "@/lib/validation/use-form-validation";

/**
 * PHASE H — Super Admin CRUD for reward earning rules.
 *
 * Everything here is a thin driver over the API: RBAC, decimal-safe point
 * arithmetic, the overlap/ambiguity guard (409) and archive-instead-of-delete
 * all live on the server, so a rejected write shows the server's own message
 * rather than a locally invented one. On narrow screens each rule renders as a
 * stacked card instead of a table row.
 */

export interface EarningRuleRow {
  id: number;
  name: string;
  description: string;
  is_active: boolean;
  is_archived: boolean;
  fixed_points: number;
  points_per_currency: number;
  min_order_amount: number;
  eligible_order_status: string;
  eligible_payment_status: string;
  starts_at: string | null;
  ends_at: string | null;
  priority: number;
  branch: number | null;
  branch_name: string | null;
  updated_by: string;
}

const ORDER_STATUSES = ["delivered", "on_the_way", "picked_up", "ready"];
// Rule condition → the existing Phase S payment-status label.
const PAYMENT_STATUS_LABELS: Record<string, string> = {
  unpaid: "payments.statusUnpaid",
  pending_verification: "payments.statusPending",
  verified: "payments.statusVerified",
  rejected: "payments.statusRejected",
  paid: "payments.statusPaid",
};
const PAYMENT_STATUSES = ["any", ...Object.keys(PAYMENT_STATUS_LABELS)];

/** ISO → the `yyyy-MM-ddThh:mm` a datetime-local input expects (empty = none). */
function toLocalInput(iso: string | null): string {
  return iso ? iso.slice(0, 16) : "";
}

const RULES: FieldRules = {
  name: [required, maxLength(LIMITS.nameMax)],
  description: [maxLength(LIMITS.longTextMax)],
  fixed_points: [required, integer, min(LIMITS.pointsMin), max(LIMITS.pointsMax)],
  points_per_currency: [required, number, min(0), max(LIMITS.pointsMax)],
  min_order_amount: [required, money],
  priority: [required, integer, min(0)],
  eligible_order_status: [required, oneOf(ORDER_STATUSES)],
  eligible_payment_status: [required, oneOf(PAYMENT_STATUSES)],
};

const blank: EarningRuleFormValues = {
  name: "",
  description: "",
  fixed_points: 0,
  points_per_currency: 0,
  min_order_amount: 0,
  eligible_order_status: "delivered",
  eligible_payment_status: "any",
  starts_at: null,
  ends_at: null,
  priority: 0,
  branch_id: null,
};

export function RewardRulesManager({
  rules,
  branches,
}: {
  rules: EarningRuleRow[];
  branches: { id: number; name: string }[];
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const [form, setForm] = useState<EarningRuleFormValues>(blank);
  const [serverErrors, setServerErrors] = useState<FieldErrors>({});
  const [submissionId, setSubmissionId] = useState(0);

  /** End must come after start; the message belongs on the end field. */
  const validateWindow = useCallback((): FieldErrors => {
    const { starts_at: from, ends_at: to } = form;
    if (from && to && to <= from) return { ends_at: t("validation.dateRange") };
    return {};
  }, [form, t]);

  const submitRule = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setError(null);
      start(async () => {
        const res =
          editing === "new"
            ? await createEarningRuleAction(form)
            : await updateEarningRuleAction(editing as number, form);
        setSubmissionId((n) => n + 1);
        setServerErrors(res.fieldErrors ?? {});
        if (res.error || Object.keys(res.fieldErrors ?? {}).length > 0) {
          // The editor stays open with every value intact.
          setError(res.error);
          return;
        }
        setEditing(null);
        router.refresh();
      });
    },
    [editing, form, router, start],
  );

  const { errors, formProps, reset: resetErrors } = useFormValidation(RULES, {
    validate: validateWindow,
    onSubmitValid: submitRule,
    serverErrors,
    submissionId,
    pending,
  });

  function openNew() {
    setError(null);
    setServerErrors({});
    resetErrors();
    setForm(blank);
    setEditing("new");
  }

  function openEdit(rule: EarningRuleRow) {
    setError(null);
    setServerErrors({});
    resetErrors();
    setForm({
      name: rule.name,
      description: rule.description,
      fixed_points: rule.fixed_points,
      points_per_currency: rule.points_per_currency,
      min_order_amount: rule.min_order_amount,
      eligible_order_status: rule.eligible_order_status,
      eligible_payment_status: rule.eligible_payment_status,
      starts_at: toLocalInput(rule.starts_at) || null,
      ends_at: toLocalInput(rule.ends_at) || null,
      priority: rule.priority,
      branch_id: rule.branch,
    });
    setEditing(rule.id);
  }

  function toggle(rule: EarningRuleRow) {
    setError(null);
    start(async () => {
      const res = await setEarningRuleActiveAction(rule.id, !rule.is_active);
      if (res.error) setError(res.error);
      else router.refresh();
    });
  }

  const set = <K extends keyof EarningRuleFormValues>(key: K, value: EarningRuleFormValues[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  return (
    <div data-testid="reward-rules-manager">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-fg-subtle">{t("rewards.rulesSub")}</p>
        <Button size="sm" onClick={openNew} disabled={pending} data-testid="reward-rule-new">
          {t("rewards.ruleNew")}
        </Button>
      </div>

      {error ? (
        <div className="mb-3" data-testid="reward-rule-error">
          <Alert tone="error" message={error} />
        </div>
      ) : null}

      {editing !== null ? (
        <form
          {...formProps}
          className="mb-4 rounded-xl border border-border-strong p-4"
          data-testid="reward-rule-form"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label={t("rewards.ruleName")}
              name="name"
              required
              className="sm:col-span-2"
              error={errors.name}
            >
              <Input
                name="name"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                data-testid="reward-rule-name"
              />
            </Field>
            <Field
              label={t("rewards.ruleDescription")}
              name="description"
              className="sm:col-span-2"
              error={errors.description}
            >
              <Textarea
                name="description"
                value={form.description ?? ""}
                onChange={(e) => set("description", e.target.value)}
                data-testid="reward-rule-description"
              />
            </Field>
            <Field label={t("rewards.ruleFixedPoints")} name="fixed_points" required error={errors.fixed_points}>
              <Input
                name="fixed_points"
                type="number"
                min={0}
                value={form.fixed_points}
                onChange={(e) => set("fixed_points", Number(e.target.value))}
                data-testid="reward-rule-fixed-points"
              />
            </Field>
            <Field
              label={t("rewards.rulePointsPerCurrency")}
              name="points_per_currency"
              required
              error={errors.points_per_currency}
            >
              <Input
                name="points_per_currency"
                type="number"
                min={0}
                step="0.001"
                value={form.points_per_currency}
                onChange={(e) => set("points_per_currency", Number(e.target.value))}
                data-testid="reward-rule-points-per-currency"
              />
            </Field>
            <Field label={t("rewards.ruleMinOrder")} name="min_order_amount" required error={errors.min_order_amount}>
              <Input
                name="min_order_amount"
                type="number"
                min={0}
                step="0.01"
                value={form.min_order_amount}
                onChange={(e) => set("min_order_amount", Number(e.target.value))}
                data-testid="reward-rule-min-order"
              />
            </Field>
            <Field label={t("rewards.rulePriority")} name="priority" required error={errors.priority}>
              <Input
                name="priority"
                type="number"
                min={0}
                value={form.priority}
                onChange={(e) => set("priority", Number(e.target.value))}
                data-testid="reward-rule-priority"
              />
            </Field>
            <Field
              label={t("rewards.ruleOrderStatus")}
              name="eligible_order_status"
              required
              error={errors.eligible_order_status}
            >
              <Select
                name="eligible_order_status"
                value={form.eligible_order_status}
                onChange={(e) => set("eligible_order_status", e.target.value)}
                data-testid="reward-rule-order-status"
              >
                {ORDER_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {t(`orderStatus.${s}`)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label={t("rewards.rulePaymentStatus")}
              name="eligible_payment_status"
              required
              error={errors.eligible_payment_status}
            >
              <Select
                name="eligible_payment_status"
                value={form.eligible_payment_status}
                onChange={(e) => set("eligible_payment_status", e.target.value)}
                data-testid="reward-rule-payment-status"
              >
                {PAYMENT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s === "any" ? t("rewards.ruleAnyPayment") : t(PAYMENT_STATUS_LABELS[s])}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t("rewards.ruleStartsAt")} name="starts_at" error={errors.starts_at}>
              <Input
                name="starts_at"
                type="datetime-local"
                value={form.starts_at ?? ""}
                onChange={(e) => set("starts_at", e.target.value || null)}
                data-testid="reward-rule-starts-at"
              />
            </Field>
            <Field label={t("rewards.ruleEndsAt")} name="ends_at" error={errors.ends_at}>
              <Input
                name="ends_at"
                type="datetime-local"
                value={form.ends_at ?? ""}
                onChange={(e) => set("ends_at", e.target.value || null)}
                data-testid="reward-rule-ends-at"
              />
            </Field>
            <Field
              label={t("rewards.ruleBranch")}
              name="branch_id"
              className="sm:col-span-2"
              error={errors.branch_id}
            >
              <Select
                name="branch_id"
                value={form.branch_id === null ? "" : String(form.branch_id)}
                onChange={(e) => set("branch_id", e.target.value === "" ? null : Number(e.target.value))}
                data-testid="reward-rule-branch"
              >
                <option value="">{t("rewards.ruleAllBranches")}</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="mt-3 flex gap-2">
            <Button size="sm" type="submit" disabled={pending} data-testid="reward-rule-save">
              {pending ? t("common.saving") : t("rewards.ruleSave")}
            </Button>
            <Button
              size="sm"
              type="button"
              variant="ghost"
              onClick={() => setEditing(null)}
              disabled={pending}
            >
              {t("rewards.ruleCancel")}
            </Button>
          </div>
        </form>
      ) : null}

      {rules.length === 0 ? (
        <EmptyState title={t("rewards.ruleEmptyTitle")} description={t("rewards.ruleEmptyDesc")} />
      ) : (
        <ul className="space-y-2.5">
          {rules.map((rule) => (
            <li
              key={rule.id}
              className="rounded-xl border border-border-strong p-3.5"
              data-testid={`reward-rule-${rule.id}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium text-fg-base" data-testid={`reward-rule-name-${rule.id}`}>
                    {rule.name}
                  </p>
                  <p className="mt-0.5 text-xs text-fg-subtle">
                    {rule.fixed_points} + {rule.points_per_currency}/৳1 · ≥ ৳{rule.min_order_amount} ·{" "}
                    {t("rewards.rulePriority")} {rule.priority} ·{" "}
                    {rule.branch_name ?? t("rewards.ruleAllBranches")}
                  </p>
                </div>
                {/* Badge does not forward arbitrary props — the hook goes on a wrapper. */}
                <span data-testid={`reward-rule-state-${rule.id}`}>
                  <Badge tone={rule.is_archived ? "slate" : rule.is_active ? "green" : "red"}>
                    {rule.is_archived
                      ? t("rewards.ruleArchived")
                      : rule.is_active
                        ? t("rewards.active")
                        : t("rewards.ruleInactive")}
                  </Badge>
                </span>
              </div>

              {rule.is_archived ? null : (
                <div className="mt-2.5 flex flex-wrap gap-3 text-sm">
                  <button
                    type="button"
                    className="font-medium text-brand-600 hover:underline"
                    onClick={() => openEdit(rule)}
                    data-testid={`reward-rule-edit-${rule.id}`}
                  >
                    {t("rewards.ruleEdit")}
                  </button>
                  <button
                    type="button"
                    className="font-medium text-fg-base hover:underline"
                    onClick={() => toggle(rule)}
                    disabled={pending}
                    data-testid={`reward-rule-toggle-${rule.id}`}
                  >
                    {rule.is_active ? t("rewards.ruleDeactivate") : t("rewards.ruleActivate")}
                  </button>
                  <ConfirmModal
                    trigger={
                      <button
                        type="button"
                        className="font-medium text-red-600 hover:underline"
                        data-testid={`reward-rule-delete-${rule.id}`}
                      >
                        {t("rewards.ruleDelete")}
                      </button>
                    }
                    title={t("rewards.ruleConfirmDeleteTitle")}
                    description={t("rewards.ruleConfirmDeleteDesc")}
                    confirmLabel={t("rewards.ruleDelete")}
                    action={async () => deleteEarningRuleAction(rule.id)}
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
