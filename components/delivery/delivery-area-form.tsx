"use client";

import Link from "next/link";
import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox, Field, Input, Select } from "@/components/ui/input";
import type { DeliveryAreaRow } from "@/lib/delivery-areas/query";
import { useTranslation } from "@/lib/i18n/use-translation";
import { parseFieldErrors, type FieldErrors } from "@/lib/validation/contract";
import { LIMITS } from "@/lib/validation/limits";
import {
  integer,
  max,
  maxLength,
  min,
  minLength,
  money,
  required,
  selectRequired,
} from "@/lib/validation/rules";
import {
  useFormValidation,
  type FieldRules,
} from "@/lib/validation/use-form-validation";

export interface DeliveryAreaBranchOption {
  id: number;
  name: string;
}

const BASE_RULES: FieldRules = {
  name: [
    required,
    minLength(LIMITS.nameMin),
    maxLength(LIMITS.nameMax),
  ],
  estimated_delivery_minutes: [
    required,
    integer,
    min(LIMITS.minutesMin),
    max(LIMITS.minutesMax),
  ],
  delivery_charge: [required, money],
};

function safeListReturn(value: string | undefined, listPath: string): string {
  if (!value) return listPath;
  return value === listPath || value.startsWith(`${listPath}?`)
    ? value
    : listPath;
}

function withResult(href: string, result: "created" | "updated"): string {
  const [path, query = ""] = href.split("?", 2);
  const params = new URLSearchParams(query);
  params.set("result", result);
  return `${path}?${params}`;
}

export function DeliveryAreaForm({
  mode,
  listPath,
  isSuperAdmin,
  branches = [],
  assignedBranch,
  initial = null,
  returnTo,
}: {
  mode: "create" | "edit";
  listPath: string;
  isSuperAdmin: boolean;
  branches?: DeliveryAreaBranchOption[];
  assignedBranch?: DeliveryAreaBranchOption | null;
  initial?: DeliveryAreaRow | null;
  returnTo?: string;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(initial?.name ?? "");
  const [minutes, setMinutes] = useState(
    String(initial?.estimated_delivery_minutes ?? 45),
  );
  const [charge, setCharge] = useState(initial?.delivery_charge ?? "0");
  const [branchId, setBranchId] = useState(
    initial ? String(initial.branch) : "",
  );
  const [isActive, setIsActive] = useState(initial?.is_active ?? true);
  const [serverErrors, setServerErrors] = useState<FieldErrors>({});
  const [submissionId, setSubmissionId] = useState(0);
  const [formError, setFormError] = useState<string | null>(null);
  const cancelHref = safeListReturn(returnTo, listPath);
  const rules = isSuperAdmin && mode === "create"
    ? { ...BASE_RULES, branch_id: [selectRequired] }
    : BASE_RULES;

  const submit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setFormError(null);
      startTransition(async () => {
        const editing = mode === "edit" && initial;
        const response = await fetch(
          editing
            ? `/api/delivery-areas/${initial.id}`
            : "/api/delivery-areas",
          {
            method: editing ? "PATCH" : "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              name: name.trim(),
              estimated_delivery_minutes: minutes,
              delivery_charge: charge,
              is_active: isActive,
              ...(isSuperAdmin && !editing
                ? { branch_id: Number(branchId) }
                : {}),
            }),
          },
        );
        const body = (await response.json().catch(() => ({}))) as unknown;
        setSubmissionId((value) => value + 1);
        if (!response.ok) {
          const parsed = parseFieldErrors(body, t("common.error"));
          setServerErrors(parsed.fieldErrors);
          setFormError(parsed.formError);
          return;
        }
        setServerErrors({});
        if (editing) {
          router.replace(withResult(cancelHref, "updated"));
          return;
        }
        const visibleBranch = Number(branchId || assignedBranch?.id);
        const params = new URLSearchParams({
          search: name.trim(),
          result: "created",
        });
        if (isSuperAdmin && visibleBranch) {
          params.set("branch", String(visibleBranch));
        }
        router.replace(`${listPath}?${params.toString()}`);
      });
    },
    [
      assignedBranch?.id,
      branchId,
      cancelHref,
      charge,
      initial,
      isActive,
      isSuperAdmin,
      listPath,
      minutes,
      mode,
      name,
      router,
      t,
    ],
  );

  const { errors, formProps } = useFormValidation(rules, {
    onSubmitValid: submit,
    pending,
    serverErrors,
    serverFormError: formError,
    submissionId,
  });

  const isEdit = mode === "edit";
  const title = isEdit ? t("deliveryArea.editTitle") : t("deliveryArea.addTitle");
  const subtitle = isEdit
    ? t("deliveryArea.editSub")
    : t("deliveryArea.addPageSub");
  const branchContext =
    initial?.branch_name ?? assignedBranch?.name ?? null;

  return (
    <>
      <nav
        aria-label={t("deliveryArea.breadcrumb")}
        className="mb-3 flex flex-wrap items-center gap-2 text-sm text-fg-muted"
      >
        <Link className="hover:text-brand-500" href={listPath}>
          {t("deliveryArea.title")}
        </Link>
        <span aria-hidden>›</span>
        <span aria-current="page" className="text-fg-base">
          {title}
        </span>
      </nav>

      <PageHeader
        title={title}
        subtitle={subtitle}
        action={
          <ButtonLink
            href={cancelHref}
            variant="outline"
            className="w-full sm:w-auto"
          >
            {t("deliveryArea.backToAreas")}
          </ButtonLink>
        }
      />

      <Card className="max-w-2xl">
        <CardHeader
          title={t("deliveryArea.formDetails")}
          subtitle={t("deliveryArea.formHint")}
        />
        <CardContent>
          <form {...formProps} className="space-y-5">
            <Alert tone="error" message={formError} />

            {isSuperAdmin && !isEdit ? (
              <Field
                label={t("deliveryArea.branch")}
                name="branch_id"
                required
                error={errors.branch_id}
              >
                <Select
                  name="branch_id"
                  value={branchId}
                  onChange={(event) => setBranchId(event.target.value)}
                >
                  <option value="">{t("deliveryArea.selectBranch")}</option>
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : (
              <div className="rounded-xl border border-border-base bg-surface-muted px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">
                  {t("deliveryArea.branch")}
                </p>
                <p className="mt-1 font-medium text-fg-base">
                  {branchContext ?? t("common.notAssigned")}
                </p>
              </div>
            )}

            {isEdit && initial ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-fg-muted">
                  {t("deliveryArea.deliveryState")}:
                </span>
                <Badge dot tone={initial.is_held ? "red" : "green"}>
                  {initial.is_held
                    ? t("deliveryArea.onHold")
                    : t("deliveryArea.available")}
                </Badge>
              </div>
            ) : null}

            <Field
              label={t("deliveryArea.name")}
              name="name"
              required
              error={errors.name}
            >
              <Input
                name="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={t("deliveryArea.namePlaceholder")}
                maxLength={LIMITS.nameMax}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label={t("deliveryArea.minutes")}
                name="estimated_delivery_minutes"
                required
                error={errors.estimated_delivery_minutes}
              >
                <Input
                  name="estimated_delivery_minutes"
                  type="number"
                  inputMode="numeric"
                  min={LIMITS.minutesMin}
                  max={LIMITS.minutesMax}
                  step={1}
                  value={minutes}
                  onChange={(event) => setMinutes(event.target.value)}
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
                  type="text"
                  inputMode="decimal"
                  value={charge}
                  onChange={(event) => setCharge(event.target.value)}
                />
              </Field>
            </div>

            <Checkbox
              name="is_active"
              checked={isActive}
              onChange={(event) => setIsActive(event.target.checked)}
              label={t("deliveryArea.activeLabel")}
            />

            <div className="flex flex-col-reverse gap-3 border-t border-border-base pt-5 sm:flex-row sm:justify-end">
              <ButtonLink href={cancelHref} variant="outline">
                {t("common.cancel")}
              </ButtonLink>
              <Button type="submit" disabled={pending}>
                {pending
                  ? t("common.saving")
                  : isEdit
                    ? t("deliveryArea.saveChanges")
                    : t("deliveryArea.createArea")}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </>
  );
}
