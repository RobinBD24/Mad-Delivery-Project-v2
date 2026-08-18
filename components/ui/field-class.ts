/**
 * The single source of truth for form-control styling in BOTH themes.
 *
 * Kept in its own module (with no "use client" directive and no React imports)
 * so Server Components can style a plain `<input>`/`<select>` with the same
 * classes the shared client controls use, without pulling the client bundle in.
 */
export const FIELD_CLASS =
  "w-full rounded-xl border border-border-strong bg-surface-card px-3.5 py-2.5 text-sm text-fg-base " +
  "placeholder:text-fg-subtle focus:border-brand-500 focus:outline-2 focus:outline-brand-500/20 " +
  "disabled:bg-surface-muted disabled:text-fg-subtle " +
  // Invalid state — the control is marked aria-invalid whenever its <Field>
  // carries an error, so the red border AND the ring appear together. The ring
  // is a shape change, so the invalid state is not signalled by colour alone.
  "aria-[invalid=true]:border-red-500 aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-red-500/30 " +
  "aria-[invalid=true]:focus:outline-red-500/20";

/**
 * Native <select> extras.
 *
 * `appearance-none` is what forces the option list onto the theme surface, but
 * it also strips the browser's arrow — which left every dropdown in the app
 * looking like a plain text input. `field-select-arrow` (app/globals.css) draws
 * a single themed chevron as a background image; `pr-9` reserves the room for it
 * so a long selected value can never run underneath.
 *
 * One constant, so every select in the system — shared <Select>, the list
 * filters, and the bare server-rendered ones — gets the same arrow.
 */
export const SELECT_EXTRA_CLASS =
  "appearance-none pr-9 field-select-arrow [&>option]:bg-surface-card [&>option]:text-fg-base";
