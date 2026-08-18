"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { addRamadanTableAction, bookRamadanAction, deleteRamadanTableAction } from "@/lib/api/actions";
import { useTranslation } from "@/lib/i18n/use-translation";
import { Field, Input, Select } from "@/components/ui/input";
import type { FieldErrors } from "@/lib/validation/contract";
import { LIMITS } from "@/lib/validation/limits";
import {
  integer,
  max,
  maxLength,
  min,
  notPast,
  phone as phoneRule,
  required,
  selectRequired,
  date as dateRule,
} from "@/lib/validation/rules";
import { useFormValidation, type FieldRules } from "@/lib/validation/use-form-validation";

const TABLE_RULES: FieldRules = {
  name: [required, maxLength(LIMITS.nameMax)],
  capacity: [required, integer, min(LIMITS.partySizeMin), max(LIMITS.partySizeMax)],
};

const BOOKING_RULES: FieldRules = {
  table_id: [selectRequired],
  guest_name: [required, maxLength(LIMITS.nameMax)],
  guest_phone: [required, phoneRule],
  party_size: [required, integer, min(LIMITS.partySizeMin), max(LIMITS.partySizeMax)],
  // An iftar seat cannot be booked for a day that has already passed.
  booking_date: [required, dateRule, notPast],
};

/** BM: add a Ramadan table (name + capacity). */
export function RamadanTableForm() {
  const { t } = useTranslation();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const [capacity, setCapacity] = useState("4");
  const [error, setError] = useState<string | null>(null);
  const [serverErrors, setServerErrors] = useState<FieldErrors>({});
  const [submissionId, setSubmissionId] = useState(0);

  const submit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setError(null);
      start(async () => {
        const res = await addRamadanTableAction({ name: name.trim(), capacity: Number(capacity) });
        setSubmissionId((n) => n + 1);
        setServerErrors(res.fieldErrors ?? {});
        if (res.error || Object.keys(res.fieldErrors ?? {}).length > 0) {
          setError(res.error);
          return;
        }
        // Cleared only after the table was created.
        setName("");
        setCapacity("4");
        router.refresh();
      });
    },
    [capacity, name, router],
  );

  const { errors, formProps } = useFormValidation(TABLE_RULES, {
    onSubmitValid: submit,
    serverErrors,
    submissionId,
    pending,
  });

  return (
    <form {...formProps} className="flex flex-wrap items-end gap-3">
      <Field label={t("bmExtras.tableName")} name="name" className="flex-1" required error={errors.name}>
        <Input name="name" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label={t("bmExtras.capacity")} name="capacity" className="w-28" required error={errors.capacity}>
        <Input name="capacity" inputMode="numeric" value={capacity} onChange={(e) => setCapacity(e.target.value)} />
      </Field>
      <Button type="submit" disabled={pending}>{t("bmExtras.addTable")}</Button>
      {error ? (
        <p className="w-full text-xs font-medium text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}

export function RamadanTableDeleteButton({ tableId }: { tableId: number }) {
  const { t } = useTranslation();
  const router = useRouter();
  return (
    <ConfirmModal
      trigger={<button type="button" className="text-sm font-medium text-red-600 hover:underline">{t("common.delete")}</button>}
      title={t("bmExtras.deleteTableTitle")}
      description={t("bmExtras.deleteTableDesc")}
      confirmLabel={t("common.delete")}
      action={async () => {
        const res = await deleteRamadanTableAction(tableId);
        router.refresh();
        return res;
      }}
    />
  );
}

/** Customer: book a Ramadan table for an iftar date. */
export function RamadanBookingForm({ tables }: { tables: { id: number; name: string; capacity: number }[] }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [tableId, setTableId] = useState(tables[0] ? String(tables[0].id) : "");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [size, setSize] = useState("2");
  const [date, setDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [serverErrors, setServerErrors] = useState<FieldErrors>({});
  const [submissionId, setSubmissionId] = useState(0);

  /** Party size may not exceed the chosen table's capacity. */
  const validateCapacity = useCallback((): FieldErrors => {
    const table = tables.find((tb) => String(tb.id) === tableId);
    const requested = Number(size);
    if (table && Number.isFinite(requested) && requested > table.capacity) {
      return { party_size: t("bmExtras.errPartyOverCapacity", { n: table.capacity }) };
    }
    return {};
  }, [size, tableId, tables, t]);

  const submit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setError(null);
      setSuccess(null);
      start(async () => {
        const res = await bookRamadanAction({
          table_id: Number(tableId),
          guest_name: name.trim(),
          guest_phone: phone.trim(),
          party_size: Number(size),
          booking_date: date,
        });
        setSubmissionId((n) => n + 1);
        setServerErrors(res.fieldErrors ?? {});
        if (res.error || Object.keys(res.fieldErrors ?? {}).length > 0) {
          // A clash ("table already booked for this date") lands on its field.
          setError(res.error);
          return;
        }
        setSuccess(res.success ?? null);
        setName("");
        setPhone("");
        setDate("");
        router.refresh();
      });
    },
    [date, name, phone, router, size, tableId],
  );

  const { errors, formProps } = useFormValidation(BOOKING_RULES, {
    validate: validateCapacity,
    onSubmitValid: submit,
    serverErrors,
    submissionId,
    pending,
  });

  if (tables.length === 0) {
    return <p className="text-sm text-fg-muted">{t("bmExtras.noTablesYet")}</p>;
  }

  return (
    <form {...formProps} className="space-y-4">
      <Alert tone="error" message={error} />
      {Object.keys(errors).length === 0 ? <Alert tone="success" message={success} /> : null}
      <Field label={t("bmExtras.selectTable")} name="table_id" required error={errors.table_id}>
        <Select name="table_id" value={tableId} onChange={(e) => setTableId(e.target.value)}>
          {tables.map((tb) => (
            <option key={tb.id} value={tb.id}>{tb.name} ({t("bmExtras.capN", { n: tb.capacity })})</option>
          ))}
        </Select>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("bmExtras.guestName")} name="guest_name" required error={errors.guest_name}>
          <Input name="guest_name" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label={t("bmExtras.guestPhone")} name="guest_phone" required error={errors.guest_phone}>
          <Input name="guest_phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="01XXXXXXXXX" />
        </Field>
        <Field label={t("bmExtras.partySize")} name="party_size" required error={errors.party_size}>
          <Input name="party_size" inputMode="numeric" value={size} onChange={(e) => setSize(e.target.value)} />
        </Field>
        <Field label={t("bmExtras.iftarDate")} name="booking_date" required error={errors.booking_date}>
          <Input name="booking_date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
      <Button type="submit" disabled={pending}>{pending ? t("common.saving") : t("bmExtras.bookTable")}</Button>
    </form>
  );
}
