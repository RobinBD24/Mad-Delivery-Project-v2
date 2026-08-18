/**
 * THE SYSTEM-WIDE FORM VALIDATION CONTRACT.
 *
 * Every form in the app follows the same order:
 *   1. client JS validation runs first (`useFormValidation`)
 *   2. the request is sent only when the client rules pass
 *   3. the server validates again (services throw `validationError({...})`)
 *   4. server field errors come back and are shown UNDER their fields
 *   5. both sides share the constraints in `lib/validation/limits.ts`
 *   6. the form keeps every entered value when validation fails
 *
 * This module is CLIENT-SAFE (no server imports) so client components, server
 * actions and route handlers can all speak the same shape.
 */

/** field name → the single most relevant message for that field. */
export type FieldErrors = Record<string, string>;

/**
 * Normalized result of a failed mutation.
 *
 * `fieldErrors` keys match the form's input `name`s exactly (snake_case, as the
 * API uses). Repeated rows use dotted paths — `variations.0.price`.
 * `formError` carries only what cannot be attributed to a single field.
 */
export interface FormErrorState {
  fieldErrors: FieldErrors;
  formError: string | null;
}

export const EMPTY_ERRORS: FormErrorState = { fieldErrors: {}, formError: null };

/**
 * Payload keys that are NOT form fields — they carry a form-level message.
 * `detail` is what `ApiError`/`notFound`/`forbidden`/`conflict` produce;
 * `non_field_errors` is what cross-field service checks use.
 */
const FORM_LEVEL_KEYS = new Set(["detail", "non_field_errors", "formError", "message", "__form"]);

/** First usable string inside a nested error value (string | string[] | object). */
function firstMessage(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = firstMessage(entry);
      if (found) return found;
    }
    return null;
  }
  if (value && typeof value === "object") {
    for (const entry of Object.values(value)) {
      const found = firstMessage(entry);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Turn any API error payload into the standard shape.
 *
 * Accepts every response the backend already produces:
 *   { detail: "..." }                     → formError
 *   { email: "..." }                      → fieldErrors.email
 *   { email: ["..."] }                    → fieldErrors.email  (Zod / list form)
 *   { "variations.0.price": ["..."] }     → fieldErrors["variations.0.price"]
 *   { non_field_errors: ["..."] }         → formError
 *
 * Nothing recognizable → `fallback` as the form error, so the user still sees a
 * translated sentence instead of a blank form.
 */
export function parseFieldErrors(payload: unknown, fallback: string | null = null): FormErrorState {
  const fieldErrors: FieldErrors = {};
  let formError: string | null = null;

  if (typeof payload === "string") {
    formError = payload.trim() || fallback;
    return { fieldErrors, formError };
  }

  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
      const message = firstMessage(value);
      if (!message) continue;
      if (FORM_LEVEL_KEYS.has(key)) {
        formError ??= message;
      } else {
        fieldErrors[key] = message;
      }
    }
  }

  if (!formError && Object.keys(fieldErrors).length === 0) formError = fallback;
  return { fieldErrors, formError };
}

/** True when the state carries anything worth showing. */
export function hasErrors(state: FormErrorState): boolean {
  return Boolean(state.formError) || Object.keys(state.fieldErrors).length > 0;
}

/**
 * Server-action result for every mutation form.
 *
 * `error` is kept for backward compatibility with the many call sites that read
 * it (and with `<Alert tone="error" message={state.error} />`); it always mirrors
 * `formError`. New code should read `formError` / `fieldErrors`.
 */
export interface FormActionState extends FormErrorState {
  /** @deprecated mirror of `formError` — kept so existing call sites keep working. */
  error: string | null;
  success?: string;
  /** Bumped on every server response so effects can react to repeat failures. */
  submissionId?: number;
}

export const initialFormActionState: FormActionState = {
  error: null,
  formError: null,
  fieldErrors: {},
};
