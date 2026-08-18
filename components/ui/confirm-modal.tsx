"use client";

import { useCallback, useEffect, useId, useRef, useState, useTransition, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import type { ActionState } from "@/lib/api/action-state";
import { useTranslation } from "@/lib/i18n/use-translation";

/**
 * A Server Action that calls `redirect()` settles its CLIENT promise by
 * REJECTING it with a NEXT_REDIRECT error — Next has no action result to
 * resolve with, so it rejects and lets `RedirectBoundary` handle the throw
 * (see `server-action-reducer`: "the action promise will be rejected with a
 * redirect ... as we won't have a valid action result").
 *
 * That means every statement after `await action(...)` is SKIPPED for such an
 * action. Left unhandled, this dialog never ran `setOpen(false)`, so its
 * `fixed inset-0` overlay stayed mounted over the page and swallowed every
 * subsequent click. The router has already navigated by the time we see this,
 * so the correct response is simply to close.
 */
function isRedirectRejection(err: unknown): boolean {
  if (typeof err !== "object" || err === null || !("digest" in err)) return false;
  const { digest } = err as { digest?: unknown };
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}

/**
 * Danger-action confirmation modal (delete / reject / cancel).
 * Create & edit forms are full pages — modals are for confirmations only.
 *
 * Each instance owns its own state, so one row's dialog can never disable or
 * block another row's. The overlay is torn down on EVERY exit path — success,
 * redirect, failure, cancel, Escape — so the page is never left pointer-locked.
 */
export function ConfirmModal({
  trigger,
  title,
  description,
  confirmLabel,
  withReason = false,
  reasonPlaceholder,
  action,
  onDone,
  open: controlledOpen,
  onOpenChange,
}: {
  /** Omit when the dialog is CONTROLLED — the caller supplies `open` instead. */
  trigger?: ReactNode;
  title: string;
  description: string;
  confirmLabel: string;
  withReason?: boolean;
  reasonPlaceholder?: string;
  action: (reason: string) => Promise<ActionState>;
  onDone?: (state: ActionState) => void;
  /**
   * Controlled mode. Needed when the opener is inside a pop-up menu: that menu
   * unmounts on the click that chooses the item, taking an uncontrolled dialog's
   * state (and its overlay) with it. With `open` lifted to the row, the dialog
   * outlives the menu.
   */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;
  const setOpen = useCallback(
    (next: boolean) => {
      if (!isControlled) setUncontrolledOpen(next);
      onOpenChange?.(next);
    },
    [isControlled, onOpenChange],
  );
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  /** Focus returns here when the dialog closes. */
  const triggerRef = useRef<HTMLSpanElement>(null);

  /** Single exit path: drop the overlay and clear this dialog's own state. */
  const close = useCallback(() => {
    setOpen(false);
    setReason("");
    setError(null);
  }, [setOpen]);

  function openDialog() {
    // Opening always starts clean, so a previous attempt's error or reason can
    // never appear against a new confirmation.
    setError(null);
    setReason("");
    setOpen(true);
  }

  function confirm() {
    // Duplicate-submit guard for THIS dialog only; other rows stay usable.
    if (pending) return;
    setError(null);
    startTransition(async () => {
      try {
        const state = await action(reason);
        if (state?.error) {
          // A branch-specific failure stays IN the dialog next to the action,
          // and the dialog remains usable so it can be retried or cancelled.
          setError(state.error);
          return;
        }
        close();
        onDone?.(state);
      } catch (err) {
        // The action redirected: the navigation already happened, just close.
        if (isRedirectRejection(err)) {
          close();
          return;
        }
        // Anything unexpected: report it, reset pending, keep the page usable.
        setError(t("errors.generic"));
      }
    });
  }

  // Escape cancels, matching the overlay click. Ignored mid-request so a
  // confirmed action is never abandoned halfway.
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !pending) {
        close();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) {
        event.preventDefault();
        dialogRef.current?.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, pending, close]);

  // Move focus into the dialog on open and back to the trigger on close.
  // `wasOpen` matters: without it the close branch also runs on MOUNT, when this
  // dialog has never been opened. Focusing an element scrolls it into view, so a
  // list rendering one of these per row dragged the page down to some row on
  // every navigation. Focus is restored only after a dialog that really opened.
  const wasOpen = useRef(false);
  useEffect(() => {
    // Only reacts to the open/close edge — every ref here is stable.
    if (open) {
      wasOpen.current = true;
      const first = dialogRef.current?.querySelector<HTMLElement>(
        'textarea:not([disabled]), button:not([disabled]), [href], input:not([disabled]), select:not([disabled])',
      );
      (first ?? dialogRef.current)?.focus();
    } else if (wasOpen.current) {
      wasOpen.current = false;
      triggerRef.current?.querySelector<HTMLElement>("button, [href]")?.focus?.();
    }
  }, [open]);

  return (
    <>
      {/* Controlled dialogs have no trigger of their own — the caller owns it. */}
      {trigger ? (
        <span ref={triggerRef} className="inline-flex" onClick={openDialog}>
          {trigger}
        </span>
      ) : null}
      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 dark:bg-black/70"
          onClick={() => !pending && close()}
        >
          <div
            ref={dialogRef}
            tabIndex={-1}
            aria-busy={pending}
            className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-2xl border border-border-base bg-surface-card p-5 shadow-xl outline-none sm:p-6"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={descriptionId}
          >
            <h3 id={titleId} className="text-lg font-semibold text-fg-base">{title}</h3>
            <p id={descriptionId} className="mt-2 text-sm text-fg-muted">{description}</p>
            {withReason ? (
              <Textarea
                className="mt-4"
                placeholder={reasonPlaceholder ?? t("modal.reasonPlaceholder")}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            ) : null}
            {error ? (
              <p className="mt-3 text-sm font-medium text-red-600 dark:text-red-400" role="alert">
                {error}
              </p>
            ) : null}
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Button variant="outline" onClick={close} disabled={pending}>
                {t("common.cancel")}
              </Button>
              <Button variant="danger" onClick={confirm} disabled={pending}>
                {pending ? <Spinner className="size-4 border-white/40 border-t-white" /> : null}
                {confirmLabel}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
