"use client";

import { useActionState, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { saveDeliveryFeeAction } from "@/lib/api/actions";
import { initialActionState } from "@/lib/api/action-state";
import { useTranslation } from "@/lib/i18n/use-translation";
import { money, required } from "@/lib/validation/rules";
import { useFormValidation, type FieldRules } from "@/lib/validation/use-form-validation";

const RULES: FieldRules = { commission_per_delivery: [required, money] };

/** Super admin form: per-delivery rider commission (Tk). JS-validated. */
export function DeliveryFeeForm({ current }: { current: string }) {
  const { t } = useTranslation();
  const [state, action, pending] = useActionState(saveDeliveryFeeAction, initialActionState);
  const [value, setValue] = useState(current);
  const { errors, formProps } = useFormValidation(RULES, {
    serverErrors: state.fieldErrors,
    submissionId: state.submissionId,
    pending,
  });

  return (
    <form action={action} {...formProps} className="space-y-4">
      <Alert tone="error" message={state.error} />
      {Object.keys(errors).length === 0 ? <Alert tone="success" message={state.success} /> : null}

      <Field
        label={t("wallet.feeLabel")}
        name="commission_per_delivery"
        required
        hint={t("wallet.feeHint")}
        error={errors.commission_per_delivery}
      >
        <div className="relative">
          <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-fg-subtle">
            ৳
          </span>
          <Input
            name="commission_per_delivery"
            inputMode="decimal"
            className="pl-8"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </div>
      </Field>

      <Button type="submit" disabled={pending}>
        {pending ? t("common.saving") : t("common.save")}
      </Button>
    </form>
  );
}
