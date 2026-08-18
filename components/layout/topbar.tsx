"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

import { Icon } from "@/components/layout/icons";
import { ThemeSwitcher } from "@/components/layout/theme-switcher";
import { UserAvatar } from "@/components/common/user-avatar";
import { LanguageSwitcher } from "@/components/language/language-switcher";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { logoutAction } from "@/lib/auth/actions";
import { notificationsPath } from "@/lib/constants";
import { useTranslation } from "@/lib/i18n/use-translation";
import type { Role } from "@/types";

/**
 * Dashboard topbar — ported from static_design/Branch-manager_dashboard.html
 * (.topbar / .icon-btn / .profile-chip): sticky, blurred, hairline bottom
 * border, circular icon buttons on the right, pill-shaped profile chip.
 *
 * The mockup's BRANCH and MANAGER blocks render only for a branch manager who
 * actually has a branch — the mockup's versions were static placeholder text,
 * and five of the seven roles have no branch at all. The mockup's branch
 * *switcher* is not reproduced: nothing in the app lets a manager act for
 * another branch, so a picker there would be a dead control.
 */
export function Topbar({
  name,
  role,
  photo,
  version,
  phone,
  branchName,
  onMenuClick,
}: {
  name: string;
  role: Role;
  photo: string | null;
  version?: string | null;
  phone?: string | null;
  branchName?: string | null;
  /** Opens the mobile sidebar drawer (mockup's .menu-btn). */
  onMenuClick: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { t } = useTranslation();

  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <header
      data-testid="dashboard-topbar"
      className="sticky top-0 z-30 flex min-w-0 flex-nowrap items-center gap-2 border-b border-border-base bg-surface-page/85 px-2 py-2.5 backdrop-blur-md sm:gap-4 sm:px-6.5 sm:py-3"
    >
      <div className="flex min-w-0 shrink items-center gap-2 sm:gap-4">
        {/* .menu-btn — drawer trigger; the rail is permanent from lg up. */}
        <button
          type="button"
          onClick={onMenuClick}
          data-testid="sidebar-toggle"
          aria-label={t("common.openMenu")}
          className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-border-base bg-surface-muted text-fg-muted transition hover:text-fg-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 lg:hidden"
        >
          <Icon name="menu" />
        </button>
        <p className="hidden truncate font-heading text-sm font-bold text-fg-base min-[480px]:block lg:hidden">MAD DELIVERY HQ</p>

        {branchName ? (
          <>
            {/* .branch-select — read-only: this manager's branch */}
            <div
              data-testid="topbar-branch"
              className="hidden items-center gap-2.5 rounded-[11px] border border-border-base bg-surface-muted py-2 pl-3.5 pr-3 sm:flex"
            >
              <Icon name="store" className="size-4 text-fg-subtle" />
              <div>
                <div className="text-[10px] font-semibold tracking-[0.4px] text-fg-subtle">
                  {t("topbar.branch")}
                </div>
                <div className="font-heading text-[13.5px] font-bold text-fg-base">{branchName}</div>
              </div>
            </div>

            {/* .manager-card — hidden under the mockup's 920px breakpoint */}
            <div className="hidden items-center gap-2.5 rounded-[11px] border border-border-base bg-surface-muted py-1.5 pl-2 pr-3.5 lg:flex">
              <UserAvatar name={name} photo={photo} version={version} className="size-7.5 text-xs font-bold" />
              <div>
                <div className="text-[10px] font-semibold text-fg-subtle">{t("topbar.manager")}</div>
                <div className="text-[13px] font-semibold text-fg-base">{name}</div>
                {phone ? <div className="text-[11px] text-fg-muted">{phone}</div> : null}
              </div>
            </div>
          </>
        ) : null}
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-0.5 sm:gap-2">
        <NotificationBell href={notificationsPath(role)} />
        <ThemeSwitcher />
        <LanguageSwitcher />

        <div className="relative" ref={ref}>
          {/* .profile-chip */}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            data-testid="profile-menu-trigger"
            // A plain disclosure, not an ARIA `menu`: the panel holds ordinary
            // navigation links reachable with Tab. Declaring role="menu" would
            // promise arrow-key roving focus that this dropdown does not
            // implement, AND would strip the links of their `link` role.
            aria-haspopup="true"
            aria-expanded={open}
            className="flex min-h-11 min-w-11 items-center justify-center gap-2.5 rounded-full border border-border-base bg-surface-muted p-1.5 transition hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 sm:justify-start sm:pr-3"
          >
            <UserAvatar
              name={name}
              photo={photo}
              version={version}
              className="size-7 text-xs font-bold"
            />
            <span className="hidden text-left sm:block">
              <span className="block text-[12.5px] font-semibold text-fg-base">{name}</span>
              <span className="block text-[10.5px] text-fg-subtle">{t(`roles.${role}`)}</span>
            </span>
            <Icon name="chevron" className="size-3.5 rotate-90 text-fg-subtle" />
          </button>

          {open ? (
            <nav
              aria-label={t("topbar.accountMenu")}
              className="absolute right-0 mt-2 w-52 overflow-hidden rounded-xl border border-border-base bg-surface-card py-1.5 shadow-lg"
            >
              <Link
                href="/profile"
                onClick={() => setOpen(false)}
                className="flex min-h-11 items-center gap-2.5 px-4 py-2.5 text-sm text-fg-base hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-inset"
              >
                <Icon name="user" className="size-4" />
                {t("topbar.myProfile")}
              </Link>
              <Link
                href="/change-password"
                onClick={() => setOpen(false)}
                className="flex min-h-11 items-center gap-2.5 px-4 py-2.5 text-sm text-fg-base hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-inset"
              >
                <Icon name="lock" className="size-4" />
                {t("profile.changePassword")}
              </Link>
              <form action={logoutAction}>
                <button
                  type="submit"
                  data-testid="logout-button"
                  className="flex min-h-11 w-full items-center gap-2.5 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-inset dark:text-red-400 dark:hover:bg-red-500/10"
                >
                  <Icon name="logout" className="size-4" />
                  {t("topbar.logout")}
                </button>
              </form>
            </nav>
          ) : null}
        </div>
      </div>
    </header>
  );
}
