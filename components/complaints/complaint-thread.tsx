"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
import { Textarea } from "@/components/ui/input";
import { LIMITS } from "@/lib/validation/limits";
import { replyComplaintAction, setComplaintStatusAction } from "@/lib/api/actions";
import { COMPLAINT_STATUSES } from "@/lib/constants/enums";
import { useTranslation } from "@/lib/i18n/use-translation";
import { cn } from "@/lib/utils";
import type { Complaint } from "@/types";

export function ComplaintThread({
  complaint,
  viewerId,
  canHandle,
}: {
  complaint: Complaint;
  viewerId: number;
  canHandle: boolean;
}) {
  const { t, fmt } = useTranslation();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [bodyError, setBodyError] = useState<string | null>(null);

  const closed = complaint.status === "closed";

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
      const res = await replyComplaintAction(complaint.id, text);
      if (res.error || Object.keys(res.fieldErrors ?? {}).length > 0) {
        setBodyError(res.fieldErrors?.body ?? null);
        setError(res.fieldErrors?.body ? null : res.error);
        return;
      }
      setBody(""); // cleared only after the reply was accepted
      router.refresh();
    });
  }

  function setStatus(status: string) {
    start(async () => {
      const res = await setComplaintStatusAction(complaint.id, status);
      if (res.error) setError(res.error);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {canHandle ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border-base bg-surface-muted px-4 py-3">
          <span className="mr-1 text-sm font-medium text-fg-muted">{t("complaints.changeStatus")}:</span>
          {COMPLAINT_STATUSES.map((s) => (
            <Button
              key={s}
              size="sm"
              variant={complaint.status === s ? "primary" : "outline"}
              disabled={pending || complaint.status === s}
              onClick={() => setStatus(s)}
            >
              {t(`complaintStatus.${s}`)}
            </Button>
          ))}
        </div>
      ) : null}

      <Alert tone="error" message={error} />

      <ul className="space-y-3">
        {/* Original complaint message as the first bubble */}
        <li className="flex flex-col items-start">
          <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-surface-card px-4 py-2.5 text-sm text-fg-base shadow-card ring-1 ring-slate-200">
            <p className="mb-1 text-xs font-semibold text-fg-muted">
              {complaint.complainant_name} · {t(`roles.${complaint.complainant_role}`)}
            </p>
            <p className="whitespace-pre-line">{complaint.message}</p>
            <p className="mt-1 text-[11px] text-fg-subtle">{fmt.dateTime(complaint.created_at)}</p>
          </div>
        </li>

        {(complaint.messages ?? []).map((m) => {
          const mine = m.sender === viewerId;
          return (
            <li key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
              <div
                className={cn(
                  "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm shadow-card",
                  mine
                    ? "rounded-tr-sm bg-brand-500 text-white"
                    : "rounded-tl-sm bg-surface-card text-fg-base ring-1 ring-slate-200",
                )}
              >
                {!mine ? (
                  <p className="mb-1 text-xs font-semibold text-fg-muted">
                    {m.sender_name} · {t(`roles.${m.sender_role}`)}
                  </p>
                ) : null}
                <p className="whitespace-pre-line">{m.body}</p>
                <p className={cn("mt-1 text-[11px]", mine ? "text-white/70" : "text-fg-subtle")}>
                  {fmt.dateTime(m.created_at)}
                </p>
              </div>
            </li>
          );
        })}
      </ul>

      {closed ? (
        <p className="rounded-xl bg-surface-muted px-4 py-3 text-center text-sm text-fg-muted">
          {t("complaints.closedNote")}
        </p>
      ) : (
        <form onSubmit={send} noValidate className="space-y-1">
          <div className="flex items-end gap-2">
            <Textarea
              name="body"
              className="min-h-11 flex-1"
              rows={2}
              placeholder={t("complaints.replyPlaceholder")}
              aria-label={t("complaints.replyPlaceholder")}
              aria-invalid={Boolean(bodyError)}
              aria-describedby={bodyError ? "complaint-reply-error" : undefined}
              value={body}
              onChange={(e) => {
                setBody(e.target.value);
                if (bodyError) setBodyError(null);
              }}
            />
            <Button type="submit" disabled={pending}>
              {t("complaints.send")}
            </Button>
          </div>
          {/* The reply's own message, directly under the box it belongs to. */}
          <FieldError id="complaint-reply-error" message={bodyError} />
        </form>
      )}
    </div>
  );
}
