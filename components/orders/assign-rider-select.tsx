"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
import { Select } from "@/components/ui/input";
import { assignOrderRiderAction } from "@/lib/api/actions";
import { useTranslation } from "@/lib/i18n/use-translation";

/** BM/Super Admin widget: assign a rider to an order. */
export function AssignRiderSelect({
  orderId,
  currentRiderId,
  riders,
}: {
  orderId: number;
  currentRiderId: number | null;
  riders: { id: number; name: string }[];
}) {
  const { t } = useTranslation();
  const [riderId, setRiderId] = useState<string>(currentRiderId ? String(currentRiderId) : "");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [riderError, setRiderError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      const result = await assignOrderRiderAction(orderId, riderId ? Number(riderId) : null);
      const failed = Boolean(result.error) || Object.keys(result.fieldErrors ?? {}).length > 0;
      // "Rider is off duty" / "not eligible for this branch" arrive keyed
      // `rider_id` and are shown under the dropdown.
      setRiderError(result.fieldErrors?.rider_id ?? null);
      setError(result.fieldErrors?.rider_id ? null : result.error);
      setMessage(failed ? null : (result.success ?? null));
    });
  }

  return (
    // Unassigning is valid, so the dropdown has no required rule; the server
    // validates the rider's duty state and branch eligibility.
    <form onSubmit={save} noValidate className="space-y-2">
      <div className="flex items-center gap-2">
        <Select
          name="rider_id"
          value={riderId}
          onChange={(e) => {
            setRiderId(e.target.value);
            if (riderError) setRiderError(null);
          }}
          className="max-w-56"
          aria-label={t("orders.selectRider")}
          aria-invalid={Boolean(riderError)}
          aria-describedby={riderError ? `order-${orderId}-rider-error` : undefined}
        >
          <option value="">{t("orders.selectRider")}</option>
          {riders.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </Select>
        <Button type="submit" size="sm" variant="secondary" disabled={pending}>
          {t("orders.assign")}
        </Button>
      </div>
      <FieldError id={`order-${orderId}-rider-error`} message={riderError} />
      {error ? <p className="text-sm font-medium text-red-600 dark:text-red-400" role="alert">{error}</p> : null}
      {message ? <p className="text-sm text-emerald-600">{message}</p> : null}
    </form>
  );
}
