"use client";

import { useCallback, useEffect, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
import { Checkbox, Field, Input, Select } from "@/components/ui/input";
import { useTranslation } from "@/lib/i18n/use-translation";
import { parseFieldErrors, type FieldErrors } from "@/lib/validation/contract";
import { LIMITS } from "@/lib/validation/limits";
import {
  afterTimeField,
  date as dateRule,
  integer,
  max,
  maxLength,
  min,
  money,
  onOrAfterField,
  oneOf,
  required,
  time as timeRule,
} from "@/lib/validation/rules";
import { useFormValidation, type FieldRules } from "@/lib/validation/use-form-validation";

/** Returns the parsed error map on failure, or null on success. */
async function api(url: string, method: string, body?: unknown, isForm = false) {
  const res = await fetch(url, isForm
    ? { method, body: body as FormData }
    : { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    return parseFieldErrors(data, "request failed");
  }
  return null;
}

interface Slot { id: number; label: string; start_time: string; end_time: string; capacity: number; is_active: boolean }
interface Menu { id: number; name: string; price: string; serving_capacity: number; items: string[]; is_active: boolean }
interface Reservation { id: number; guest_name: string; booking_date: string; slot_label: string; party_size: number; table_name: string | null; menu_name: string; status: string; total_amount: string; advance_required: string; payment: { status: string } | null }

const ADVANCE_TYPES = ["none", "fixed", "percent", "per_guest"] as const;
const RES_TONE: Record<string, "amber" | "green" | "red" | "blue" | "slate"> = { pending_payment: "amber", pending: "amber", confirmed: "green", rejected: "red", cancelled: "red", completed: "blue" };

const CONFIG_RULES: FieldRules = {
  booking_start_date: [required, dateRule],
  // The booking window must not end before it starts.
  booking_end_date: [required, dateRule, onOrAfterField("booking_start_date")],
  advance_type: [required, oneOf(ADVANCE_TYPES)],
  advance_value: [required, money],
  advance_guest_threshold: [required, integer, min(0), max(LIMITS.partySizeMax)],
  payment_deadline_hours: [required, integer, min(0), max(720)],
  cancellation_policy: [maxLength(LIMITS.longTextMax)],
};

const SLOT_RULES: FieldRules = {
  label: [required, maxLength(LIMITS.nameMax)],
  start_time: [required, timeRule],
  end_time: [required, timeRule, afterTimeField("start_time")],
  capacity: [required, integer, min(0), max(LIMITS.pointsMax)],
};

const MENU_RULES: FieldRules = {
  name: [required, maxLength(LIMITS.nameMax)],
  price: [required, money],
  serving_capacity: [required, integer, min(LIMITS.partySizeMin), max(LIMITS.partySizeMax)],
  items: [maxLength(LIMITS.longTextMax)],
};

const MENU_FILES = { image: false };

export function RamadanManagePanel() {
  const { t, fmt } = useTranslation();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  // config
  const [cfg, setCfg] = useState<Record<string, unknown> | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [menus, setMenus] = useState<Menu[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);

  const load = useCallback(async () => {
    const [c, s, m, r] = await Promise.all([
      fetch("/api/ramadan/config").then((x) => x.json()),
      fetch("/api/ramadan/slots").then((x) => x.json()),
      fetch("/api/ramadan/menus").then((x) => x.json()),
      fetch("/api/ramadan/reservations?page_size=100").then((x) => x.json()),
    ]);
    setCfg(c); setSlots(s.results ?? []); setMenus(m.results ?? []); setReservations(r.results ?? []);
  }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const [configErrors, setConfigErrors] = useState<FieldErrors>({});
  const [slotErrors, setSlotErrors] = useState<FieldErrors>({});
  const [menuErrors, setMenuErrors] = useState<FieldErrors>({});
  const [configSubmit, setConfigSubmit] = useState(0);
  const [slotSubmit, setSlotSubmit] = useState(0);
  const [menuSubmit, setMenuSubmit] = useState(0);
  /** Inline reject reason per reservation (replaces the browser prompt). */
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectError, setRejectError] = useState<string | null>(null);

  const saveConfig = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setError(null);
      setOk(null);
      const f = new FormData(event.currentTarget);
      void (async () => {
        const failure = await api("/api/ramadan/config", "PATCH", {
          is_enabled: f.get("is_enabled") === "on",
          booking_start_date: f.get("booking_start_date"),
          booking_end_date: f.get("booking_end_date"),
          advance_type: f.get("advance_type"),
          advance_value: Number(f.get("advance_value")),
          advance_guest_threshold: Number(f.get("advance_guest_threshold")),
          payment_deadline_hours: Number(f.get("payment_deadline_hours")),
          cancellation_policy: f.get("cancellation_policy"),
        });
        setConfigSubmit((n) => n + 1);
        setConfigErrors(failure?.fieldErrors ?? {});
        if (failure) {
          setError(Object.keys(failure.fieldErrors).length ? null : failure.formError);
          return;
        }
        setOk(t("common.saved"));
        load();
      })();
    },
    [load, t],
  );

  const addSlot = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setError(null);
      const form = event.currentTarget;
      const f = new FormData(form);
      void (async () => {
        const failure = await api("/api/ramadan/slots", "POST", {
          label: f.get("label"),
          start_time: f.get("start_time"),
          end_time: f.get("end_time"),
          capacity: Number(f.get("capacity")),
        });
        setSlotSubmit((n) => n + 1);
        setSlotErrors(failure?.fieldErrors ?? {});
        if (failure) {
          setError(Object.keys(failure.fieldErrors).length ? null : failure.formError);
          return; // the draft keeps every value
        }
        form.reset(); // only after the slot was created
        load();
      })();
    },
    [load],
  );

  async function delSlot(id: number) {
    const failure = await api(`/api/ramadan/slots/${id}`, "DELETE");
    if (failure) { setError(failure.formError); return; }
    load();
  }

  const addMenu = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setError(null);
      const form = event.currentTarget;
      const f = new FormData(form);
      void (async () => {
        const failure = await api("/api/ramadan/menus", "POST", f, true);
        setMenuSubmit((n) => n + 1);
        setMenuErrors(failure?.fieldErrors ?? {});
        if (failure) {
          setError(Object.keys(failure.fieldErrors).length ? null : failure.formError);
          return;
        }
        form.reset(); // only after the menu was created
        load();
      })();
    },
    [load],
  );

  async function delMenu(id: number) {
    const failure = await api(`/api/ramadan/menus/${id}`, "DELETE");
    if (failure) { setError(failure.formError); return; }
    load();
  }

  async function setStatus(id: number, status: string, reason?: string) {
    const failure = await api(`/api/ramadan/reservations/${id}/status`, "POST", {
      status,
      rejection_reason: reason,
    });
    if (failure) {
      const message = failure.fieldErrors.rejection_reason ?? failure.fieldErrors.reason ?? null;
      setRejectError(message);
      setError(message ? null : failure.formError);
      return;
    }
    setRejectingId(null);
    setRejectReason("");
    setRejectError(null);
    load();
  }

  const configForm = useFormValidation(CONFIG_RULES, {
    onSubmitValid: saveConfig,
    serverErrors: configErrors,
    submissionId: configSubmit,
  });
  const slotForm = useFormValidation(SLOT_RULES, {
    onSubmitValid: addSlot,
    serverErrors: slotErrors,
    submissionId: slotSubmit,
  });
  const menuForm = useFormValidation(MENU_RULES, {
    files: MENU_FILES,
    onSubmitValid: addMenu,
    serverErrors: menuErrors,
    submissionId: menuSubmit,
  });

  if (!cfg) return null;

  return (
    <div className="space-y-6">
      <Alert tone="error" message={error} />
      <Alert tone="success" message={ok} />

      {/* Config */}
      <section className="rounded-xl border border-border-strong p-4" data-testid="ramadan-config">
        <h3 className="mb-3 font-semibold text-fg-base">{t("ramadan.configTitle")}</h3>
        <form {...configForm.formProps} className="space-y-3">
          <Checkbox name="is_enabled" label={t("ramadan.bookingEnabled")} defaultChecked={Boolean(cfg.is_enabled)} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("ramadan.startDate")} name="booking_start_date" required error={configForm.errors.booking_start_date}>
              <Input name="booking_start_date" type="date" defaultValue={String(cfg.booking_start_date ?? "")} />
            </Field>
            {/* "must not end before it starts" lands here — the field to change. */}
            <Field label={t("ramadan.endDate")} name="booking_end_date" required error={configForm.errors.booking_end_date}>
              <Input name="booking_end_date" type="date" defaultValue={String(cfg.booking_end_date ?? "")} />
            </Field>
            <Field label={t("ramadan.advanceType")} name="advance_type" required error={configForm.errors.advance_type}>
              <Select name="advance_type" defaultValue={String(cfg.advance_type ?? "none")} data-testid="advance-type">
                {ADVANCE_TYPES.map((a) => <option key={a} value={a}>{t(`ramadan.advance${a === "none" ? "None" : a === "fixed" ? "Fixed" : a === "percent" ? "Percent" : "PerGuest"}`)}</option>)}
              </Select>
            </Field>
            <Field label={t("ramadan.advanceValue")} name="advance_value" required error={configForm.errors.advance_value}>
              <Input name="advance_value" type="number" step="0.01" min="0" defaultValue={String(cfg.advance_value ?? "0")} />
            </Field>
            <Field label={t("ramadan.threshold")} name="advance_guest_threshold" required error={configForm.errors.advance_guest_threshold}>
              <Input name="advance_guest_threshold" type="number" min="0" defaultValue={String(cfg.advance_guest_threshold ?? "0")} />
            </Field>
            <Field label={t("ramadan.deadlineHours")} name="payment_deadline_hours" required error={configForm.errors.payment_deadline_hours}>
              <Input name="payment_deadline_hours" type="number" min="0" defaultValue={String(cfg.payment_deadline_hours ?? "0")} />
            </Field>
          </div>
          <Field label={t("ramadan.cancellationPolicy")} name="cancellation_policy" error={configForm.errors.cancellation_policy}>
            <Input name="cancellation_policy" defaultValue={String(cfg.cancellation_policy ?? "")} />
          </Field>
          <Button type="submit" data-testid="ramadan-config-save">{t("common.save")}</Button>
        </form>
      </section>

      {/* Slots */}
      <section className="rounded-xl border border-border-strong p-4">
        <h3 className="mb-3 font-semibold text-fg-base">{t("ramadan.slots")}</h3>
        <ul className="mb-3 divide-y divide-border-base text-sm">
          {slots.length === 0 ? <li className="py-2 text-fg-muted">{t("ramadan.noSlots")}</li> : slots.map((s) => (
            <li key={s.id} className="flex items-center gap-3 py-2" data-testid="ramadan-slot">
              <span className="font-medium">{s.label}</span><span className="text-fg-muted">{s.start_time}–{s.end_time}</span>
              {s.is_active ? <Badge tone="green">{t("common.active")}</Badge> : <Badge tone="slate">{t("common.inactive")}</Badge>}
              <button type="button" className="ml-auto text-red-600 hover:underline" onClick={() => delSlot(s.id)}>{t("common.delete")}</button>
            </li>
          ))}
        </ul>
        <form {...slotForm.formProps} className="grid gap-3 sm:grid-cols-5" data-testid="ramadan-slot-form">
          <Field label={t("ramadan.slotLabel")} name="label" required error={slotForm.errors.label}>
            <Input name="label" data-testid="slot-label" />
          </Field>
          <Field label={t("ramadan.startTime")} name="start_time" required error={slotForm.errors.start_time}>
            <Input name="start_time" type="time" />
          </Field>
          <Field label={t("ramadan.endTime")} name="end_time" required error={slotForm.errors.end_time}>
            <Input name="end_time" type="time" />
          </Field>
          <Field label={t("ramadan.slotCapacity")} name="capacity" required error={slotForm.errors.capacity}>
            <Input name="capacity" type="number" min="0" defaultValue="20" />
          </Field>
          <div className="flex items-end"><Button type="submit" size="sm" variant="outline">+ {t("ramadan.addSlot")}</Button></div>
        </form>
      </section>

      {/* Menus */}
      <section className="rounded-xl border border-border-strong p-4">
        <h3 className="mb-3 font-semibold text-fg-base">{t("ramadan.menus")}</h3>
        <ul className="mb-3 divide-y divide-border-base text-sm">
          {menus.length === 0 ? <li className="py-2 text-fg-muted">{t("ramadan.noMenus")}</li> : menus.map((m) => (
            <li key={m.id} className="flex items-center gap-3 py-2" data-testid="ramadan-menu">
              <span className="font-medium">{m.name}</span><span className="text-fg-muted">{fmt.money(m.price)} · {t("ramadan.serves", { n: m.serving_capacity })}</span>
              <button type="button" className="ml-auto text-red-600 hover:underline" onClick={() => delMenu(m.id)}>{t("common.delete")}</button>
            </li>
          ))}
        </ul>
        <form {...menuForm.formProps} className="grid gap-3 sm:grid-cols-2" encType="multipart/form-data" data-testid="ramadan-menu-form">
          <Field label={t("ramadan.menuName")} name="name" required error={menuForm.errors.name}>
            <Input name="name" data-testid="menu-name" />
          </Field>
          <Field label={t("ramadan.price")} name="price" required error={menuForm.errors.price}>
            <Input name="price" type="number" step="0.01" min="0" data-testid="menu-price" />
          </Field>
          <Field label={t("ramadan.servingCapacity")} name="serving_capacity" required error={menuForm.errors.serving_capacity}>
            <Input name="serving_capacity" type="number" min="1" defaultValue="4" data-testid="menu-serving" />
          </Field>
          <Field label={t("ramadan.items")} name="items" hint={t("ramadan.itemsHint")} error={menuForm.errors.items}>
            <Input name="items" placeholder="Haleem, Biryani, Jilapi" />
          </Field>
          <Field label={t("ramadan.menus")} name="image" error={menuForm.errors.image}>
            <Input name="image" type="file" accept="image/*" className="py-2" />
          </Field>
          <div className="flex items-end"><Button type="submit" size="sm">+ {t("ramadan.addMenu")}</Button></div>
        </form>
      </section>

      {/* Reservations */}
      <section className="rounded-xl border border-border-strong p-4">
        <h3 className="mb-3 font-semibold text-fg-base">{t("ramadan.reservations")}</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="ramadan-reservations">
            <thead className="text-left text-xs text-fg-muted">
              <tr><th className="px-2 py-1">{t("ramadan.guests")}</th><th className="px-2 py-1">{t("ramadan.bookingDate")}</th><th className="px-2 py-1">{t("ramadan.selectSlot")}</th><th className="px-2 py-1">{t("ramadan.selectMenu")}</th><th className="px-2 py-1">{t("ramadan.total")}</th><th className="px-2 py-1">{t("common.status")}</th><th className="px-2 py-1 text-right">{t("common.actions")}</th></tr>
            </thead>
            <tbody className="divide-y divide-border-base">
              {reservations.length === 0 ? <tr><td colSpan={7} className="px-2 py-4 text-center text-fg-muted">{t("ramadan.noReservations")}</td></tr> : reservations.map((r) => (
                <tr key={r.id} data-testid="ramadan-res-row">
                  <td className="px-2 py-1">{r.guest_name} ({r.party_size})</td>
                  <td className="px-2 py-1">{r.booking_date}</td>
                  <td className="px-2 py-1">{r.slot_label}</td>
                  <td className="px-2 py-1">{r.menu_name}</td>
                  <td className="px-2 py-1">{fmt.money(r.total_amount)}</td>
                  <td className="px-2 py-1"><Badge tone={RES_TONE[r.status] ?? "slate"}>{t(`ramadanStatus.${r.status}`)}</Badge></td>
                  <td className="px-2 py-1 text-right">
                    {r.status === "pending" || r.status === "pending_payment" ? (
                      <span className="flex flex-col items-end gap-2">
                        <span className="flex justify-end gap-2">
                          <button type="button" className="text-brand-600 hover:underline" data-testid="res-accept" onClick={() => setStatus(r.id, "confirmed")}>{t("ramadan.accept")}</button>
                          <button
                            type="button"
                            className="text-red-600 hover:underline"
                            data-testid="res-reject"
                            onClick={() => {
                              setRejectingId(rejectingId === r.id ? null : r.id);
                              setRejectReason("");
                              setRejectError(null);
                            }}
                          >
                            {t("ramadan.reject")}
                          </button>
                        </span>
                        {/* Inline reason instead of a browser prompt, so the
                            requirement can be validated and its message shown
                            under the field it belongs to. */}
                        {rejectingId === r.id ? (
                          <form
                            noValidate
                            className="flex flex-col items-end gap-1"
                            onSubmit={(ev) => {
                              ev.preventDefault();
                              const reason = rejectReason.trim();
                              if (!reason) {
                                setRejectError(t("validation.required"));
                                return;
                              }
                              setRejectError(null);
                              void setStatus(r.id, "rejected", reason);
                            }}
                          >
                            <span className="flex items-center gap-2">
                              <Input
                                name="rejection_reason"
                                className="w-56"
                                aria-label={t("ramadan.rejectReason")}
                                placeholder={t("ramadan.rejectReason")}
                                aria-invalid={Boolean(rejectError)}
                                aria-describedby={rejectError ? `ramadan-reject-${r.id}-error` : undefined}
                                value={rejectReason}
                                onChange={(ev) => {
                                  setRejectReason(ev.target.value);
                                  if (rejectError) setRejectError(null);
                                }}
                                data-testid="res-reject-reason"
                              />
                              <Button type="submit" size="sm" variant="danger">{t("ramadan.reject")}</Button>
                            </span>
                            <FieldError id={`ramadan-reject-${r.id}-error`} message={rejectError} />
                          </form>
                        ) : null}
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
