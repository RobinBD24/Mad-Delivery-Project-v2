"use client";

import { useActionState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/forms/password-input";
import { Field } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { initialActionState } from "@/lib/api/action-state";
import { changePasswordAction } from "@/lib/api/actions";
import { useTranslation } from "@/lib/i18n/use-translation";
import { matches, password as passwordRule, required } from "@/lib/validation/rules";
import { useFormValidation } from "@/lib/validation/use-form-validation";

/** Same policy validatePassword() enforces on the server. */
const RULES = {
  old_password: [required],
  new_password: [required, passwordRule],
  confirm_password: [required, matches("new_password")],
};

export function PasswordForm() {
  const [state, formAction, pending] = useActionState(changePasswordAction, initialActionState);
  const { t } = useTranslation();
  // A wrong current password comes back keyed `old_password` and is shown
  // under that field — never as a bare "something went wrong".
  const { errors, formProps } = useFormValidation(RULES, {
    serverErrors: state.fieldErrors,
    submissionId: state.submissionId,
    pending,
  });

  return (
    <form action={formAction} {...formProps} className="space-y-4">
      <Alert tone="error" message={state.error} />
      {Object.keys(errors).length === 0 ? (
        <Alert tone="success" message={state.success} />
      ) : null}

      <Field label={t("profile.currentPassword")} required error={errors.old_password}>
        <PasswordInput name="old_password" required autoComplete="current-password" aria-invalid={!!errors.old_password} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("profile.newPassword")} required hint={t("auth.passwordHint")} error={errors.new_password}>
          <PasswordInput name="new_password" required autoComplete="new-password" aria-invalid={!!errors.new_password} />
        </Field>
        <Field label={t("profile.confirmNewPassword")} required error={errors.confirm_password}>
          <PasswordInput name="confirm_password" required autoComplete="new-password" aria-invalid={!!errors.confirm_password} />
        </Field>
      </div>

      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? <Spinner className="size-4 border-white/40 border-t-white" /> : null}
        {t("profile.changePasswordButton")}
      </Button>
    </form>
  );
}
