import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * A titled section card for the product editor.
 *
 * The form previously ran as one flat stack of fields inside a single card, so
 * related controls had nothing tying them together and the eye had no landmarks.
 * Each section is its own card with compact padding, which is also what lets the
 * page split into a main column and a sidebar without either side looking empty.
 *
 * `<section>` + a real `<h2>` rather than a styled `<div>`: these are genuine
 * document sections, and the headings give screen-reader users the same
 * landmarks the visual grouping gives everyone else.
 */
export function FormSection({
  title,
  description,
  action,
  children,
  className,
  contentClassName,
}: {
  title: string;
  description?: string;
  /** Optional control in the header — e.g. "Add Variation". */
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-2xl border border-border-base bg-surface-card p-4 shadow-[var(--dashboard-shadow-panel)] sm:p-5",
        className,
      )}
    >
      <div className="mb-3.5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-fg-base sm:text-[1.0625rem]">{title}</h2>
          {description ? <p className="mt-0.5 text-xs text-fg-muted">{description}</p> : null}
        </div>
        {/* Wraps to its own line on narrow screens rather than being squeezed
            against a long translated heading. */}
        {action ? <div className="shrink-0 max-sm:w-full">{action}</div> : null}
      </div>
      <div className={cn("space-y-3.5", contentClassName)}>{children}</div>
    </section>
  );
}
