"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { Field, Input } from "@/components/ui/input";
import {
  addTimeSlotAction,
  deleteTimeSlotAction,
  saveDeliverySettingsAction,
} from "@/lib/api/actions";
import { useTranslation } from "@/lib/i18n/use-translation";
import type { FieldErrors } from "@/lib/validation/contract";
import { LIMITS } from "@/lib/validation/limits";
import {
  afterTimeField,
  max,
  maxLength,
  min,
  number,
  range,
  required,
  time,
} from "@/lib/validation/rules";
import { useFormValidation, type FieldRules } from "@/lib/validation/use-form-validation";

const ZONE_RULES: FieldRules = {
  delivery_radius_km: [required, number, min(LIMITS.radiusMin), max(LIMITS.radiusMax)],
  latitude: [number, range(LIMITS.latMin, LIMITS.latMax)],
  longitude: [number, range(LIMITS.lngMin, LIMITS.lngMax)],
};

const HOURS_RULES: FieldRules = {
  opening_time: [required, time],
  closing_time: [required, time, afterTimeField("opening_time")],
};

const SLOT_RULES: FieldRules = {
  label: [maxLength(LIMITS.shortTextMax)],
  start_time: [required, time],
  end_time: [required, time, afterTimeField("start_time")],
};

export function DeliveryZoneForm({
  radius,
  latitude,
  longitude,
}: {
  radius: string;
  latitude: string | null;
  longitude: string | null;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [r, setR] = useState(radius);
  const [lat, setLat] = useState(latitude ?? "");
  const [lng, setLng] = useState(longitude ?? "");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [serverErrors, setServerErrors] = useState<FieldErrors>({});
  const [submissionId, setSubmissionId] = useState(0);

  /** Coordinates are optional but must be supplied as a PAIR. */
  const validateCoords = useCallback((): FieldErrors => {
    if (lat.trim() && !lng.trim()) return { longitude: t("addresses.errCoordPair") };
    if (lng.trim() && !lat.trim()) return { latitude: t("addresses.errCoordPair") };
    return {};
  }, [lat, lng, t]);

  const submit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setError(null);
      setSuccess(null);
      start(async () => {
        const res = await saveDeliverySettingsAction({
          delivery_radius_km: r,
          latitude: lat || undefined,
          longitude: lng || undefined,
        });
        setSubmissionId((n) => n + 1);
        setServerErrors(res.fieldErrors ?? {});
        if (res.error || Object.keys(res.fieldErrors ?? {}).length > 0) {
          setError(res.error);
          return;
        }
        setSuccess(res.success ?? null);
        router.refresh();
      });
    },
    [lat, lng, r, router],
  );

  const { errors, formProps } = useFormValidation(ZONE_RULES, {
    validate: validateCoords,
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
        label={t("bmExtras.radiusLabel")}
        name="delivery_radius_km"
        required
        error={errors.delivery_radius_km}
      >
        <Input name="delivery_radius_km" inputMode="decimal" value={r} onChange={(e) => setR(e.target.value)} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("bmExtras.latLabel")} name="latitude" error={errors.latitude}>
          <Input name="latitude" inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} placeholder="23.8103" />
        </Field>
        <Field label={t("bmExtras.lngLabel")} name="longitude" error={errors.longitude}>
          <Input name="longitude" inputMode="decimal" value={lng} onChange={(e) => setLng(e.target.value)} placeholder="90.4125" />
        </Field>
      </div>
      <Button type="submit" disabled={pending}>{pending ? t("common.saving") : t("common.save")}</Button>
    </form>
  );
}

export function DeliveryHoursForm({ opening, closing }: { opening: string | null; closing: string | null }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(opening ?? "");
  const [close, setClose] = useState(closing ?? "");
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
        const res = await saveDeliverySettingsAction({ opening_time: open, closing_time: close });
        setSubmissionId((n) => n + 1);
        setServerErrors(res.fieldErrors ?? {});
        if (res.error || Object.keys(res.fieldErrors ?? {}).length > 0) {
          setError(res.error);
          return;
        }
        setSuccess(res.success ?? null);
        router.refresh();
      });
    },
    [close, open, router],
  );

  const { errors, formProps } = useFormValidation(HOURS_RULES, {
    onSubmitValid: submit,
    serverErrors,
    submissionId,
    pending,
  });

  return (
    <form {...formProps} className="space-y-4">
      <Alert tone="error" message={error} />
      {Object.keys(errors).length === 0 ? <Alert tone="success" message={success} /> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("bmExtras.openingLabel")} name="opening_time" required error={errors.opening_time}>
          <Input name="opening_time" type="time" value={open} onChange={(e) => setOpen(e.target.value)} />
        </Field>
        {/* "must be after opening" lands here — the field the user changes. */}
        <Field label={t("bmExtras.closingLabel")} name="closing_time" required error={errors.closing_time}>
          <Input name="closing_time" type="time" value={close} onChange={(e) => setClose(e.target.value)} />
        </Field>
      </div>
      <Button type="submit" disabled={pending}>{pending ? t("common.saving") : t("common.save")}</Button>
    </form>
  );
}

export function TimeSlotForm() {
  const { t } = useTranslation();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [label, setLabel] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [serverErrors, setServerErrors] = useState<FieldErrors>({});
  const [submissionId, setSubmissionId] = useState(0);

  const submit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setError(null);
      start(async () => {
        const res = await addTimeSlotAction({ label, start_time: from, end_time: to });
        setSubmissionId((n) => n + 1);
        setServerErrors(res.fieldErrors ?? {});
        if (res.error || Object.keys(res.fieldErrors ?? {}).length > 0) {
          setError(res.error);
          return;
        }
        // Cleared only after the slot was actually added.
        setLabel("");
        setFrom("");
        setTo("");
        router.refresh();
      });
    },
    [from, label, router, to],
  );

  const { errors, formProps } = useFormValidation(SLOT_RULES, {
    onSubmitValid: submit,
    serverErrors,
    submissionId,
    pending,
  });

  return (
    <form {...formProps} className="flex flex-wrap items-end gap-3">
      <Field label={t("bmExtras.slotLabel")} name="label" className="flex-1" error={errors.label}>
        <Input name="label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder={t("bmExtras.slotPlaceholder")} />
      </Field>
      <Field label={t("bmExtras.fromLabel")} name="start_time" required error={errors.start_time}>
        <Input name="start_time" type="time" value={from} onChange={(e) => setFrom(e.target.value)} />
      </Field>
      <Field label={t("bmExtras.toLabel")} name="end_time" required error={errors.end_time}>
        <Input name="end_time" type="time" value={to} onChange={(e) => setTo(e.target.value)} />
      </Field>
      <Button type="submit" disabled={pending}>{t("bmExtras.addSlot")}</Button>
      {error ? <p className="w-full text-xs font-medium text-red-600 dark:text-red-400" role="alert">{error}</p> : null}
    </form>
  );
}

export function TimeSlotDeleteButton({ slotId }: { slotId: number }) {
  const { t } = useTranslation();
  const router = useRouter();
  return (
    <ConfirmModal
      trigger={<button type="button" className="text-sm font-medium text-red-600 hover:underline">{t("common.delete")}</button>}
      title={t("bmExtras.deleteSlotTitle")}
      description={t("bmExtras.deleteSlotDesc")}
      confirmLabel={t("common.delete")}
      action={async () => {
        const res = await deleteTimeSlotAction(slotId);
        router.refresh();
        return res;
      }}
    />
  );
}
