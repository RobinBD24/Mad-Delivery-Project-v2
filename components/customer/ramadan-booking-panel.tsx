"use client";

import { useCallback, useEffect, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { useTranslation } from "@/lib/i18n/use-translation";
import { parseFieldErrors, type FieldErrors } from "@/lib/validation/contract";
import { LIMITS } from "@/lib/validation/limits";
import {
  date as dateRule,
  integer,
  max,
  maxLength,
  min,
  notPast,
  phone as phoneRule,
  required,
  selectRequired,
} from "@/lib/validation/rules";
import { useFormValidation, type FieldRules } from "@/lib/validation/use-form-validation";

const BOOK_RULES: FieldRules = {
  branch_id: [selectRequired],
  booking_date: [required, dateRule, notPast],
  slot_id: [selectRequired],
  table_id: [selectRequired],
  menu_id: [selectRequired],
  party_size: [required, integer, min(LIMITS.partySizeMin), max(LIMITS.partySizeMax)],
  guest_name: [required, maxLength(LIMITS.nameMax)],
  guest_phone: [required, phoneRule],
  special_request: [maxLength(LIMITS.longTextMax)],
};

interface Branch { id: number; name: string }
interface Slot { id: number; label: string }
interface TableT { id: number; name: string; seats: number }
interface Menu { id: number; name: string; price: string; serving_capacity: number; items: string[] }
interface Config { is_enabled: boolean; advance_type: string; advance_value: string; advance_guest_threshold: number }
interface Booking { id: number; booking_date: string; slot_label: string; party_size: number; menu_name: string; status: string; total_amount: string; advance_required: string; payment: { status: string } | null }

/** Returns the parsed error map on failure, or null on success. */
async function post(url: string, body: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => null);
  if (!res.ok) return parseFieldErrors(data, "request failed");
  return null;
}

export function RamadanBookingPanel({ branches }: { branches: Branch[] }) {
  const { t, fmt } = useTranslation();
  const [branchId, setBranchId] = useState(branches[0] ? String(branches[0].id) : "");
  const [date, setDate] = useState("");
  const [slotId, setSlotId] = useState("");
  const [tableId, setTableId] = useState("");
  const [menuId, setMenuId] = useState("");
  const [guests, setGuests] = useState("2");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [request, setRequest] = useState("");
  const [config, setConfig] = useState<Config | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [tables, setTables] = useState<TableT[]>([]);
  const [menus, setMenus] = useState<Menu[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [busy, setBusy] = useState(false);
  const [serverErrors, setServerErrors] = useState<FieldErrors>({});
  const [submissionId, setSubmissionId] = useState(0);

  const loadAvailable = useCallback(async () => {
    if (!branchId) return;
    const qs = new URLSearchParams({ branch_id: branchId });
    if (date) qs.set("date", date);
    if (slotId) qs.set("slot_id", slotId);
    const d = await (await fetch(`/api/ramadan/available?${qs}`)).json();
    setConfig(d.config ?? null); setSlots(d.slots ?? []); setTables(d.tables ?? []); setMenus(d.menus ?? []);
  }, [branchId, date, slotId]);
  const loadBookings = useCallback(async () => {
    const d = await (await fetch("/api/ramadan/reservations?page_size=50")).json();
    setBookings(d.results ?? []);
  }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadAvailable(); }, [loadAvailable]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadBookings(); }, [loadBookings]);

  const menu = menus.find((m) => String(m.id) === menuId);
  const size = Number(guests) || 1;
  const quantity = menu ? Math.ceil(size / menu.serving_capacity) : 1;
  const total = menu ? Number(menu.price) * quantity : 0;
  const advancePreview = (() => {
    if (!config || config.advance_type === "none") return 0;
    if (config.advance_guest_threshold > 0 && size < config.advance_guest_threshold) return 0;
    const v = Number(config.advance_value);
    if (config.advance_type === "fixed") return Math.min(v, total);
    if (config.advance_type === "percent") return Math.min((total * v) / 100, total);
    return Math.min(v * size, total);
  })();

  /** Party size may not exceed the chosen table's seats. */
  const validateSeats = useCallback((): FieldErrors => {
    const table = tables.find((tb) => String(tb.id) === tableId);
    if (table && size > table.seats) {
      return { table_id: t("bmExtras.errPartyOverCapacity", { n: table.seats }) };
    }
    return {};
  }, [size, tableId, tables, t]);

  const book = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setError(null);
      setBusy(true);
      void (async () => {
        try {
          const failure = await post("/api/ramadan/reservations", {
            branch_id: Number(branchId), booking_date: date, slot_id: Number(slotId), table_id: Number(tableId), menu_id: Number(menuId),
            party_size: size, guest_name: name.trim(), guest_phone: phone.trim(), special_request: request.trim(),
          });
          setSubmissionId((n) => n + 1);
          setServerErrors(failure?.fieldErrors ?? {});
          if (failure) {
            // Slot/table clashes come back keyed by field and land there; the
            // whole booking draft is preserved either way.
            setError(Object.keys(failure.fieldErrors).length ? null : failure.formError);
            return;
          }
          setName(""); setPhone(""); setRequest("");
          await loadBookings(); await loadAvailable();
        } finally {
          setBusy(false);
        }
      })();
    },
    [branchId, date, loadAvailable, loadBookings, menuId, name, phone, request, size, slotId, tableId],
  );

  const { errors, formProps } = useFormValidation(BOOK_RULES, {
    validate: validateSeats,
    onSubmitValid: book,
    serverErrors,
    submissionId,
    pending: busy,
  });

  async function pay(id: number) {
    setError(null);
    const failure = await post(`/api/ramadan/reservations/${id}/pay`, { idempotency_key: `pay-${id}-${bookings.length}` });
    if (failure) { setError(failure.formError); return; }
    await loadBookings();
  }
  async function cancel(id: number) {
    const failure = await post(`/api/ramadan/reservations/${id}/status`, { status: "cancelled" });
    if (failure) { setError(failure.formError); return; }
    await loadBookings();
  }

  const enabled = config?.is_enabled;

  return (
    <div className="space-y-6">
      <Alert tone="error" message={error} />

      <form {...formProps} className="space-y-4 rounded-xl border border-border-strong p-4" data-testid="ramadan-book-form">
        <h3 className="font-semibold text-fg-base">{t("ramadan.book")}</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("ramadan.selectBranch")} name="branch_id" required error={errors.branch_id}>
            <Select name="branch_id" value={branchId} onChange={(e) => setBranchId(e.target.value)} data-testid="ramadan-branch">
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          </Field>
          <Field label={t("ramadan.selectDate")} name="booking_date" required error={errors.booking_date}>
            <Input name="booking_date" type="date" value={date} onChange={(e) => setDate(e.target.value)} data-testid="ramadan-date" />
          </Field>
          <Field label={t("ramadan.selectSlot")} name="slot_id" required error={errors.slot_id}>
            <Select name="slot_id" value={slotId} onChange={(e) => setSlotId(e.target.value)} data-testid="ramadan-slot">
              <option value="">—</option>
              {slots.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </Select>
          </Field>
          <Field label={t("ramadan.selectTable")} name="table_id" required error={errors.table_id}>
            <Select name="table_id" value={tableId} onChange={(e) => setTableId(e.target.value)} data-testid="ramadan-table">
              <option value="">—</option>
              {tables.map((tb) => <option key={tb.id} value={tb.id}>{tb.name} · {tb.seats} 🪑</option>)}
            </Select>
          </Field>
          <Field label={t("ramadan.selectMenu")} name="menu_id" required error={errors.menu_id}>
            <Select name="menu_id" value={menuId} onChange={(e) => setMenuId(e.target.value)} data-testid="ramadan-menu-select">
              <option value="">—</option>
              {menus.map((m) => <option key={m.id} value={m.id}>{m.name} · {fmt.money(m.price)}</option>)}
            </Select>
          </Field>
          <Field label={t("ramadan.guests")} name="party_size" required error={errors.party_size}>
            <Input name="party_size" type="number" min="1" value={guests} onChange={(e) => setGuests(e.target.value)} data-testid="ramadan-guests" />
          </Field>
          <Field label={t("bmExtras.guestName")} name="guest_name" required error={errors.guest_name}>
            <Input name="guest_name" value={name} onChange={(e) => setName(e.target.value)} data-testid="ramadan-name" />
          </Field>
          <Field label={t("bmExtras.guestPhone")} name="guest_phone" required error={errors.guest_phone}>
            <Input name="guest_phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="01XXXXXXXXX" data-testid="ramadan-phone" />
          </Field>
        </div>
        <Field label={t("ramadan.specialRequest")} name="special_request" error={errors.special_request}>
          <Textarea name="special_request" rows={2} value={request} onChange={(e) => setRequest(e.target.value)} />
        </Field>

        {/* Summary (preview — server is authoritative) */}
        {menu ? (
          <div className="rounded-lg bg-surface-hover/50 p-3 text-sm" data-testid="ramadan-summary">
            <p className="font-medium">{menu.name} — {t("ramadan.serves", { n: menu.serving_capacity })}</p>
            {menu.items.length ? <p className="text-xs text-fg-muted">{menu.items.join(" · ")}</p> : null}
            <p className="mt-1">{t("ramadan.quantity")}: {fmt.num(quantity)} · {t("ramadan.total")}: <b>{fmt.money(total.toFixed(2))}</b></p>
            <p>{advancePreview > 0 ? <>{t("ramadan.advanceRequired")}: <b>{fmt.money(advancePreview.toFixed(2))}</b> · {t("ramadan.remaining")}: {fmt.money((total - advancePreview).toFixed(2))}</> : t("ramadan.noAdvance")}</p>
            <p className="mt-1 text-xs text-fg-subtle">{t("ramadan.terms")}</p>
          </div>
        ) : null}

        <Button type="submit" disabled={busy || !enabled} data-testid="ramadan-book-submit">{t("ramadan.confirmBook")}</Button>
        {!enabled ? <p className="text-xs text-amber-600">{t("errors.ramadan.notEnabled")}</p> : null}
      </form>

      {/* My bookings */}
      <section>
        <h3 className="mb-3 font-semibold text-fg-base">{t("ramadan.myBookings")}</h3>
        <div className="overflow-x-auto rounded-xl border border-border-strong">
          <table className="w-full text-sm" data-testid="ramadan-my-bookings">
            <thead className="text-left text-xs text-fg-muted"><tr><th className="px-2 py-1">{t("ramadan.bookingDate")}</th><th className="px-2 py-1">{t("ramadan.selectMenu")}</th><th className="px-2 py-1">{t("ramadan.total")}</th><th className="px-2 py-1">{t("common.status")}</th><th className="px-2 py-1 text-right">{t("common.actions")}</th></tr></thead>
            <tbody className="divide-y divide-border-base">
              {bookings.length === 0 ? <tr><td colSpan={5} className="px-2 py-4 text-center text-fg-muted">{t("ramadan.noReservations")}</td></tr> : bookings.map((r) => (
                <tr key={r.id} data-testid="ramadan-booking-row">
                  <td className="px-2 py-1">{r.booking_date} · {r.slot_label}</td>
                  <td className="px-2 py-1">{r.menu_name}</td>
                  <td className="px-2 py-1">{fmt.money(r.total_amount)}</td>
                  <td className="px-2 py-1"><Badge tone={r.status === "confirmed" ? "green" : r.status === "rejected" || r.status === "cancelled" ? "red" : "amber"}>{t(`ramadanStatus.${r.status}`)}</Badge></td>
                  <td className="px-2 py-1 text-right">
                    <span className="flex justify-end gap-2">
                      {r.status === "pending_payment" && r.payment?.status !== "paid" ? <button type="button" className="text-brand-600 hover:underline" data-testid="ramadan-pay" onClick={() => pay(r.id)}>{t("ramadan.payDemo")}</button> : null}
                      {r.status !== "cancelled" && r.status !== "rejected" && r.status !== "completed" ? (
                        /* Cancelling a booking cannot be undone, so it is
                           confirmed in a dialog naming that exact booking. */
                        <ConfirmModal
                          trigger={
                            <button type="button" className="text-red-600 hover:underline">
                              {t("ramadan.cancel")}
                            </button>
                          }
                          title={t("ramadan.cancelTitle")}
                          description={t("ramadan.cancelDesc", {
                            date: r.booking_date,
                            slot: r.slot_label,
                          })}
                          confirmLabel={t("ramadan.cancel")}
                          action={async () => {
                            await cancel(r.id);
                            return { error: null };
                          }}
                        />
                      ) : null}
                    </span>
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
