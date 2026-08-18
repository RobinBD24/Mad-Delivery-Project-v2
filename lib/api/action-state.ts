import type { FieldErrors } from "@/lib/validation/contract";

/**
 * Shared shape for server-action form state (kept outside "use server" files,
 * which may only export async functions).
 *
 * VALIDATION STANDARD — a failed mutation now carries the backend's per-field
 * messages instead of collapsing them into one sentence. `errorState()` in
 * `lib/api/actions.ts` fills these in from the API response, and the form's
 * `useFormValidation({ serverErrors: state.fieldErrors })` renders each one
 * below its own field.
 *
 * `error` stays as the form-level message (and is what `<Alert tone="error">`
 * reads), so every existing call site keeps working unchanged.
 */
export interface ActionState {
  /** Form-level message — only what cannot be attributed to a single field. */
  error: string | null;
  /** field name → message. Keys match the form input `name`s exactly. */
  fieldErrors?: FieldErrors;
  success?: string;
  /** Changes on every server response so repeat failures re-trigger effects. */
  submissionId?: number;
}

export const initialActionState: ActionState = { error: null, fieldErrors: {} };

/**
 * req #5 — what the server ACTUALLY did to a branch. A branch carrying any
 * operational history is archived (everything preserved, no new orders); a
 * genuinely unused one is removed. The client never assumes which happened.
 */
export type BranchDeleteResult = "deleted" | "archived";

export interface BranchDeleteState extends ActionState {
  result?: BranchDeleteResult;
}

/**
 * PHASE H — reward earning-rule payload shared by the create/edit actions and
 * the admin form. Lives here because a "use server" module may only export
 * async functions. Empty date bounds are sent as null ("no bound").
 */
export interface EarningRuleFormValues {
  name: string;
  description?: string;
  fixed_points: number;
  points_per_currency: number;
  min_order_amount: number;
  eligible_order_status: string;
  eligible_payment_status: string;
  starts_at: string | null;
  ends_at: string | null;
  priority: number;
  branch_id: number | null;
  is_active?: boolean;
}
