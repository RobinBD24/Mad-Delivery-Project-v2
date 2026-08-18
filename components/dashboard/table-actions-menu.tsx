"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

import { Icon } from "@/components/layout/icons";
import { cn } from "@/lib/utils";

export interface TableAction {
  label: string;
  href?: string;
  onSelect?: () => void;
  tone?: "default" | "danger";
  disabled?: boolean;
}

export function TableActionsMenu({
  label,
  actions,
}: {
  label: string;
  actions: TableAction[];
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative inline-flex">
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex size-10 items-center justify-center rounded-xl text-fg-muted hover:bg-surface-hover hover:text-fg-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
      >
        <Icon name="list" className="size-4.5" />
      </button>
      {open ? (
        <div role="menu" className="absolute right-0 top-11 z-30 min-w-44 overflow-hidden rounded-xl border border-border-base bg-surface-card p-1.5 shadow-xl">
          {actions.map((action) => {
            const itemClass = cn(
              "flex min-h-10 w-full items-center rounded-lg px-3 text-left text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500",
              action.tone === "danger"
                ? "text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10"
                : "text-fg-base hover:bg-surface-hover",
              action.disabled && "pointer-events-none opacity-50",
            );
            if (action.href) {
              return (
                <Link key={action.label} role="menuitem" href={action.href} className={itemClass} onClick={() => setOpen(false)}>
                  {action.label}
                </Link>
              );
            }
            return (
              <button
                key={action.label}
                type="button"
                role="menuitem"
                disabled={action.disabled}
                className={itemClass}
                onClick={() => {
                  setOpen(false);
                  action.onSelect?.();
                }}
              >
                {action.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
