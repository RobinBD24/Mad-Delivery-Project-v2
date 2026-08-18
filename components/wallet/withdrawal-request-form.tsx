"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { requestWithdrawalAction } from "@/lib/api/actions";
import { useTranslation } from "@/lib/i18n/use-translation";
import { Field, Input } from "@/components/ui/input";
import type { FieldErrors } from "@/lib/validation/contract";
import { money, positive, required } from "@/lib/validation/rules";
import { useFormValidation, type FieldRules } from "@/lib/validation/use-form-validation";

const RULES: FieldRules = {
  amount: [required, money, positive],
  note: [],
};

/** Rider's withdrawal request form (JS-validated against the shown balance). */
export function WithdrawalRequestForm({ availableBalance }: { availableBalance: string }) {
  const { t, fmt } = useTranslation();
  const router = useRouter();
  const [pending, start] = useTransition();

  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [serverErrors, setServerErrors] = useState<FieldErrors>({});
  const [submissionId, setSubmissionId] = useState(0);

  const available = Number(availableBalance);

  /** Balance ceiling — the server re-checks it against the real wallet. */
  const validateBalance = useCallback(
    (values: Record<string, string>): FieldErrors => {
      const value = Number(values.amount);
      if (values.amount && Number.isFinite(value) && value > available) {
        return { amount: t("wallet.errExceedsBalance", { balance: fmt.money(available) }) };
      }
      return {};
    },
    [available, fmt, t],
  );

  const submit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setError(null);
      setSuccess(null);
      start(async () => {
        const res = await requestWithdrawalAction(String(Number(amount)), note.trim());
        setSubmissionId((n) => n + 1);
        setServerErrors(res.fieldErrors ?? {});
        if (res.error || Object.keys(res.fieldErrors ?? {}).length > 0) {
          setError(res.error);
          return;
        }
        setSuccess(res.success ?? null);
        // Cleared ONLY after the request was accepted.
        setAmount("");
        setNote("");
        router.refresh();
      });
    },
    [amount, note, router],
  );

  const { errors, formProps } = useFormValidation(RULES, {
    validate: validateBalance,
    onSubmitValid: submit,
    serverErrors,
    submissionId,
    pending,
  });

  return (
    <form {...formProps} className="space-y-4">
      <Alert tone="error" message={error} />
      {Object.keys(errors).length === 0 ? <Alert tone="success" message={success} /> : null}

      <Field
        label={t("wallet.amountLabel")}
        name="amount"
        required
        hint={t("wallet.availableHint", { balance: fmt.money(available) })}
        error={errors.amount}
      >
        <Input
          name="amount"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00"
        />
      </Field>

      <Field label={t("wallet.noteLabel")} name="note" error={errors.note}>
        <Input
          name="note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t("wallet.notePlaceholder")}
          maxLength={120}
        />
      </Field>

      <Button type="submit" disabled={pending || available <= 0} className="w-full">
        {pending ? t("common.saving") : t("wallet.requestWithdrawal")}
      </Button>
    </form>
  );
}
