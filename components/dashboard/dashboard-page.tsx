import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export interface DashboardBreadcrumb {
  label: string;
  href?: string;
}

export interface DashboardPageHeaderProps {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  breadcrumbs?: DashboardBreadcrumb[];
  actions?: ReactNode;
  className?: string;
}

export function DashboardBreadcrumbs({ items }: { items: DashboardBreadcrumb[] }) {
  if (items.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb" className="mb-3">
      <ol className="flex flex-wrap items-center gap-1.5 text-xs font-medium text-fg-muted">
        {items.map((item, index) => (
          <li key={`${item.label}-${index}`} className="flex min-w-0 items-center gap-1.5">
            {index > 0 ? <span aria-hidden className="text-fg-subtle">/</span> : null}
            {item.href ? (
              <Link
                href={item.href}
                className="max-w-48 truncate rounded-md hover:text-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              >
                {item.label}
              </Link>
            ) : (
              <span aria-current="page" className="max-w-48 truncate text-fg-base">{item.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function DashboardPageHeader({
  title,
  subtitle,
  eyebrow,
  breadcrumbs = [],
  actions,
  className,
}: DashboardPageHeaderProps) {
  return (
    <header
      data-testid="dashboard-page-header"
      className={cn(
        "flex min-w-0 flex-col gap-4 border-b border-border-base/80 pb-5 sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0">
        <DashboardBreadcrumbs items={breadcrumbs} />
        {eyebrow ? (
          <p className="mb-1.5 text-xs font-bold tracking-[0.12em] text-brand-600">{eyebrow}</p>
        ) : null}
        <h1 className="break-words font-heading text-[1.625rem] font-extrabold leading-tight tracking-[-0.035em] text-fg-base sm:text-[1.875rem]">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-1.5 max-w-3xl text-sm leading-6 text-fg-muted">{subtitle}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex min-h-10 shrink-0 flex-wrap items-center gap-2 sm:justify-end [&_a]:min-h-10 [&_button]:min-h-10">
          {actions}
        </div>
      ) : null}
    </header>
  );
}

export function DashboardPage({
  children,
  width = "default",
  density,
  className,
}: {
  children: ReactNode;
  width?: "default" | "wide";
  /**
   * `compact` tightens headings, summary cards and table rows so an internal
   * list shows more records per screen. It is OPT-IN: the seven dashboard home
   * pages deliberately do not pass it, so their appearance is unchanged. The
   * rules live in one place (`[data-density="compact"]` in globals.css) rather
   * than as per-page overrides.
   */
  density?: "compact";
  className?: string;
}) {
  return (
    <div
      data-density={density}
      className={cn(
        "flex min-w-0 flex-col gap-[var(--dashboard-section-gap)]",
        width === "default" && "w-full",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function DashboardSection({
  title,
  description,
  action,
  children,
  className,
}: {
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("min-w-0", className)}>
      {title || description || action ? (
        <div className="mb-3.5 flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            {title ? <h2 className="font-heading text-base font-bold text-fg-base">{title}</h2> : null}
            {description ? <p className="mt-1 text-sm text-fg-muted">{description}</p> : null}
          </div>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}
