"use client";

import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";

import { FieldContextProvider, FieldError, useFieldAria } from "@/components/ui/field-error";
import { FIELD_CLASS, SELECT_EXTRA_CLASS } from "@/components/ui/field-class";
import { cn } from "@/lib/utils";

/**
 * PHASE 2/14 — the single source of truth for form-control styling in BOTH
 * themes. Several forms previously hand-rolled a local `field` class that
 * omitted `bg-surface-card` / `text-fg-base`, which produced unreadable inputs
 * and (worst of all) unreadable native <select> option lists in dark mode.
 *
 * VALIDATION STANDARD — every control below reads the surrounding <Field> and
 * applies `aria-invalid` + `aria-describedby` on its own. A form only declares
 * `<Field error={errors.x}>` once and gets the complete accessible invalid
 * state: red border + ring, an announced error message below the control, and a
 * described-by relationship pointing at that message's stable id.
 */
export { FIELD_CLASS };

const FIELD_BASE = FIELD_CLASS;

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  const aria = useFieldAria(props);
  return <input className={cn(FIELD_BASE, className)} {...props} {...aria} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const aria = useFieldAria(props);
  return <textarea className={cn(FIELD_BASE, "min-h-20", className)} {...props} {...aria} />;
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  const aria = useFieldAria(props);
  return (
    <select className={cn(FIELD_BASE, SELECT_EXTRA_CLASS, className)} {...props} {...aria}>
      {children}
    </select>
  );
}

export function Field({
  label,
  required,
  hint,
  error,
  children,
  className,
  name,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  /** Inline validation error shown in red directly below the field. */
  error?: string;
  children: ReactNode;
  className?: string;
  /** Optional field name — makes the generated error id readable in the DOM. */
  name?: string;
}) {
  const auto = useId();
  const base = name ? `${name}${auto}` : auto;
  const errorId = `${base}-error`;
  const hintId = `${base}-hint`;
  const showHint = Boolean(hint) && !error;

  return (
    <FieldContextProvider
      value={{
        errorId: error ? errorId : undefined,
        hintId: showHint ? hintId : undefined,
        invalid: Boolean(error),
      }}
    >
      {/* The wrapping <label> keeps the implicit label↔control association, so
          no id has to be threaded through arbitrary children. */}
      <label className={cn("block", className)}>
        <span className="mb-1.5 block text-sm font-medium text-fg-base">
          {label}
          {required ? (
            <span className="text-brand-500" aria-hidden="true">
              {" "}
              *
            </span>
          ) : null}
        </span>
        {children}
        {error ? (
          <FieldError id={errorId} message={error} />
        ) : showHint ? (
          <span id={hintId} className="mt-1 block text-xs text-fg-subtle">
            {hint}
          </span>
        ) : null}
      </label>
    </FieldContextProvider>
  );
}

/**
 * Group wrapper for radio buttons / checkbox sets and for any control that
 * cannot live inside a single <label> (map pickers, star ratings, repeated
 * rows). Renders ONE accessible group label and ONE error below the whole
 * group — never the same message repeated on each option.
 */
export function FieldGroup({
  label,
  required,
  hint,
  error,
  children,
  className,
  name,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: ReactNode;
  className?: string;
  name?: string;
}) {
  const auto = useId();
  const base = name ? `${name}${auto}` : auto;
  const errorId = `${base}-error`;
  const hintId = `${base}-hint`;
  const labelId = `${base}-label`;
  const showHint = Boolean(hint) && !error;

  return (
    <FieldContextProvider
      value={{
        errorId: error ? errorId : undefined,
        hintId: showHint ? hintId : undefined,
        invalid: Boolean(error),
      }}
    >
      {/* `aria-invalid` is not a valid attribute on role="group"; the invalid
          state is carried by the individual controls inside (via context) and
          by the error message this group owns and points at. */}
      <div
        role="group"
        aria-labelledby={labelId}
        aria-describedby={error ? errorId : showHint ? hintId : undefined}
        className={cn("block", className)}
      >
        <span id={labelId} className="mb-1.5 block text-sm font-medium text-fg-base">
          {label}
          {required ? (
            <span className="text-brand-500" aria-hidden="true">
              {" "}
              *
            </span>
          ) : null}
        </span>
        {children}
        {error ? (
          <FieldError id={errorId} message={error} />
        ) : showHint ? (
          <span id={hintId} className="mt-1 block text-xs text-fg-subtle">
            {hint}
          </span>
        ) : null}
      </div>
    </FieldContextProvider>
  );
}

export function Checkbox({
  label,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const aria = useFieldAria(props);
  return (
    <label className="flex cursor-pointer items-center gap-2.5 text-sm text-fg-base">
      <input
        type="checkbox"
        className="size-4 rounded border-border-strong accent-brand-500 aria-[invalid=true]:outline-2 aria-[invalid=true]:outline-red-500"
        {...props}
        {...aria}
      />
      {label}
    </label>
  );
}
