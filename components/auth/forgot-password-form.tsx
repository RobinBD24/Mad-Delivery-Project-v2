"use client";

import { useActionState } from "react";
import Link from "next/link";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/forms/password-input";
import { Field, Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { forgotPasswordAction, type AuthFormState } from "@/lib/auth/actions";
import { useTranslation } from "@/lib/i18n/use-translation";
import { email, matches, password as passwordRule, required } from "@/lib/validation/rules";
import { useFormValidation } from "@/lib/validation/use-form-validation";

const initialState: AuthFormState = { error: null, fieldErrors: {} };

/** Identical to the checks forgotPasswordAction runs server-side. */
const RULES = {
  username: [required],
  email: [required, email],
  password: [required, passwordRule],
  confirm_password: [required, matches("password")],
};

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(forgotPasswordAction, initialState);
  const { t } = useTranslation();
  const { errors, formProps } = useFormValidation(RULES, {
    serverErrors: state.fieldErrors,
    submissionId: state.submissionId,
    pending,
  });

  return (
    <form action={formAction} {...formProps} className="space-y-4">
      <Alert tone="error" message={state.error} />

      <Field label={t("auth.usernameLabel")} required error={errors.username}>
        <Input name="username" autoComplete="username" required aria-invalid={!!errors.username} />
      </Field>
      <Field label={t("auth.emailLabel")} required error={errors.email}>
        <Input name="email" type="email" autoComplete="email" required aria-invalid={!!errors.email} />
      </Field>
      <Field label={t("auth.newPassword")} required error={errors.password}>
        <PasswordInput name="password" autoComplete="new-password" placeholder="••••••••" required aria-invalid={!!errors.password} />
      </Field>
      <Field label={t("auth.confirmPassword")} required error={errors.confirm_password}>
        <PasswordInput name="confirm_password" autoComplete="new-password" placeholder="••••••••" required aria-invalid={!!errors.confirm_password} />
      </Field>

      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? <Spinner className="size-4 border-white/40 border-t-white" /> : null}
        {t("auth.resetButton")}
      </Button>

      <p className="text-center text-sm text-slate-500">
        <Link href="/login" className="font-semibold text-brand-600 hover:underline">
          {t("auth.backToLogin")}
        </Link>
      </p>
    </form>
  );
}
