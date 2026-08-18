"use client";

import { createContext, useContext, useId, type ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * THE ONE error presentation used by every form in the app.
 *
 * Rules this enforces (see `lib/validation/contract.ts`):
 *   - a field error renders directly BELOW its own field, never in a toast,
 *     never only at the top of the page, never in the native browser bubble;
 *   - small red text, readable in light AND dark mode, identical spacing and
 *     size on every dashboard;
 *   - it owns a stable id so the control can point at it with aria-describedby;
 *   - it is a live region, so a screen reader announces it when it appears.
 */

export const FIELD_ERROR_CLASS =
  "mt-1 block text-xs font-medium text-red-600 dark:text-red-400";

export function FieldError({
  id,
  message,
  className,
}: {
  id?: string;
  message?: string | null;
  className?: string;
}) {
  if (!message) return null;
  return (
    <span id={id} role="alert" aria-live="polite" className={cn(FIELD_ERROR_CLASS, className)}>
      {message}
    </span>
  );
}

/**
 * Form-level error: the message that cannot be attributed to a single field
 * (business-rule failures, unexpected server errors). Small red text placed
 * immediately above/near the submit area — NOT a replacement for field errors.
 */
export function FormError({
  id,
  message,
  className,
}: {
  id?: string;
  message?: string | null;
  className?: string;
}) {
  if (!message) return null;
  return (
    <p
      id={id}
      role="alert"
      aria-live="assertive"
      className={cn("text-sm font-medium text-red-600 dark:text-red-400", className)}
    >
      {message}
    </p>
  );
}

// ── Field ↔ control wiring ──────────────────────────────────────────────

interface FieldContextValue {
  /** id of the rendered <FieldError>, present only while there IS an error. */
  errorId?: string;
  /** id of the hint/description text, when one is shown. */
  hintId?: string;
  invalid: boolean;
}

const FieldContext = createContext<FieldContextValue | null>(null);

export function FieldContextProvider({
  value,
  children,
}: {
  value: FieldContextValue;
  children: ReactNode;
}) {
  return <FieldContext.Provider value={value}>{children}</FieldContext.Provider>;
}

/**
 * Read the surrounding <Field>'s a11y wiring.
 *
 * Every shared control (Input/Textarea/Select/PasswordInput) calls this and
 * applies `aria-invalid` + `aria-describedby` automatically, so a form only has
 * to pass `error` to <Field> once and the whole accessible relationship —
 * invalid state, described-by, live announcement — comes for free.
 * Explicit props on the control always win.
 */
export function useFieldAria(explicit: {
  "aria-invalid"?: boolean | "true" | "false" | "grammar" | "spelling";
  "aria-describedby"?: string;
}): { "aria-invalid"?: boolean | "true" | "false" | "grammar" | "spelling"; "aria-describedby"?: string } {
  const ctx = useContext(FieldContext);
  const describedBy =
    explicit["aria-describedby"] ??
    [ctx?.errorId, ctx?.hintId].filter(Boolean).join(" ") ??
    undefined;
  return {
    "aria-invalid": explicit["aria-invalid"] ?? (ctx?.invalid ? true : undefined),
    "aria-describedby": describedBy || undefined,
  };
}

/** Stable, collision-free ids for a field that renders its own markup. */
export function useFieldIds(name?: string): { controlId: string; errorId: string; hintId: string } {
  const auto = useId();
  const base = name ? `${name}-${auto}` : auto;
  return { controlId: `${base}-control`, errorId: `${base}-error`, hintId: `${base}-hint` };
}
