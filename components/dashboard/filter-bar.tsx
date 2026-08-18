import Link from "next/link";
import type { ReactNode } from "react";

import { Icon } from "@/components/layout/icons";
import { cn } from "@/lib/utils";

export interface ActiveFilter {
  key: string;
  label: string;
  value: string;
  removeHref: string;
}

export function FilterBar({
  search,
  filters,
  activeFilters = [],
  clearHref,
  clearLabel,
  resultsLabel,
  className,
}: {
  search?: ReactNode;
  filters?: ReactNode;
  activeFilters?: ActiveFilter[];
  clearHref?: string;
  clearLabel?: string;
  resultsLabel?: string;
  className?: string;
}) {
  return (
    <section
      data-testid="filter-bar"
      className={cn("rounded-2xl border border-border-base bg-surface-card p-3.5 shadow-[var(--dashboard-shadow-panel)]", className)}
    >
      <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center">
        {search ? <div className="min-w-0 flex-1">{search}</div> : null}
        {filters ? <div className="flex min-w-0 flex-wrap items-center gap-2">{filters}</div> : null}
      </div>
      {activeFilters.length > 0 || resultsLabel ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border-base/70 pt-3">
          {resultsLabel ? <p className="mr-auto text-xs font-medium text-fg-muted">{resultsLabel}</p> : null}
          {activeFilters.map((filter) => (
            <Link
              key={filter.key}
              href={filter.removeHref}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-border-base bg-surface-muted px-3 text-xs font-semibold text-fg-base hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              <span>{filter.label}: {filter.value}</span>
              <Icon name="x" className="size-3.5" />
            </Link>
          ))}
          {clearHref && clearLabel ? (
            <Link
              href={clearHref}
              className="inline-flex min-h-10 items-center rounded-lg px-3 text-xs font-semibold text-brand-600 hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:hover:bg-brand-500/10"
            >
              {clearLabel}
            </Link>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
