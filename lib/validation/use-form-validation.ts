"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FocusEvent, type FormEvent } from "react";

import { useTranslation } from "@/lib/i18n/use-translation";
import type { FieldErrors } from "./contract";
import { validateImageFile, type Rule, type RuleResult } from "./rules";

export type FieldRules = Record<string, Rule[]>;

/**
 * THE client half of the system-wide validation contract.
 *
 * Order of events for every form in the app:
 *   1. these rules run FIRST, on submit;
 *   2. if anything fails the submit is cancelled — no request is sent, every
 *      typed value/selection/file stays exactly as it was, the modal stays
 *      open — and focus moves to the first invalid control;
 *   3. only when the client rules pass does the server action / fetch run;
 *   4. the server validates again and returns `fieldErrors`, which are merged
 *      back in here via `serverErrors` and shown under the same fields.
 *
 * Errors do NOT appear the moment a form opens. A field starts showing its
 * error only after it has been blurred (touched) or after a submit attempt;
 * from then on it re-validates as the value changes, so a message disappears
 * the instant the user fixes it.
 *
 * Usage:
 *   const { errors, formProps, submitting } = useFormValidation(RULES, {
 *     serverErrors: state.fieldErrors,
 *   });
 *   <form action={formAction} {...formProps}>
 *     <Field label="Email" error={errors.email}>
 *       <Input name="email" />
 *     </Field>
 */
export function useFormValidation(
  rules: FieldRules,
  options: {
    /** Field errors returned by the backend for the last submission. */
    serverErrors?: FieldErrors | null;
    /** Form-level backend error — used to decide where to scroll. */
    serverFormError?: string | null;
    /** Bumped by the caller on every server response (repeat failures re-focus). */
    submissionId?: number;
    /**
     * `pending` from useActionState / useTransition. When it falls back to
     * false the in-flight guard is released, so a server-action form can never
     * get stuck with its submit button disabled.
     */
    pending?: boolean;
    /** Extra checks that cannot be expressed as per-field string rules. */
    validate?: (values: Record<string, string>, form: HTMLFormElement) => FieldErrors;
    /** File inputs to check: name → whether a file is mandatory. */
    files?: Record<string, boolean>;
    /**
     * Called ONLY when every client rule passed — this is where a fetch-driven
     * form sends its request (and calls `event.preventDefault()` itself). Forms
     * that submit through `action={serverAction}` leave this out and let the
     * native submit proceed.
     */
    onSubmitValid?: (event: FormEvent<HTMLFormElement>) => void;
  } = {},
) {
  const { t } = useTranslation();
  const { serverErrors, submissionId, validate, files, pending, onSubmitValid } = options;

  /** Errors produced by the client rules. */
  const [clientErrors, setClientErrors] = useState<FieldErrors>({});
  /** Errors handed back by the server for the current values. */
  const [serverFieldErrors, setServerFieldErrors] = useState<FieldErrors>({});
  /** Fields the user has interacted with — gates when messages become visible. */
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [attempted, setAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const formRef = useRef<HTMLFormElement | null>(null);

  const message = useCallback(
    (result: NonNullable<RuleResult>) => t(result.key, result.vars),
    [t],
  );

  /** Read every string value currently in the form. */
  const readValues = useCallback((form: HTMLFormElement): Record<string, string> => {
    const fd = new FormData(form);
    const values: Record<string, string> = {};
    fd.forEach((value, key) => {
      if (typeof value === "string" && !(key in values)) values[key] = value;
    });
    return values;
  }, []);

  const runRules = useCallback(
    (form: HTMLFormElement): FieldErrors => {
      const values = readValues(form);
      const next: FieldErrors = {};

      for (const [name, checks] of Object.entries(rules)) {
        for (const check of checks) {
          const result = check(values[name] ?? "", values);
          if (result) {
            next[name] = message(result);
            break;
          }
        }
      }

      // File inputs — same MIME/extension/size limits the server enforces.
      for (const [name, isRequired] of Object.entries(files ?? {})) {
        const el = form.elements.namedItem(name);
        const file = el instanceof HTMLInputElement ? el.files?.[0] ?? null : null;
        const result = validateImageFile(file, isRequired);
        if (result) next[name] = message(result);
      }

      // Cross-field / bespoke checks contributed by the form itself.
      if (validate) Object.assign(next, validate(values, form));

      return next;
    },
    [rules, files, validate, message, readValues],
  );

  /** Re-run the rules and keep only the errors for fields already revealed. */
  const revalidate = useCallback(
    (form: HTMLFormElement, revealed: Record<string, boolean>, showAll: boolean) => {
      const all = runRules(form);
      if (showAll) return all;
      const visible: FieldErrors = {};
      for (const [name, msg] of Object.entries(all)) {
        if (revealed[name]) visible[name] = msg;
      }
      return visible;
    },
    [runRules],
  );

  /** Move keyboard focus (and the viewport) to a field. */
  const focusField = useCallback((form: HTMLFormElement | null, name: string) => {
    if (!form) return;
    const el = form.elements.namedItem(name);
    const target =
      el instanceof HTMLElement
        ? el
        : el instanceof RadioNodeList && el[0] instanceof HTMLElement
          ? (el[0] as HTMLElement)
          : form.querySelector<HTMLElement>(`[name="${CSS.escape(name)}"]`);
    if (!target) return;
    target.scrollIntoView({ block: "center", behavior: "smooth" });
    // Focus after the scroll is queued so the browser does not fight it.
    window.setTimeout(() => target.focus({ preventScroll: true }), 0);
  }, []);

  const onSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      const form = event.currentTarget;
      formRef.current = form;

      // Guard 2: a second submit while the first is still in flight is dropped,
      // so a double-click can never create two products / orders / payments.
      if (submitting) {
        event.preventDefault();
        return;
      }

      setAttempted(true);
      const next = runRules(form);
      setClientErrors(next);
      // A fresh attempt invalidates the previous server verdict.
      setServerFieldErrors({});

      if (Object.keys(next).length > 0) {
        event.preventDefault();
        // Report the field that appears FIRST in the DOM, not first in the
        // rules object — that is the one the user is looking for.
        const order = Array.from(form.elements)
          .map((el) => (el as HTMLInputElement).name)
          .filter((name) => name && name in next);
        focusField(form, order[0] ?? Object.keys(next)[0]);
        return;
      }
      setSubmitting(true);
      // Client rules passed — the request may go out.
      onSubmitValid?.(event);
    },
    [runRules, submitting, focusField, onSubmitValid],
  );

  /** Re-validate a field the user is fixing, once it has been revealed. */
  const handleChange = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      const form = event.currentTarget;
      formRef.current = form;
      const name = (event.target as HTMLInputElement)?.name;
      if (!name) return;

      // Editing a field always drops the stale server error for it.
      setServerFieldErrors((prev) => {
        if (!prev[name]) return prev;
        const next = { ...prev };
        delete next[name];
        return next;
      });

      const revealed = attempted || touched[name];
      if (!revealed) return;
      setClientErrors(revalidate(form, { ...touched, [name]: true }, attempted));
    },
    [attempted, touched, revalidate],
  );

  /** First blur reveals a field's error; later blurs refresh it. */
  const handleBlur = useCallback(
    (event: FocusEvent<HTMLFormElement>) => {
      const form = event.currentTarget;
      formRef.current = form;
      const name = (event.target as unknown as HTMLInputElement)?.name;
      if (!name || (!(name in rules) && !(name in (files ?? {})))) return;
      const nextTouched = { ...touched, [name]: true };
      setTouched(nextTouched);
      setClientErrors(revalidate(form, nextTouched, attempted));
    },
    [rules, files, touched, attempted, revalidate],
  );

  // Release the in-flight guard as soon as the request settles. `pending` is
  // owned by React (useActionState/useTransition), so this synchronizes with a
  // signal from outside this hook — the same pattern the app's data panels use.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (pending === false) setSubmitting(false);
  }, [pending]);

  // Merge the BACKEND's field errors in and jump to the first one. The server
  // response is the external system being synchronized here; it runs on every
  // response (`submissionId` changes even for a repeat failure).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSubmitting(false);
    if (!serverErrors || Object.keys(serverErrors).length === 0) {
      setServerFieldErrors({});
      return;
    }
    setServerFieldErrors(serverErrors);
    const form = formRef.current;
    const first = Object.keys(serverErrors)[0];
    if (form && first) focusField(form, first);
    // `serverErrors` is a fresh object on every response, which is exactly the
    // signal we want; `submissionId` covers repeat failures with equal content.
  }, [serverErrors, submissionId, focusField]);

  /** Client errors win — they describe what is on screen right now. */
  const errors = useMemo<FieldErrors>(
    () => ({ ...serverFieldErrors, ...clientErrors }),
    [serverFieldErrors, clientErrors],
  );

  /** Drop a field's error (e.g. a custom control the form drives itself). */
  const clearError = useCallback((name: string | undefined) => {
    if (!name) return;
    setClientErrors((prev) => {
      if (!prev[name]) return prev;
      const next = { ...prev };
      delete next[name];
      return next;
    });
    setServerFieldErrors((prev) => {
      if (!prev[name]) return prev;
      const next = { ...prev };
      delete next[name];
      return next;
    });
  }, []);

  /** Set an error for a control the string rules cannot see (maps, pickers). */
  const setFieldError = useCallback((name: string, msg: string | null) => {
    setClientErrors((prev) => {
      if (!msg) {
        if (!prev[name]) return prev;
        const next = { ...prev };
        delete next[name];
        return next;
      }
      return { ...prev, [name]: msg };
    });
  }, []);

  /** Clear everything — call ONLY after a confirmed successful submission. */
  const reset = useCallback(() => {
    setClientErrors({});
    setServerFieldErrors({});
    setTouched({});
    setAttempted(false);
    setSubmitting(false);
  }, []);

  /** Release the in-flight guard for forms that submit via fetch. */
  const finish = useCallback(() => setSubmitting(false), []);

  /**
   * Spread onto the <form>. `noValidate` suppresses the browser's own bubbles
   * so the app's inline messages are the only validation UI.
   */
  const formProps = useMemo(
    () => ({
      noValidate: true,
      onSubmit,
      onChange: handleChange,
      onBlur: handleBlur,
    }),
    [onSubmit, handleChange, handleBlur],
  );

  return {
    errors,
    formProps,
    onSubmit,
    handleChange,
    handleBlur,
    clearError,
    setFieldError,
    setErrors: setClientErrors,
    reset,
    finish,
    submitting,
    attempted,
    /** Run the rules on demand — used by multi-step forms to gate "Next". */
    validateNow: (form: HTMLFormElement | null) => (form ? runRules(form) : {}),
    focusField,
    formRef,
  };
}
