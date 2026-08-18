"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { fileComplaintAction } from "@/lib/api/actions";
import { COMPLAINT_CATEGORIES, COMPLAINT_RECIPIENTS } from "@/lib/constants/enums";
import { useTranslation } from "@/lib/i18n/use-translation";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import type { FieldErrors } from "@/lib/validation/contract";
import { LIMITS } from "@/lib/validation/limits";
import { maxLength, oneOf, required, selectRequired } from "@/lib/validation/rules";
import { useFormValidation, type FieldRules } from "@/lib/validation/use-form-validation";

interface OrderOption {
  id: number;
  branch: number;
  label: string;
}

const RULES: FieldRules = {
  recipient_role: [selectRequired, oneOf(COMPLAINT_RECIPIENTS)],
  category: [selectRequired, oneOf(COMPLAINT_CATEGORIES)],
  subject: [required, maxLength(150)],
  message: [required, maxLength(LIMITS.longTextMax)],
};

/** Dedicated "file a complaint" form (JS-validated, no browser default). */
export function ComplaintForm({ orders }: { orders: OrderOption[] }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [pending, start] = useTransition();

  const [recipient, setRecipient] = useState("");
  const [category, setCategory] = useState("");
  const [orderId, setOrderId] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [apiError, setApiError] = useState<string | null>(null);
  const [serverErrors, setServerErrors] = useState<FieldErrors>({});
  const [submissionId, setSubmissionId] = useState(0);

  /** Runs only after every client rule passed. */
  const submit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setApiError(null);
      const selectedOrder = orders.find((o) => String(o.id) === orderId);
      start(async () => {
        const res = await fileComplaintAction({
          recipient_role: recipient,
          category,
          subject: subject.trim(),
          message: message.trim(),
          order_id: selectedOrder?.id ?? null,
          branch_id: selectedOrder?.branch ?? null,
        });
        setSubmissionId((n) => n + 1);
        setServerErrors(res.fieldErrors ?? {});
        if (res.error || Object.keys(res.fieldErrors ?? {}).length > 0) {
          // Every typed value stays exactly as it was.
          setApiError(res.error);
          return;
        }
        if (res.complaintId) router.push(`/complaints/${res.complaintId}`);
      });
    },
    [category, message, orderId, orders, recipient, router, subject],
  );

  const { errors, formProps } = useFormValidation(RULES, {
    onSubmitValid: submit,
    serverErrors,
    submissionId,
    pending,
  });

  return (
    <form {...formProps} className="space-y-4">
      <Alert tone="error" message={apiError} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label={t("complaints.recipient")}
          name="recipient_role"
          required
          error={errors.recipient_role}
        >
          <Select name="recipient_role" value={recipient} onChange={(e) => setRecipient(e.target.value)}>
            <option value="">{t("complaints.selectRecipient")}</option>
            {COMPLAINT_RECIPIENTS.map((r) => (
              <option key={r} value={r}>
                {t(`roles.${r}`)}
              </option>
            ))}
          </Select>
        </Field>

        <Field label={t("complaints.category")} name="category" required error={errors.category}>
          <Select name="category" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">{t("complaints.selectCategory")}</option>
            {COMPLAINT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {t(`complaintCategory.${c}`)}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {orders.length > 0 ? (
        <Field label={t("complaints.relatedOrder")} name="order_id" error={errors.order_id}>
          <Select name="order_id" value={orderId} onChange={(e) => setOrderId(e.target.value)}>
            <option value="">{t("complaints.noOrder")}</option>
            {orders.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}

      <Field label={t("complaints.subject")} name="subject" required error={errors.subject}>
        <Input name="subject" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={150} />
      </Field>

      <Field label={t("complaints.message")} name="message" required error={errors.message}>
        <Textarea name="message" rows={5} value={message} onChange={(e) => setMessage(e.target.value)} />
      </Field>

      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          {t("common.cancel")}
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? t("common.saving") : t("complaints.submit")}
        </Button>
      </div>
    </form>
  );
}
