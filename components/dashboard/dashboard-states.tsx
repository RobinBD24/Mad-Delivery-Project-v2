import type { ReactNode } from "react";

import { Icon } from "@/components/layout/icons";
import { cn } from "@/lib/utils";

function SkeletonLine({ className }: { className?: string }) {
  return <span aria-hidden className={cn("block animate-pulse rounded-lg bg-surface-hover motion-reduce:animate-none", className)} />;
}

export function SummaryGridSkeleton({ count = 4, label }: { count?: number; label: string }) {
  return (
    <div aria-busy="true" aria-label={label} className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="min-h-36 rounded-2xl border border-border-base bg-surface-card p-4.5">
          <div className="flex items-start justify-between gap-4">
            <SkeletonLine className="h-3.5 w-28" />
            <SkeletonLine className="size-10" />
          </div>
          <SkeletonLine className="mt-7 h-8 w-24" />
          <SkeletonLine className="mt-3 h-3 w-36 max-w-full" />
        </div>
      ))}
    </div>
  );
}

export function TableRowsSkeleton({ rows = 6, label }: { rows?: number; label: string }) {
  return (
    <div aria-busy="true" aria-label={label} className="overflow-hidden rounded-2xl border border-border-base bg-surface-card">
      <div className="grid grid-cols-4 gap-4 border-b border-border-base bg-surface-muted px-4 py-3">
        {Array.from({ length: 4 }, (_, index) => <SkeletonLine key={index} className="h-3 w-20 max-w-full" />)}
      </div>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="grid min-h-14 grid-cols-4 items-center gap-4 border-b border-border-base/70 px-4 last:border-0">
          <SkeletonLine className="h-3.5 w-28 max-w-full" />
          <SkeletonLine className="h-3.5 w-20 max-w-full" />
          <SkeletonLine className="h-6 w-16 max-w-full rounded-full" />
          <SkeletonLine className="ml-auto h-8 w-8" />
        </div>
      ))}
    </div>
  );
}

export function DashboardPageSkeleton({ label }: { label: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div aria-busy="true" aria-label={label} className="border-b border-border-base pb-5">
        <SkeletonLine className="h-8 w-64 max-w-[80%]" />
        <SkeletonLine className="mt-2 h-4 w-96 max-w-full" />
      </div>
      <SummaryGridSkeleton label={label} />
      <TableRowsSkeleton label={label} />
    </div>
  );
}

export function InlineErrorState({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div role="alert" className={cn("flex items-start gap-3 rounded-2xl border border-red-500/25 bg-red-500/8 p-4", className)}>
      <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-red-500/12 text-red-600 dark:text-red-400">
        <Icon name="x" className="size-4.5" />
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="font-heading text-sm font-bold text-fg-base">{title}</h3>
        {description ? <p className="mt-1 text-sm leading-5 text-fg-muted">{description}</p> : null}
        {action ? <div className="mt-3">{action}</div> : null}
      </div>
    </div>
  );
}

export function DashboardErrorState({
  title,
  description,
  reference,
  action,
}: {
  title: string;
  description: string;
  reference?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-h-[22rem] items-center justify-center px-4 py-10 text-center">
      <div className="max-w-md">
        <span aria-hidden className="mx-auto flex size-14 items-center justify-center rounded-2xl border border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-400">
          <Icon name="x" className="size-6" />
        </span>
        <h2 className="mt-4 font-heading text-xl font-bold text-fg-base">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-fg-muted">{description}</p>
        {reference ? <p className="mt-2 font-mono text-xs text-fg-subtle">{reference}</p> : null}
        {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
      </div>
    </div>
  );
}
