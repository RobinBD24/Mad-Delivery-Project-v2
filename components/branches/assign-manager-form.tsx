"use client";

import { useCallback, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/field-error";
import { Field, Input, Select } from "@/components/ui/input";
import { assignManagerAction } from "@/lib/api/actions";
import { useTranslation } from "@/lib/i18n/use-translation";
import type { FieldErrors } from "@/lib/validation/contract";
import { LIMITS } from "@/lib/validation/limits";
import { maxLength } from "@/lib/validation/rules";
import { useFormValidation, type FieldRules } from "@/lib/validation/use-form-validation";

// Clearing the manager is a valid choice, so `manager_id` is deliberately optional.
const RULES: FieldRules = { notes: [maxLength(LIMITS.longTextMax)] };

/** Super Admin: assign / change / remove a branch's manager. */
export function AssignManagerForm({
  branchId,
  currentManagerId,
  managers,
}: {
  branchId: number;
  currentManagerId: number | null;
  managers: { id: number; name: string }[];
}) {
  const { t } = useTranslation();
  const [managerId, setManagerId] = useState(currentManagerId ? String(currentManagerId) : "");
  const [notes, setNotes] = useState("");
  const [feedback, setFeedback] = useState<{ error: string | null; success?: string }>({ error: null });
  const [serverErrors, setServerErrors] = useState<FieldErrors>({});
  const [submissionId, setSubmissionId] = useState(0);
  const [pending, startTransition] = useTransition();

  const save = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      startTransition(async () => {
        const result = await assignManagerAction(branchId, managerId ? Number(managerId) : null, notes);
        setSubmissionId((n) => n + 1);
        setServerErrors(result.fieldErrors ?? {});
        setFeedback(result);
        // The note is cleared only after a confirmed save.
        if (!result.error && Object.keys(result.fieldErrors ?? {}).length === 0) setNotes("");
      });
    },
    [branchId, managerId, notes],
  );

  const { errors, formProps } = useFormValidation(RULES, {
    onSubmitValid: save,
    serverErrors,
    submissionId,
    pending,
  });

  return (
    <form {...formProps} className="space-y-3">
      <Field label={t("branches.assignManager")} name="manager_id" error={errors.manager_id}>
        <Select name="manager_id" value={managerId} onChange={(e) => setManagerId(e.target.value)}>
          <option value="">{t("branches.noManager")}</option>
          {managers.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={t("branches.notePlaceholder")} name="notes" error={errors.notes}>
        <Input
          name="notes"
          placeholder={t("branches.notePlaceholder")}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </Field>
      <Button type="submit" size="sm" variant="secondary" disabled={pending} className="w-full">
        {pending ? t("branches.saving") : t("branches.updateManager")}
      </Button>
      <FormError message={feedback.error} />
      {feedback.success && Object.keys(errors).length === 0 ? (
        <p className="text-sm text-emerald-600">{feedback.success}</p>
      ) : null}
    </form>
  );
}
