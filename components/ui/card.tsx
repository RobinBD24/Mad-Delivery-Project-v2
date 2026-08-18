import type { ReactNode } from "react";
import Link from "next/link";

import { cn } from "@/lib/utils";

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn("min-w-0 rounded-2xl border border-border-base bg-surface-card", className)}>
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-4 border-b border-border-base px-5 py-4", className)}>
      <div>
        <h2 className="font-heading text-[15px] font-bold text-fg-base">{title}</h2>
        {subtitle ? <p className="mt-0.5 text-[11.5px] text-fg-subtle">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function CardContent({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("px-5 py-4", className)}>{children}</div>;
}

/**
 * .view-all — the brand-colored "View All →" link in a panel head.
 * Pass as CardHeader's `action` so every panel gets the mockup's treatment.
 */
export function ViewAllLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="text-xs font-semibold text-brand-500 hover:text-brand-400">
      {children}
    </Link>
  );
}

/**
 * .week-pill — the muted period label in a chart panel head ("This Week").
 * Static text, not a picker: the dashboards chart a fixed 7-day window, so a
 * dropdown here would be a dead control.
 */
export function PeriodPill({ children }: { children: ReactNode }) {
  return (
    <span className="flex items-center gap-1.5 text-[12.5px] font-semibold text-fg-muted">
      {children}
    </span>
  );
}
