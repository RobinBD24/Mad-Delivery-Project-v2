"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  generateSettlementAction,
  processRefundAction,
  recordAdjustmentAction,
  recordExpenseAction,
} from "@/lib/api/actions";
import { useTranslation } from "@/lib/i18n/use-translation";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import type { FieldErrors } from "@/lib/validation/contract";
import { LIMITS } from "@/lib/validation/limits";
import {
  date as dateRule,
  integer,
  maxLength,
  min,
  money,
  notFuture,
  oneOf,
  positive,
  required,
  selectRequired,
} from "@/lib/validation/rules";
import { useFormValidation, type FieldRules } from "@/lib/validation/use-form-validation";

export interface BranchOption {
  id: number;
  name: string;
}

const EXPENSE_CATEGORIES = ["rent", "utilities", "salary", "maintenance", "inventory", "delivery", "other"];
const ADJUSTMENT_TYPES = ["credit", "debit"];

const REFUND_RULES: FieldRules = {
  order_id: [required, integer, min(1)],
  amount: [required, money, positive],
  reason: [required, maxLength(LIMITS.longTextMax)],
};

const EXPENSE_RULES: FieldRules = {
  branch_id: [selectRequired],
  category: [required, oneOf(EXPENSE_CATEGORIES)],
  amount: [required, money, positive],
  // An expense is recorded for a day that has already happened.
  expense_date: [required, dateRule, notFuture],
  note: [maxLength(LIMITS.longTextMax)],
};

const ADJUSTMENT_RULES: FieldRules = {
  type: [required, oneOf(ADJUSTMENT_TYPES)],
  amount: [required, money, positive],
  note: [required, maxLength(LIMITS.longTextMax)],
};

const SETTLEMENT_RULES: FieldRules = {
  branch_id: [selectRequired],
  date: [required, dateRule, notFuture],
};

/** Refund form — order id + amount + reason (JS-validated). */
export function RefundForm() {
  const { t } = useTranslation();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [orderId, setOrderId] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [serverErrors, setServerErrors] = useState<FieldErrors>({});
  const [submissionId, setSubmissionId] = useState(0);

  const submit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setError(null);
      setSuccess(null);
      start(async () => {
        const res = await processRefundAction({ order_id: Number(orderId), amount, reason: reason.trim() });
        setSubmissionId((n) => n + 1);
        // "Order not found" / "refund exceeds the order total" come back keyed
        // by field and are shown under that field.
        setServerErrors(res.fieldErrors ?? {});
        if (res.error || Object.keys(res.fieldErrors ?? {}).length > 0) {
          setError(res.error);
          return;
        }
        setSuccess(res.success ?? null);
        setOrderId("");
        setAmount("");
        setReason("");
        router.refresh();
      });
    },
    [amount, orderId, reason, router],
  );

  const { errors, formProps } = useFormValidation(REFUND_RULES, {
    onSubmitValid: submit,
    serverErrors,
    submissionId,
    pending,
  });

  return (
    <form {...formProps} className="space-y-3">
      <Alert tone="error" message={error} />
      {Object.keys(errors).length === 0 ? <Alert tone="success" message={success} /> : null}
      <Field label={t("financials.orderIdLabel")} name="order_id" required error={errors.order_id}>
        <Input name="order_id" inputMode="numeric" value={orderId} onChange={(e) => setOrderId(e.target.value)} />
      </Field>
      <Field label={t("wallet.amountLabel")} name="amount" required error={errors.amount}>
        <Input name="amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </Field>
      <Field label={t("financials.reasonLabel")} name="reason" required error={errors.reason}>
        <Textarea name="reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? t("common.saving") : t("financials.processRefund")}
      </Button>
    </form>
  );
}

/** Branch expense form. */
export function ExpenseForm({ branches }: { branches: BranchOption[] }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [branchId, setBranchId] = useState(branches[0] ? String(branches[0].id) : "");
  const [category, setCategory] = useState("rent");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [serverErrors, setServerErrors] = useState<FieldErrors>({});
  const [submissionId, setSubmissionId] = useState(0);

  const submit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setError(null);
      setSuccess(null);
      start(async () => {
        const res = await recordExpenseAction({
          branch_id: Number(branchId),
          category,
          amount,
          note: note.trim(),
          expense_date: date,
        });
        setSubmissionId((n) => n + 1);
        setServerErrors(res.fieldErrors ?? {});
        if (res.error || Object.keys(res.fieldErrors ?? {}).length > 0) {
          setError(res.error);
          return;
        }
        setSuccess(res.success ?? null);
        setAmount("");
        setNote("");
        router.refresh();
      });
    },
    [amount, branchId, category, date, note, router],
  );

  const { errors, formProps } = useFormValidation(EXPENSE_RULES, {
    onSubmitValid: submit,
    serverErrors,
    submissionId,
    pending,
  });

  return (
    <form {...formProps} className="space-y-3">
      <Alert tone="error" message={error} />
      {Object.keys(errors).length === 0 ? <Alert tone="success" message={success} /> : null}
      <Field label={t("financials.branchLabel")} name="branch_id" required error={errors.branch_id}>
        <Select name="branch_id" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </Select>
      </Field>
      <Field label={t("financials.categoryLabel")} name="category" required error={errors.category}>
        <Select name="category" value={category} onChange={(e) => setCategory(e.target.value)}>
          {EXPENSE_CATEGORIES.map((c) => (
            <option key={c} value={c}>{t(`financials.cat_${c}`)}</option>
          ))}
        </Select>
      </Field>
      <Field label={t("wallet.amountLabel")} name="amount" required error={errors.amount}>
        <Input name="amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </Field>
      <Field label={t("financials.dateLabel")} name="expense_date" required error={errors.expense_date}>
        <Input name="expense_date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <Field label={t("financials.noteLabel")} name="note" error={errors.note}>
        <Input name="note" value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? t("common.saving") : t("financials.recordExpense")}
      </Button>
    </form>
  );
}

/** Manual adjustment form (credit/debit). */
export function AdjustmentForm({ branches }: { branches: BranchOption[] }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [type, setType] = useState("credit");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [branchId, setBranchId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [serverErrors, setServerErrors] = useState<FieldErrors>({});
  const [submissionId, setSubmissionId] = useState(0);

  const submit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setError(null);
      setSuccess(null);
      start(async () => {
        const res = await recordAdjustmentAction({
          type,
          amount,
          note: note.trim(),
          branch_id: branchId ? Number(branchId) : null,
        });
        setSubmissionId((n) => n + 1);
        setServerErrors(res.fieldErrors ?? {});
        if (res.error || Object.keys(res.fieldErrors ?? {}).length > 0) {
          setError(res.error);
          return;
        }
        setSuccess(res.success ?? null);
        setAmount("");
        setNote("");
        router.refresh();
      });
    },
    [amount, branchId, note, router, type],
  );

  const { errors, formProps } = useFormValidation(ADJUSTMENT_RULES, {
    onSubmitValid: submit,
    serverErrors,
    submissionId,
    pending,
  });

  return (
    <form {...formProps} className="space-y-3">
      <Alert tone="error" message={error} />
      {Object.keys(errors).length === 0 ? <Alert tone="success" message={success} /> : null}
      <Field label={t("financials.typeLabel")} name="type" required error={errors.type}>
        <Select name="type" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="credit">{t("financials.credit")}</option>
          <option value="debit">{t("financials.debit")}</option>
        </Select>
      </Field>
      <Field label={t("wallet.amountLabel")} name="amount" required error={errors.amount}>
        <Input name="amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </Field>
      <Field label={t("financials.branchLabel")} name="branch_id" error={errors.branch_id}>
        <Select name="branch_id" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
          <option value="">{t("financials.noBranch")}</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </Select>
      </Field>
      <Field label={t("financials.noteLabel")} name="note" required error={errors.note}>
        <Input name="note" value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? t("common.saving") : t("financials.recordAdjustment")}
      </Button>
    </form>
  );
}

/** End-of-day settlement generator. */
export function SettlementForm({ branches }: { branches: BranchOption[] }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [branchId, setBranchId] = useState(branches[0] ? String(branches[0].id) : "");
  const [date, setDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [serverErrors, setServerErrors] = useState<FieldErrors>({});
  const [submissionId, setSubmissionId] = useState(0);

  const submit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setError(null);
      setSuccess(null);
      start(async () => {
        const res = await generateSettlementAction({ branch_id: Number(branchId), date });
        setSubmissionId((n) => n + 1);
        // "Already settled for this date" arrives keyed by field.
        setServerErrors(res.fieldErrors ?? {});
        if (res.error || Object.keys(res.fieldErrors ?? {}).length > 0) {
          setError(res.error);
          return;
        }
        setSuccess(res.success ?? null);
        router.refresh();
      });
    },
    [branchId, date, router],
  );

  const { errors, formProps } = useFormValidation(SETTLEMENT_RULES, {
    onSubmitValid: submit,
    serverErrors,
    submissionId,
    pending,
  });

  return (
    <form {...formProps} className="space-y-3">
      <Alert tone="error" message={error} />
      {Object.keys(errors).length === 0 ? <Alert tone="success" message={success} /> : null}
      <Field label={t("financials.branchLabel")} name="branch_id" required error={errors.branch_id}>
        <Select name="branch_id" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </Select>
      </Field>
      <Field label={t("financials.dateLabel")} name="date" required error={errors.date}>
        <Input name="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? t("common.saving") : t("financials.generate")}
      </Button>
    </form>
  );
}
