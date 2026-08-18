"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
import {
  replyReservationAction,
  requestReservationAction,
  setReservationStatusAction,
} from "@/lib/api/actions";
import { useTranslation } from "@/lib/i18n/use-translation";
import { cn } from "@/lib/utils";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import type { FieldErrors } from "@/lib/validation/contract";
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
  time as timeRule,
} from "@/lib/validation/rules";
import { useFormValidation, type FieldRules } from "@/lib/validation/use-form-validation";

const REQUEST_RULES: FieldRules = {
  branch_id: [selectRequired],
  guest_name: [required, maxLength(LIMITS.nameMax)],
  guest_phone: [required, phoneRule],
  party_size: [required, integer, min(LIMITS.partySizeMin), max(LIMITS.partySizeMax)],
  date: [required, dateRule, notPast],
  time: [required, timeRule],
  note: [maxLength(LIMITS.longTextMax)],
};

const STATUS_TONE = { pending: "amber", accepted: "green", confirmed: "green", rejected: "red", cancelled: "red", completed: "blue", expired: "slate" } as const;

export function ReservationStatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  return <Badge tone={STATUS_TONE[status as keyof typeof STATUS_TONE] ?? "slate"}>{t(`reservationStatus.${status}`)}</Badge>;
}

interface BookableTable { id: number; name: string; seats: number }

/** Customer table-reservation request form (with graphical-table selection). */
export function ReservationRequestForm({ branches }: { branches: { id: number; name: string }[] }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [branchId, setBranchId] = useState(branches[0] ? String(branches[0].id) : "");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [size, setSize] = useState("2");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [note, setNote] = useState("");
  const [tables, setTables] = useState<BookableTable[]>([]);
  const [tableId, setTableId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [serverErrors, setServerErrors] = useState<FieldErrors>({});
  const [submissionId, setSubmissionId] = useState(0);

  useEffect(() => {
    let active = true;
    const url = branchId ? `/api/reservations/tables?branch_id=${branchId}` : null;
    // No sync setState: resolve to an empty list when there is no branch.
    (url ? fetch(url).then((r) => (r.ok ? r.json() : { results: [] })) : Promise.resolve({ results: [] }))
      .then((d) => { if (active) setTables(d.results ?? []); })
      .catch(() => { if (active) setTables([]); });
    return () => { active = false; };
  }, [branchId]);

  /** Party size may not exceed the seats of a specifically chosen table. */
  const validateSeats = useCallback((): FieldErrors => {
    const table = tables.find((tb) => String(tb.id) === tableId);
    const requested = Number(size);
    if (table && Number.isFinite(requested) && requested > table.seats) {
      return { table_id: t("bmExtras.errPartyOverCapacity", { n: table.seats }) };
    }
    return {};
  }, [size, tableId, tables, t]);

  const submit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setError(null);
      start(async () => {
        const res = await requestReservationAction({
          branch_id: Number(branchId),
          guest_name: name.trim(),
          guest_phone: phone.trim(),
          party_size: Number(size),
          requested_at: `${date}T${time}`,
          note: note.trim(),
          table_id: tableId ? Number(tableId) : null,
        });
        setSubmissionId((n) => n + 1);
        // The server keys this slot clash as `requested_at`; surface it on the
        // date/time the customer would change.
        const fieldErrors = { ...(res.fieldErrors ?? {}) };
        if (fieldErrors.requested_at) {
          fieldErrors.time = fieldErrors.requested_at;
          delete fieldErrors.requested_at;
        }
        setServerErrors(fieldErrors);
        if (res.error || Object.keys(fieldErrors).length > 0) {
          setError(res.error);
          return;
        }
        if (res.reservationId) router.push(`/customer/reservations/${res.reservationId}`);
      });
    },
    [branchId, date, name, note, phone, router, size, tableId, time],
  );

  const { errors, formProps } = useFormValidation(REQUEST_RULES, {
    validate: validateSeats,
    onSubmitValid: submit,
    serverErrors,
    submissionId,
    pending,
  });

  return (
    <form {...formProps} className="space-y-4">
      <Alert tone="error" message={error} />
      <Field label={t("bmExtras.branchLabel")} name="branch_id" required error={errors.branch_id}>
        <Select name="branch_id" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
          {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </Select>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("bmExtras.guestName")} name="guest_name" required error={errors.guest_name}>
          <Input name="guest_name" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label={t("bmExtras.guestPhone")} name="guest_phone" required error={errors.guest_phone}>
          <Input name="guest_phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="01XXXXXXXXX" />
        </Field>
        <Field label={t("bmExtras.guests")} name="party_size" required error={errors.party_size}>
          <Input name="party_size" inputMode="numeric" min={1} type="number" value={size} onChange={(e) => setSize(e.target.value)} />
        </Field>
        <Field label={t("bmExtras.date")} name="date" required error={errors.date}>
          <Input name="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label={t("bmExtras.time")} name="time" required error={errors.time}>
          <Input name="time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </Field>
        <Field label={t("b3.selectTable")} name="table_id" error={errors.table_id}>
          <Select name="table_id" value={tableId} onChange={(e) => setTableId(e.target.value)} data-testid="reservation-table">
            <option value="">{t("b3.anyTable")}</option>
            {tables.map((tb) => (
              <option key={tb.id} value={tb.id}>{tb.name} · {tb.seats} 🪑</option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label={t("bmExtras.noteLabel")} name="note" error={errors.note}>
        <Textarea name="note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <Button type="submit" disabled={pending}>{pending ? t("common.saving") : t("bmExtras.requestTable")}</Button>
    </form>
  );
}

interface ResMessage {
  id: number;
  sender: number;
  sender_name: string;
  sender_role: string;
  body: string;
  created_at: string;
}

/** Reservation chat + (manager) status controls + call button. */
export function ReservationThread({
  reservationId,
  viewerId,
  guestPhone,
  status,
  messages,
  canManage,
}: {
  reservationId: number;
  viewerId: number;
  guestPhone: string;
  status: string;
  messages: ResMessage[];
  canManage: boolean;
}) {
  const { t, fmt } = useTranslation();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [bodyError, setBodyError] = useState<string | null>(null);
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [liveMessages, setLiveMessages] = useState<ResMessage[]>(messages);

  // Automatic near-real-time refresh: poll the message history while the chat is
  // open (stops when cancelled/completed). Membership is enforced server-side.
  const chatOpen = status !== "cancelled" && status !== "completed" && status !== "rejected";
  useEffect(() => {
    // Sync server-rendered messages into local state (source for live polling).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLiveMessages(messages);
  }, [messages]);
  useEffect(() => {
    if (!chatOpen) return;
    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/api/reservations/${reservationId}/messages`);
        if (res.ok) setLiveMessages((await res.json()).results ?? []);
      } catch {
        /* transient network — keep last messages */
      }
    }, 5000);
    return () => clearInterval(timer);
  }, [chatOpen, reservationId]);

  function send(ev: React.FormEvent) {
    ev.preventDefault();
    setError(null);
    // Client validation first; the typed reply is never discarded.
    const text = body.trim();
    if (!text) {
      setBodyError(t("validation.required"));
      return;
    }
    if (text.length > LIMITS.longTextMax) {
      setBodyError(t("validation.maxLength", { n: LIMITS.longTextMax }));
      return;
    }
    setBodyError(null);
    start(async () => {
      const res = await replyReservationAction(reservationId, text);
      if (res.error || Object.keys(res.fieldErrors ?? {}).length > 0) {
        setBodyError(res.fieldErrors?.body ?? null);
        setError(res.fieldErrors?.body ? null : res.error);
        return;
      }
      setBody(""); // cleared only after the reply was accepted
      router.refresh();
    });
  }

  function setStatus(s: string, extra: { rejection_reason?: string } = {}) {
    start(async () => {
      const res = await setReservationStatusAction(reservationId, s, extra);
      if (res.error || Object.keys(res.fieldErrors ?? {}).length > 0) {
        // A rejection-reason complaint belongs under that input.
        const message = res.fieldErrors?.rejection_reason ?? res.fieldErrors?.reason ?? null;
        setReasonError(message);
        setError(message ? null : res.error);
        return;
      }
      setRejecting(false);
      setReason("");
      setReasonError(null);
      router.refresh();
    });
  }

  function submitReject(ev: React.FormEvent) {
    ev.preventDefault();
    setError(null);
    if (!reason.trim()) {
      setReasonError(t("b3.rejectReasonRequired"));
      return;
    }
    setReasonError(null);
    setStatus("rejected", { rejection_reason: reason.trim() });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {canManage ? (
          <>
            <Button size="sm" variant={status === "accepted" ? "primary" : "outline"} disabled={pending || status === "accepted"} onClick={() => setStatus("accepted")} data-testid="res-accept">
              {t("reservationStatus.accepted")}
            </Button>
            <Button size="sm" variant="outline" disabled={pending} onClick={() => setRejecting((v) => !v)} data-testid="res-reject-toggle">
              {t("reservationStatus.rejected")}
            </Button>
            <Button size="sm" variant={status === "completed" ? "primary" : "outline"} disabled={pending || status === "completed"} onClick={() => setStatus("completed")}>
              {t("reservationStatus.completed")}
            </Button>
          </>
        ) : null}
        <a href={`tel:${guestPhone.replace(/[^0-9+]/g, "")}`} className="inline-flex items-center gap-1.5 rounded-lg bg-brand-50 px-3 py-1.5 text-sm font-medium text-brand-600 hover:bg-brand-100">
          📞 {t("bmExtras.call")}
        </a>
      </div>

      {canManage && rejecting ? (
        <form onSubmit={submitReject} noValidate className="flex flex-wrap items-end gap-2 rounded-xl border border-red-200 bg-red-50/50 p-3" data-testid="res-reject-form">
          <Field
            label={t("b3.rejectReason")}
            name="rejection_reason"
            required
            className="flex-1"
            error={reasonError ?? undefined}
          >
            <Input
              name="rejection_reason"
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                if (reasonError) setReasonError(null);
              }}
              data-testid="res-reject-reason"
            />
          </Field>
          <Button type="submit" size="sm" variant="danger" disabled={pending} data-testid="res-reject-submit">{t("reservationStatus.rejected")}</Button>
        </form>
      ) : null}

      <Alert tone="error" message={error} />

      <ul className="max-h-80 space-y-2 overflow-y-auto" data-testid="reservation-messages">
        {liveMessages.length === 0 ? (
          <li className="py-6 text-center text-sm text-fg-subtle">{t("bmExtras.noMessages")}</li>
        ) : null}
        {liveMessages.map((m) => {
          const mine = m.sender === viewerId;
          return (
            <li key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
              <div className={cn("max-w-[85%] rounded-2xl px-4 py-2.5 text-sm shadow-card", mine ? "bg-brand-500 text-white" : "bg-surface-card text-fg-base ring-1 ring-slate-200")}>
                {!mine ? <p className="mb-0.5 text-xs font-semibold text-fg-muted">{m.sender_name}</p> : null}
                <p className="whitespace-pre-line">{m.body}</p>
                <p className={cn("mt-1 text-[11px]", mine ? "text-white/70" : "text-fg-subtle")}>{fmt.dateTime(m.created_at)}</p>
              </div>
            </li>
          );
        })}
      </ul>

      {status !== "cancelled" && status !== "completed" ? (
        <form onSubmit={send} noValidate className="space-y-1">
          <div className="flex items-end gap-2">
            <Input
              name="body"
              className="flex-1"
              placeholder={t("complaints.replyPlaceholder")}
              aria-label={t("complaints.replyPlaceholder")}
              aria-invalid={Boolean(bodyError)}
              aria-describedby={bodyError ? "reservation-reply-error" : undefined}
              value={body}
              onChange={(e) => {
                setBody(e.target.value);
                if (bodyError) setBodyError(null);
              }}
            />
            <Button type="submit" disabled={pending}>{t("complaints.send")}</Button>
          </div>
          <FieldError id="reservation-reply-error" message={bodyError} />
        </form>
      ) : null}
    </div>
  );
}
