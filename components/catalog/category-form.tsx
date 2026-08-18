"use client";

import { useActionState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button, ButtonLink } from "@/components/ui/button";
import { Checkbox, Field, Input, Textarea } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { initialActionState } from "@/lib/api/action-state";
import { saveCategoryAction } from "@/lib/api/actions";
import { useTranslation } from "@/lib/i18n/use-translation";
import { LIMITS } from "@/lib/validation/limits";
import { maxLength, minLength, required } from "@/lib/validation/rules";
import { useFormValidation, type FieldRules } from "@/lib/validation/use-form-validation";
import type { Category } from "@/types";

const RULES: FieldRules = {
  name: [required, minLength(LIMITS.nameMin), maxLength(LIMITS.nameMax)],
  description: [maxLength(LIMITS.longTextMax)],
};

export function CategoryForm({ category }: { category?: Category }) {
  const { t } = useTranslation();
  const action = saveCategoryAction.bind(null, category?.id ?? null);
  const [state, formAction, pending] = useActionState(action, initialActionState);
  // A duplicate category name comes back as `name` and lands under that field.
  const { errors, formProps } = useFormValidation(RULES, {
    serverErrors: state.fieldErrors,
    submissionId: state.submissionId,
    pending,
  });

  return (
    <form action={formAction} className="max-w-xl space-y-4" {...formProps}>
      <Alert tone="error" message={state.error} />

      <Field label={t("catalog.categoryName")} name="name" required error={errors.name}>
        <Input name="name" required defaultValue={category?.name} placeholder={t("catalog.categoryNamePlaceholder")} />
      </Field>
      <Field label={t("catalog.description")} name="description" error={errors.description}>
        <Textarea name="description" defaultValue={category?.description} rows={3} />
      </Field>
      <Checkbox name="is_active" label={t("common.active")} defaultChecked={category?.is_active ?? true} />

      <div className="flex gap-3 pt-2">
        <Button type="submit" disabled={pending}>
          {pending ? <Spinner className="size-4 border-white/40 border-t-white" /> : null}
          {category ? t("common.update") : t("catalog.createCategory")}
        </Button>
        <ButtonLink href="/branch-manager/catalog" variant="outline">
          {t("common.cancel")}
        </ButtonLink>
      </div>
    </form>
  );
}
