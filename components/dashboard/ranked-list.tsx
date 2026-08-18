import type { ReactNode } from "react";
import Link from "next/link";

import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";

/**
 * Ranked list — .pop-list / .pop-item from
 * static_design/Branch-manager_dashboard.html: numbered rank square (rank 1
 * carries the brand tint), a 34px icon/image tile, name + meta, and a
 * right-aligned mono value.
 *
 * Server-component friendly (no hooks). Callers pass real icons or WEBP images
 * through `visual` — per the design rules, no emoji when a real asset exists.
 */
export interface RankedListItem {
  key: string | number;
  title: ReactNode;
  /** Secondary line under the title (count, description). */
  meta?: ReactNode;
  /** Right-aligned value (amount, count) — rendered in the mono face. */
  value?: ReactNode;
  /** 34px tile content: an <Icon …/> or an <img/photo> element. */
  visual?: ReactNode;
  /** Optional link target for the whole row. */
  href?: string;
}

export function RankedList({
  items,
  emptyTitle,
  className,
}: {
  items: RankedListItem[];
  /** Shown via EmptyState when there is nothing to rank. */
  emptyTitle: string;
  className?: string;
}) {
  if (items.length === 0) return <EmptyState title={emptyTitle} />;

  return (
    <ul className={cn("flex flex-col gap-3.25", className)} data-testid="ranked-list">
      {items.map((item, index) => {
        const row = (
          <>
            {/* .pop-rank — rank 1 gets the brand tint */}
            <span
              className={cn(
                "flex size-5.5 shrink-0 items-center justify-center rounded-[7px] text-[11px] font-bold",
                index === 0
                  ? "bg-brand-500/20 text-brand-500"
                  : "bg-surface-muted text-fg-muted",
              )}
            >
              {index + 1}
            </span>
            {/* .pop-emoji equivalent — icon/image tile */}
            {item.visual ? (
              <span className="flex size-8.5 shrink-0 items-center justify-center overflow-hidden rounded-[9px] bg-surface-muted text-fg-muted">
                {item.visual}
              </span>
            ) : null}
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-semibold text-fg-base">
                {item.title}
              </span>
              {item.meta ? (
                <span className="block truncate text-[11px] text-fg-subtle">{item.meta}</span>
              ) : null}
            </span>
            {item.value ? (
              // .pop-rev
              <span className="ml-auto shrink-0 pl-3 font-mono text-[12.5px] font-semibold tabular-nums text-fg-muted">
                {item.value}
              </span>
            ) : null}
          </>
        );

        const rowClass = "flex items-center gap-2.75 rounded-lg px-1.5 py-1 -mx-1.5 transition-colors";

        return (
          <li key={item.key}>
            {item.href ? (
              <Link href={item.href} className={cn(rowClass, "hover:bg-surface-hover")}>
                {row}
              </Link>
            ) : (
              <div className={rowClass}>{row}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
