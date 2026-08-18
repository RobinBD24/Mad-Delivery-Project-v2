"use client";

import { useActionState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button, ButtonLink } from "@/components/ui/button";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { initialActionState } from "@/lib/api/action-state";
import { saveBranchAction } from "@/lib/api/actions";
import { useTranslation } from "@/lib/i18n/use-translation";
import { LIMITS } from "@/lib/validation/limits";
import {
  afterTimeField,
  email as emailRule,
  max,
  min,
  number,
  oneOf,
  phone,
  required,
  time,
} from "@/lib/validation/rules";
import { useFormValidation, type FieldRules } from "@/lib/validation/use-form-validation";
import type { Branch } from "@/types";

const BRAND_TYPES = ["cheez", "madchef", "combined"];

const RULES: FieldRules = {
  name: [required],
  phone: [required, phone],
  brand_type: [required, oneOf(BRAND_TYPES)],
  address: [required],
  email: [emailRule],
  bkash_number: [phone],
  delivery_radius_km: [required, number, min(LIMITS.radiusMin), max(LIMITS.radiusMax)],
  opening_time: [time],
  // Closing must come after opening — the message lands on the closing field.
  closing_time: [time, afterTimeField("opening_time")],
};

const FILES = { logo: false };

/** Full-page create/edit form for a branch (super admin only). */
export function BranchForm({ branch }: { branch?: Branch }) {
  const { t } = useTranslation();
  const action = saveBranchAction.bind(null, branch?.id ?? null);
  const [state, formAction, pending] = useActionState(action, initialActionState);
  const { errors, formProps } = useFormValidation(RULES, {
    files: FILES,
    serverErrors: state.fieldErrors,
    submissionId: state.submissionId,
    pending,
  });

  return (
    <form action={formAction} className="space-y-4" {...formProps}>
      <Alert tone="error" message={state.error} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("branches.branchName")} required error={errors.name}>
          <Input name="name" required aria-invalid={!!errors.name} defaultValue={branch?.name} placeholder={t("branches.branchNamePlaceholder")} />
        </Field>
        <Field label={t("common.phone")} required hint={t("branches.phoneHint")} error={errors.phone}>
          <Input name="phone" required aria-invalid={!!errors.phone} defaultValue={branch?.phone} placeholder="01XXXXXXXXX" />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label={t("branches.brandType")}
          name="brand_type"
          required
          hint={t("branches.brandTypeHint")}
          error={errors.brand_type}
        >
          <Select name="brand_type" defaultValue={branch?.brand_type ?? "combined"}>
            <option value="cheez">{t("brands.cheez")}</option>
            <option value="madchef">{t("brands.madchef")}</option>
            <option value="combined">{t("brands.combined")}</option>
          </Select>
        </Field>
      </div>

      <Field label={t("common.address")} name="address" required error={errors.address}>
        <Textarea name="address" required defaultValue={branch?.address} rows={2} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("common.email")} name="email" error={errors.email}>
          <Input name="email" type="email" defaultValue={branch?.email ?? ""} />
        </Field>
        <Field label={t("branches.bkashNumber")} name="bkash_number" error={errors.bkash_number}>
          <Input name="bkash_number" defaultValue={branch?.bkash_number ?? ""} placeholder="01XXXXXXXXX" />
        </Field>
      </div>

      {/* req #2 — raw latitude/longitude text inputs are removed from the branch
          UI. Existing coordinates are preserved (hidden) so nearest-branch /
          coverage keeps working; the server validates any coordinates that
          enter and never trusts client-supplied distance/nearest values. */}
      <input type="hidden" name="latitude" defaultValue={branch?.latitude ?? ""} />
      <input type="hidden" name="longitude" defaultValue={branch?.longitude ?? ""} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label={t("branches.deliveryRadiusField")}
          hint={t("branches.deliveryRadiusHint")}
          error={errors.delivery_radius_km}
        >
          <Input
            name="delivery_radius_km"
            type="number"
            step="0.1"
            min="0.5"
            aria-invalid={!!errors.delivery_radius_km}
            defaultValue={branch?.delivery_radius_km ?? "3.0"}
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={t("branches.openingTime")} name="opening_time" error={errors.opening_time}>
          <Input name="opening_time" type="time" defaultValue={branch?.opening_time ?? ""} />
        </Field>
        <Field label={t("branches.closingTime")} name="closing_time" error={errors.closing_time}>
          <Input name="closing_time" type="time" defaultValue={branch?.closing_time ?? ""} />
        </Field>
        {/* Leaving this empty on edit keeps the branch's current logo. */}
        <Field
          label={t("branches.logo")}
          name="logo"
          hint={branch?.logo ? t("branches.logoKeepHint") : undefined}
          error={errors.logo}
        >
          <Input name="logo" type="file" accept="image/*" className="py-2" />
        </Field>
      </div>

      <input type="hidden" name="is_active" value="false" />
      <Checkbox
        name="is_active"
        value="true"
        label={t("branches.branchActive")}
        defaultChecked={branch?.is_active ?? true}
      />

      <div className="flex gap-3 pt-2">
        <Button type="submit" disabled={pending}>
          {pending ? <Spinner className="size-4 border-white/40 border-t-white" /> : null}
          {branch ? t("common.update") : t("branches.createBranch")}
        </Button>
        <ButtonLink href="/admin/branches" variant="outline">
          {t("common.cancel")}
        </ButtonLink>
      </div>
    </form>
  );
}
