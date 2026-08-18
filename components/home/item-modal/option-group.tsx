"use client";

import { forwardRef, type ReactNode } from "react";

/**
 * Section wrapper from the reference design: compact uppercase heading
 * (emoji prefix), stacked option rows, optional inline validation error.
 */
export const OptionGroup = forwardRef<HTMLDivElement, {
  title: string;
  emoji?: string;
  error?: string;
  children: ReactNode;
}>(function OptionGroup({ title, emoji, error, children }, ref) {
  return (
    <div ref={ref} className="mt-4.5" role="radiogroup" aria-label={title}>
      <p className="mb-2 text-[0.68rem] font-bold uppercase tracking-widest text-[#606070]">
        {emoji ? `${emoji} ` : ""}
        {title}
      </p>
      {error ? (
        <p className="mb-2 rounded-lg border border-brand-500/30 bg-brand-500/10 px-3 py-1.5 text-[0.75rem] font-semibold text-brand-400" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex flex-col gap-1.75">{children}</div>
    </div>
  );
});
