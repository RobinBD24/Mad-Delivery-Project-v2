"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
import { Input } from "@/components/ui/input";
import { useTranslation } from "@/lib/i18n/use-translation";
import { cn } from "@/lib/utils";
import { parseFieldErrors } from "@/lib/validation/contract";
import { LIMITS } from "@/lib/validation/limits";

interface Message {
  id: number;
  sender: number;
  sender_name: string;
  sender_role: string;
  body: string;
  created_at: string;
}

/**
 * Reusable chat panel for duty (rider↔BM) and delivery (rider↔customer) chats.
 * `base` is the message endpoint prefix, e.g. "/api/duty-chat/12" or
 * "/api/delivery-chat/34"; it GETs `${base}/messages` and POSTs there. Membership
 * and closed/read-only state are enforced server-side; the UI reflects them.
 */
export function ChatBox({ base, viewerId, title }: { base: string; viewerId: number; title?: string }) {
  const { t, fmt } = useTranslation();
  const [messages, setMessages] = useState<Message[]>([]);
  const [closed, setClosed] = useState(false);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [bodyError, setBodyError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const listRef = useRef<HTMLUListElement>(null);

  const load = useCallback(async () => {
    const res = await fetch(`${base}/messages`);
    if (!res.ok) { setError(t("errors.server.forbidden")); return; }
    const d = await res.json();
    setMessages(d.results ?? []);
    setClosed(Boolean(d.is_closed) || d.status === "closed");
  }, [base, t]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    // Client validation first — an empty or over-long message is never sent,
    // and the typed text is kept so it can be corrected.
    if (pending) return;
    const text = body.trim();
    if (!text) {
      setBodyError(t("validation.required"));
      return;
    }
    if (text.length > LIMITS.longTextMax) {
      setBodyError(t("validation.maxLength", { n: LIMITS.longTextMax }));
      return;
    }
    setPending(true);
    setError(null);
    setBodyError(null);
    const res = await fetch(`${base}/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: text }) });
    setPending(false);
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      const { fieldErrors, formError } = parseFieldErrors(data, t("errors.generic"));
      setBodyError(fieldErrors.body ?? null);
      setError(fieldErrors.body ? null : formError);
      return;
    }
    setBody(""); // cleared only after the message was accepted
    await load();
  }

  return (
    <div className="space-y-3" data-testid="chat-box">
      {title ? <h3 className="font-semibold text-fg-base">{title}</h3> : null}
      <Alert tone="error" message={error} />
      <ul ref={listRef} className="max-h-72 space-y-2 overflow-y-auto rounded-xl border border-border-strong p-3">
        {messages.length === 0 ? (
          <li className="py-6 text-center text-sm text-fg-subtle">{t("bmExtras.noMessages")}</li>
        ) : null}
        {messages.map((m) => {
          const mine = m.sender === viewerId;
          return (
            <li key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
              <div className={cn("max-w-[85%] rounded-2xl px-3.5 py-2 text-sm", mine ? "bg-brand-500 text-white" : "bg-surface-card text-fg-base ring-1 ring-border-base")}>
                {!mine ? <p className="mb-0.5 text-xs font-semibold text-fg-muted">{m.sender_name}</p> : null}
                <p className="whitespace-pre-line">{m.body}</p>
                <p className={cn("mt-1 text-[11px]", mine ? "text-white/70" : "text-fg-subtle")}>{fmt.dateTime(m.created_at)}</p>
              </div>
            </li>
          );
        })}
      </ul>
      {closed ? (
        <p className="rounded-lg bg-surface-muted px-3 py-2 text-center text-xs text-fg-muted" data-testid="chat-closed">{t("errors.rider.chatClosed")}</p>
      ) : (
        <form onSubmit={send} noValidate className="space-y-1">
          <div className="flex items-end gap-2">
            <Input
              name="body"
              className="flex-1"
              placeholder={t("complaints.replyPlaceholder")}
              aria-label={t("complaints.replyPlaceholder")}
              aria-invalid={Boolean(bodyError)}
              aria-describedby={bodyError ? "chat-body-error" : undefined}
              value={body}
              onChange={(e) => {
                setBody(e.target.value);
                if (bodyError) setBodyError(null);
              }}
              data-testid="chat-input"
            />
            <Button type="submit" disabled={pending} data-testid="chat-send">{t("complaints.send")}</Button>
          </div>
          <FieldError id="chat-body-error" message={bodyError} />
        </form>
      )}
    </div>
  );
}
