"use client";

import { useActionState, useEffect, useRef } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { publishNoticeAction } from "@/lib/api/actions";
import { initialActionState } from "@/lib/api/action-state";
import { NOTICE_AUDIENCES } from "@/lib/constants/enums";
import { useTranslation } from "@/lib/i18n/use-translation";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { LIMITS } from "@/lib/validation/limits";
import { maxLength, oneOf, required } from "@/lib/validation/rules";
import { useFormValidation, type FieldRules } from "@/lib/validation/use-form-validation";

const RULES: FieldRules = {
  title: [required, maxLength(150)],
  audience: [required, oneOf(NOTICE_AUDIENCES)],
  body: [required, maxLength(LIMITS.longTextMax)],
};

/** Broadcast composer for super admin (notices) / marketing (offers). */
export function NoticeComposer() {
  const { t } = useTranslation();
  const [state, action, pending] = useActionState(publishNoticeAction, initialActionState);
  const formRef = useRef<HTMLFormElement>(null);
  const { errors, formProps, reset } = useFormValidation(RULES, {
    serverErrors: state.fieldErrors,
    submissionId: state.submissionId,
    pending,
  });

  useEffect(() => {
    // Cleared ONLY after a confirmed publish — a rejected notice keeps its text.
    if (state.success) {
      formRef.current?.reset();
      reset();
    }
  }, [state.success, reset]);

  return (
    <form ref={formRef} action={action} className="space-y-4" {...formProps}>
      <Alert tone="error" message={state.error} />
      {Object.keys(errors).length === 0 ? <Alert tone="success" message={state.success} /> : null}

      <Field label={t("notices.subject")} name="title" required error={errors.title}>
        <Input name="title" maxLength={150} />
      </Field>

      <Field label={t("notices.audience")} name="audience" required error={errors.audience}>
        <Select name="audience" defaultValue="all">
          {NOTICE_AUDIENCES.map((a) => (
            <option key={a} value={a}>
              {a === "all" ? t("notices.everyone") : t(`roles.${a}`)}
            </option>
          ))}
        </Select>
      </Field>

      <Field label={t("notices.body")} name="body" required error={errors.body}>
        <Textarea name="body" rows={4} />
      </Field>

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? t("common.saving") : t("notices.publish")}
        </Button>
      </div>
    </form>
  );
}
