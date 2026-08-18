import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

import { InlineErrorState } from "@/components/dashboard/dashboard-states";
import { cn } from "@/lib/utils";

export type SummaryAccent =
  | "brand"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "violet"
  | "neutral";

const ACCENTS: Record<SummaryAccent, string> = {
  brand: "var(--color-brand-500)",
  success: "#22c55e",
  warning: "#f59e0b",
  danger: "#ef4444",
  info: "#3b82f6",
  violet: "#8b5cf6",
  neutral: "var(--fg-muted)",
};

export interface SummaryCardProps {
  title: string;
  value: ReactNode;
  icon?: ReactNode;
  description?: ReactNode;
  status?: ReactNode;
  accent?: SummaryAccent;
  href?: string;
  progress?: number;
  testId?: string;
  className?: string;
}

export function SummaryCard({
  title,
  value,
  icon,
  description,
  status,
  accent = "brand",
  href,
  progress,
  testId = "summary-card",
  className,
}: SummaryCardProps) {
  const card = (
    <article
      data-testid={testId}
      className={cn(
        "kpi-accent group relative flex min-h-36 min-w-0 flex-col overflow-hidden rounded-2xl border border-border-base bg-surface-card p-4.5 shadow-[var(--dashboard-shadow-panel)]",
        href && "h-full transition-[border-color,box-shadow,transform] duration-200 group-hover:border-border-strong group-hover:shadow-lg group-focus-visible:border-brand-500 motion-reduce:transition-none",
        className,
      )}
      style={{ "--c": ACCENTS[accent] } as CSSProperties}
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="break-words text-[0.8125rem] font-semibold leading-5 text-fg-muted">{title}</h2>
          {status ? <div className="mt-2 text-xs font-semibold text-fg-base">{status}</div> : null}
        </div>
        {icon ? (
          <span aria-hidden className="accent-tint flex size-10 shrink-0 items-center justify-center rounded-xl">
            {icon}
          </span>
        ) : null}
      </div>

      <div
        data-summary-value
        className="mt-auto break-words pt-5 font-heading text-[1.75rem] font-extrabold leading-tight tracking-[-0.035em] text-fg-base sm:text-[1.875rem]"
      >
        {value}
      </div>

      {description ? (
        <div className="mt-2 break-words text-xs leading-5 text-fg-subtle">{description}</div>
      ) : null}

      {typeof progress === "number" ? (
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.min(100, Math.max(0, progress))}
          className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-muted"
        >
          <span
            className="block h-full rounded-full"
            style={{
              width: `${Math.min(100, Math.max(0, progress))}%`,
              background: "var(--c)",
            }}
          />
        </div>
      ) : null}
    </article>
  );

  if (!href) return card;

  return (
    <Link
      href={href}
      className="group block min-w-0 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-page"
    >
      {card}
    </Link>
  );
}

export function SummaryCardGrid({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      data-testid="summary-card-grid"
      className={cn("grid min-w-0 grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4", className)}
    >
      {children}
    </div>
  );
}

export function SummaryCardSkeleton({ label }: { label: string }) {
  return (
    <div
      aria-busy="true"
      aria-label={label}
      className="min-h-36 animate-pulse rounded-2xl border border-border-base bg-surface-card p-4.5 motion-reduce:animate-none"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="h-3.5 w-28 rounded-md bg-surface-hover" />
        <span className="size-10 rounded-xl bg-surface-hover" />
      </div>
      <span className="mt-7 block h-8 w-24 rounded-lg bg-surface-hover" />
      <span className="mt-3 block h-3 w-36 max-w-full rounded-md bg-surface-hover" />
    </div>
  );
}

export function SummaryCardError({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return <InlineErrorState title={title} description={description} action={action} className="min-h-36" />;
}
