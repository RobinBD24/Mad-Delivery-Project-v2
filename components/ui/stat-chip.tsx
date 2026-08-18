import type { CSSProperties, ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Compact KPI chip — .chip / .chip-row from
 * static_design/Branch-manager_dashboard.html: accent rail on the leading edge,
 * tinted icon square, faint caps label, Sora value.
 *
 * Use ChipRow for the mockup's 6-across strip; it collapses to 3 then 2 exactly
 * like the mockup's 1180px / 600px breakpoints.
 */
const ACCENTS = {
  brand: "var(--color-brand-500)",
  green: "#34d399",
  amber: "#fbbf24",
  blue: "#5b8def",
  violet: "#9b8cff",
  teal: "#22d3c9",
  red: "#ff5c5c",
} as const;

export function StatChip({
  label,
  value,
  icon,
  accent = "brand",
  /** Render the value in the mockup's tabular mono face (times, amounts). */
  mono = false,
}: {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  accent?: keyof typeof ACCENTS;
  mono?: boolean;
}) {
  return (
    <div
      className="chip-accent flex min-h-16 min-w-0 items-center gap-2.75 rounded-[13px] border border-border-base bg-surface-card px-3.5 py-3"
      style={{ "--c": ACCENTS[accent] } as CSSProperties}
    >
      {icon ? (
        <div className="accent-tint flex size-8.5 shrink-0 items-center justify-center rounded-[9px]">
          {icon}
        </div>
      ) : null}
      <div className="min-w-0">
        <div className="break-words text-[10.5px] font-semibold leading-4 tracking-[0.3px] text-fg-subtle">
          {label}
        </div>
        <div
          className={cn(
            "mt-px break-words font-bold text-fg-base",
            mono ? "font-mono text-[14px]" : "font-heading text-[16px]",
          )}
        >
          {value}
        </div>
      </div>
    </div>
  );
}

/** .chip-row — 6 across, dropping to 3 then 2, matching the mockup's 1180/600 steps. */
export function ChipRow({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
      {children}
    </div>
  );
}
