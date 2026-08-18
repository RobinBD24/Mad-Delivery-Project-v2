"use client";

import { Fragment, useEffect, useState, type ComponentProps } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { DashboardBrand } from "@/components/layout/dashboard-brand";
import { Icon } from "@/components/layout/icons";
import { ROLE_NAV, SUPPORT_PHONE, type NavItem } from "@/lib/constants";
import { useTranslation } from "@/lib/i18n/use-translation";
import { cn } from "@/lib/utils";
import type { Role } from "@/types";

/**
 * Dashboard sidebar — ported from static_design/Branch-manager_dashboard.html
 * (.sidebar / .brand-row / .hotline-pill / .nav-group-label / .nav-item):
 * 264px rail, sticky full height, brand row, hotline pill, then nav grouped
 * under section headings.
 *
 * Deviations from the mockup, all deliberate:
 *  1. The mockup's helmet-orange accent is mapped to the MAD brand red for
 *     nav states; the brand mark itself keeps the mockup orange (see
 *     DashboardBrand).
 *  2. The .sidebar-foot profile card is dropped — the topbar owns the user
 *     menu, and duplicating it was explicitly not wanted.
 *
 * Sections come from NavItem.group, so each role keeps its own nav (ROLE_NAV)
 * while sharing the mockup's structure.
 */

/**
 * Collect items into sections, keyed by first appearance. Grouping here rather
 * than trusting list order means a heading can never be printed twice when a
 * role's nav interleaves sections.
 */
function toSections(items: NavItem[]): { group: string | null; items: NavItem[] }[] {
  const sections: { group: string | null; items: NavItem[] }[] = [];
  for (const item of items) {
    const key = item.group ?? null;
    const existing = sections.find((s) => s.group === key);
    if (existing) existing.items.push(item);
    else sections.push({ group: key, items: [item] });
  }
  return sections;
}

/**
 * Large role menus should not prefetch every visible route at once. Restore
 * Next.js prefetch only when mouse, keyboard, or touch shows navigation intent.
 */
function IntentPrefetchLink(props: ComponentProps<typeof Link>) {
  const [intent, setIntent] = useState(false);

  return (
    <Link
      {...props}
      prefetch={intent ? null : false}
      // Next only manages scroll when this is not false. Its algorithm targets
      // "the top of the first Page element" and skips sticky/fixed siblings,
      // which in this shell lands part-way down the new page. Opting out leaves
      // `ScrollToTop` as the single, deterministic owner of scroll position.
      scroll={false}
      onMouseEnter={(event) => {
        setIntent(true);
        props.onMouseEnter?.(event);
      }}
      onFocus={(event) => {
        setIntent(true);
        props.onFocus?.(event);
      }}
      onTouchStart={(event) => {
        setIntent(true);
        props.onTouchStart?.(event);
      }}
    />
  );
}

function NavLinks({ role, onNavigate }: { role: Role; onNavigate?: () => void }) {
  const pathname = usePathname();
  const { t } = useTranslation();
  const items = ROLE_NAV[role];
  const sections = toSections(items);

  return (
    // .nav-scroll — 4px 14px 14px
    <nav className="scrollbar-thin flex-1 overflow-y-auto px-3.5 pb-3.5 pt-1" data-testid="sidebar-nav">
      {sections.map((section) => (
        <Fragment key={section.group ?? "_top"}>
          {section.group ? (
            // .nav-group-label
            <div
              data-testid="nav-group-label"
              className="px-3 pb-1.5 pt-4 text-[10.5px] font-bold tracking-[1.6px] text-sidebar-fg-faint"
            >
              {t(section.group)}
            </div>
          ) : null}
          {section.items.map((item) => {
            const active =
              pathname === item.href ||
              (item.href !== items[0].href && pathname.startsWith(`${item.href}/`));
            return (
              <IntentPrefetchLink
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "mb-0.5 flex min-h-11 items-center gap-3 rounded-[10px] border px-3 py-2.5 text-[13.5px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-inset",
                  active
                    ? // .nav-item.active — brand-tinted gradient + hairline border
                      "border-brand-500/25 bg-linear-to-r from-brand-500/15 to-brand-500/3 text-white"
                    : "border-transparent text-sidebar-fg-dim hover:bg-sidebar-hover hover:text-sidebar-fg",
                )}
              >
                <Icon
                  name={item.icon}
                  className={cn("size-4.5", active ? "text-brand-500" : "text-sidebar-fg-faint")}
                />
                {t(item.label)}
              </IntentPrefetchLink>
            );
          })}
        </Fragment>
      ))}
    </nav>
  );
}

/** .hotline-pill — the support number, straight from the shared constant. */
function HotlinePill() {
  const { t } = useTranslation();
  return (
    <div className="mx-5 mb-4.5 flex items-center gap-2 rounded-[10px] border border-red-500/28 bg-red-500/12 px-3 py-2.25 text-[12.5px] font-semibold text-red-300">
      <Icon name="phone" className="size-3.5 text-red-400" />
      {t("common.hotline", { phone: SUPPORT_PHONE })}
    </div>
  );
}

export function Sidebar({
  role,
  open,
  onClose,
  logoUrl,
}: {
  role: Role;
  /** Mobile drawer state — owned by the layout so the topbar button can drive it. */
  open: boolean;
  onClose: () => void;
  /** Global company logo URL (req #3); null → built-in brand mark. */
  logoUrl?: string | null;
}) {
  const { t } = useTranslation();

  // Close the drawer on Escape (mobile only; harmless on desktop).
  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <>
      {/* Scrim — mockup makes the sidebar off-canvas under 920px (lg). */}
      {open ? (
        <div
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
          onClick={onClose}
          aria-hidden
        />
      ) : null}

      <aside
        data-testid="dashboard-sidebar"
        className={cn(
          // .sidebar — 264px, sticky, own surface, hairline right border
          "fixed inset-y-0 left-0 z-50 flex w-66 shrink-0 flex-col border-r border-sidebar-border bg-surface-sidebar transition-transform duration-250 ease-out",
          "lg:sticky lg:top-0 lg:h-screen lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center justify-between pr-2">
          <DashboardBrand logoUrl={logoUrl} />
          <button
            type="button"
            onClick={onClose}
            className="flex size-11 items-center justify-center rounded-xl text-sidebar-fg-faint hover:bg-sidebar-hover hover:text-sidebar-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 lg:hidden"
            aria-label={t("common.close")}
          >
            <Icon name="x" />
          </button>
        </div>

        <HotlinePill />
        <NavLinks role={role} onNavigate={onClose} />
      </aside>
    </>
  );
}
