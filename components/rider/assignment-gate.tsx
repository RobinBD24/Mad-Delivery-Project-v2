"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
import { Input } from "@/components/ui/input";
import { useTranslation } from "@/lib/i18n/use-translation";
import { parseFieldErrors } from "@/lib/validation/contract";

interface PendingAssignment {
  order: number;
  order_number: string | null;
  delivery_address: string;
  delivery_lat: number | null;
  delivery_lng: number | null;
  distance_km: number | null;
}

/**
 * Rider new-order blocking gate (req #6). Polls pending assignments every 5s
 * (the project's existing polling model — no extra WebSocket stack) and, when
 * one exists, shows a BLOCKING modal that cannot be dismissed by outside-click
 * or Escape. The rider must Accept or Reject (reason required) before using the
 * rest of the dashboard. A short WebAudio beep plays when audio is permitted;
 * visual alerting continues regardless. Focus is trapped inside the dialog.
 * Duplicate/stale offers are handled server-side (pending endpoint filters
 * superseded/reassigned offers), so the modal never acts on a stale order.
 */
export function RiderAssignmentGate({ mapsKey }: { mapsKey?: string | null }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [queue, setQueue] = useState<PendingAssignment[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const current = queue[0] ?? null;

  const poll = useCallback(async () => {
    try {
      const res = await fetch("/api/rider/assignments/pending", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { results: PendingAssignment[] };
      setQueue(data.results ?? []);
    } catch {
      /* transient network error — keep last state, retry next tick */
    }
  }, []);

  useEffect(() => {
    // Defer the first poll out of the effect body (avoids sync setState-in-effect).
    const first = setTimeout(poll, 0);
    const id = setInterval(poll, 5000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [poll]);

  // Beep + focus when a new offer becomes current.
  useEffect(() => {
    if (!current) return;
    dialogRef.current?.querySelector<HTMLButtonElement>('[data-testid="assignment-accept"]')?.focus();
    try {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AC) {
        const ctx = new AC();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 880;
        gain.gain.value = 0.08;
        osc.start();
        osc.stop(ctx.currentTime + 0.25);
      }
    } catch {
      /* autoplay blocked — visual alert is enough */
    }
    // Re-run only when the current offer changes (deliberate — not on every poll).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.order]);

  // Block Escape while the modal is open; trap focus.
  useEffect(() => {
    if (!current) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
      }
      if (e.key === "Tab" && dialogRef.current) {
        const focusables = dialogRef.current.querySelectorAll<HTMLElement>('button, [href], input, [tabindex]:not([tabindex="-1"])');
        if (focusables.length) {
          const first = focusables[0];
          const last = focusables[focusables.length - 1];
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    }
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [current]);

  async function respond(action: "accept" | "reject") {
    if (!current || busy) return;
    // Client validation first — the message lands under the reason input.
    if (action === "reject" && !reason.trim()) {
      setReasonError(t("errors.rider.rejectionReasonRequired"));
      return;
    }
    setBusy(true);
    setError(null);
    setReasonError(null);
    try {
      const res = await fetch(`/api/rider/assignments/${current.order}/respond`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, reason: reason.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        const { fieldErrors, formError } = parseFieldErrors(data, t("common.error"));
        // A rejection-reason complaint belongs under that field, not in a banner.
        setReasonError(fieldErrors.reason ?? null);
        setError(fieldErrors.reason ? null : formError);
        return; // the typed reason is kept so it can be corrected
      }
      setRejecting(false);
      setReason("");
      setQueue((q) => q.slice(1)); // drop the resolved offer; poll reconciles
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  if (!current) return null;

  const mapSrc = mapsKey && current.delivery_lat != null && current.delivery_lng != null
    ? `https://www.google.com/maps/embed/v1/place?key=${mapsKey}&q=${current.delivery_lat},${current.delivery_lng}`
    : null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="assignment-title"
      data-testid="rider-assignment-modal"
    >
      <div ref={dialogRef} className="w-full max-w-md rounded-2xl border border-border-strong bg-surface-card p-5 shadow-2xl">
        <h2 id="assignment-title" className="text-lg font-extrabold text-fg-base">
          {t("assignment.newOrderTitle")}
        </h2>
        <p className="mt-1 break-all font-mono text-sm font-bold text-brand-500">{current.order_number ?? `#${current.order}`}</p>

        <dl className="mt-3 space-y-2 text-sm">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-fg-subtle">{t("assignment.deliveryTo")}</dt>
            <dd className="break-words text-fg-base">{current.delivery_address}</dd>
          </div>
          {current.distance_km != null ? (
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-fg-subtle">{t("assignment.distance")}</dt>
              <dd className="text-fg-base">{current.distance_km} km</dd>
            </div>
          ) : null}
        </dl>

        <div className="mt-3 overflow-hidden rounded-xl border border-border-base">
          {mapSrc ? (
            <iframe title="map" src={mapSrc} className="h-40 w-full" loading="lazy" />
          ) : (
            <div className="flex h-24 items-center justify-center bg-surface-muted text-xs text-fg-muted">
              {t("assignment.mapUnavailable")}
            </div>
          )}
        </div>

        {error ? <p className="mt-2 text-sm text-red-600" role="alert">{error}</p> : null}

        {rejecting ? (
          <div className="mt-3">
            <label htmlFor="assignment-reject-reason" className="mb-1 block text-sm font-medium text-fg-base">
              {t("assignment.rejectReason")}
              <span className="text-brand-500" aria-hidden="true"> *</span>
            </label>
            <Input
              id="assignment-reject-reason"
              name="reason"
              autoFocus
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                if (reasonError) setReasonError(null);
              }}
              aria-invalid={Boolean(reasonError)}
              aria-describedby={reasonError ? "assignment-reject-reason-error" : undefined}
              placeholder={t("assignment.rejectReasonPlaceholder")}
            />
            <FieldError id="assignment-reject-reason-error" message={reasonError} />
            <div className="mt-3 flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setRejecting(false)} disabled={busy}>
                {t("common.cancel")}
              </Button>
              <Button className="flex-1 bg-red-600 hover:bg-red-700" onClick={() => respond("reject")} disabled={busy}>
                {t("assignment.confirmReject")}
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-4 flex gap-2">
            <Button variant="success" className="flex-1" onClick={() => respond("accept")} disabled={busy} data-testid="assignment-accept">
              {t("assignment.accept")}
            </Button>
            <Button variant="outline" className="flex-1 text-red-600" onClick={() => setRejecting(true)} disabled={busy} data-testid="assignment-reject">
              {t("assignment.reject")}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
