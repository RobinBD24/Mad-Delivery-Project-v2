"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { adminCreateCategoryAction } from "@/lib/api/actions";
import { initialActionState } from "@/lib/api/action-state";
import { useTranslation } from "@/lib/i18n/use-translation";
import { LIMITS } from "@/lib/validation/limits";
import { maxLength, minLength, required, selectRequired } from "@/lib/validation/rules";
import { useFormValidation, type FieldRules } from "@/lib/validation/use-form-validation";

const RULES: FieldRules = {
  branch_id: [selectRequired],
  name: [required, minLength(LIMITS.nameMin), maxLength(80)],
  description: [maxLength(LIMITS.longTextMax)],
};

/** Super admin creates a product category for any branch. */
export function AdminCategoryForm({ branches }: { branches: { id: number; name: string }[] }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [state, action, pending] = useActionState(adminCreateCategoryAction, initialActionState);
  const formRef = useRef<HTMLFormElement>(null);
  // A duplicate name comes back keyed `name` and is shown under that field.
  const { errors, formProps, reset } = useFormValidation(RULES, {
    serverErrors: state.fieldErrors,
    submissionId: state.submissionId,
    pending,
  });

  useEffect(() => {
    // Reset ONLY after a confirmed success — a failed submit keeps every value.
    if (state.success) {
      formRef.current?.reset();
      reset();
      router.refresh();
    }
  }, [state.success, router, reset]);

  return (
    <form ref={formRef} action={action} className="space-y-4" {...formProps}>
      <Alert tone="error" message={state.error} />
      {Object.keys(errors).length === 0 ? <Alert tone="success" message={state.success} /> : null}

      {/* req #8 — "Main Branch (Global)" (value "global") makes the category
          available to every branch's product form; a specific branch scopes it. */}
      <Field label={t("adminExtras.branch")} name="branch_id" required error={errors.branch_id}>
        <Select name="branch_id" defaultValue="global" data-testid="category-branch-select">
          <option value="global">{t("adminExtras.mainBranchGlobal")}</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={t("adminExtras.categoryName")} name="name" required error={errors.name}>
        <Input name="name" maxLength={80} />
      </Field>
      <Field label={t("adminExtras.categoryDesc")} name="description" error={errors.description}>
        <Textarea name="description" rows={2} />
      </Field>
      <Button type="submit" disabled={pending}>
        {pending ? t("common.saving") : t("adminExtras.createCategory")}
      </Button>
    </form>
  );
}
