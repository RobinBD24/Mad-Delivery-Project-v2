"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { UserAvatar } from "@/components/common/user-avatar";
import { useHomeCart } from "@/components/home/home-cart-context";
import { NavSearch } from "@/components/home/NavSearch";
import type { SearchEntry } from "@/lib/home/types";
import { Icon } from "@/components/layout/icons";
import { LanguageSwitcher } from "@/components/language/language-switcher";
import { logoutAction } from "@/lib/auth/actions";
import { ROLE_DASHBOARD, SUPPORT_PHONE } from "@/lib/constants";
import { useTranslation } from "@/lib/i18n/use-translation";
import { cn } from "@/lib/utils";
import type { User } from "@/types";

const PHONE = SUPPORT_PHONE;

function PhoneIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z" />
    </svg>
  );
}

export function Header({
  user,
  logoUrl,
  searchIndex,
}: {
  user: User | null;
  logoUrl?: string | null;
  /** DB-built product search index, threaded down to <NavSearch>. */
  searchIndex: SearchEntry[];
}) {
  const { count, openCart } = useHomeCart();
  const { t, fmt } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [bounce, setBounce] = useState(false);
  const prevCount = useRef(count);
  const userRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (userRef.current && !userRef.current.contains(event.target as Node)) setUserMenuOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (count > prevCount.current) {
      setBounce(true);
      const timer = setTimeout(() => setBounce(false), 460);
      prevCount.current = count;
      return () => clearTimeout(timer);
    }
    prevCount.current = count;
  }, [count]);

  const loggedIn = Boolean(user);
  // A link labelled "Dashboard" goes to the dashboard. Where a role LANDS after
  // signing in is a separate decision (ROLE_HOME) — see PHASE O.
  const dashboardHref = user ? (ROLE_DASHBOARD[user.role] ?? "/") : "/login";
  const displayName = user ? user.full_name || user.username : "";

  return (
    // display:contents — the sticky nav must stick against the page, not this wrapper's box.
    <header className="contents">
      {/* Top strip — scrolls away; only the nav below is sticky */}
      <div
        className="flex flex-wrap items-center justify-center gap-4 bg-brand-500 px-4 py-2.25 font-display font-semibold text-white"
        style={{ fontSize: "0.95rem", letterSpacing: "1px" }}
      >
        <span className="topbar-pulse">{t("home.header.nowTakingOrders")}</span>
        <span className="topbar-sep opacity-50">|</span>
        <span className="topbar-brand-txt">Cheez!&nbsp;&nbsp;•&nbsp;&nbsp;Madchef</span>
        <span className="topbar-sep opacity-50">|</span>
        <a href={`tel:${PHONE.replace("-", "")}`} className="inline-flex items-center gap-1.5 hover:underline">
          <PhoneIcon className="size-3.5" /> {PHONE}
        </a>
      </div>

      {/* Nav — sticky */}
      <nav
        className="sticky top-0 z-40 border-b border-white/8 bg-[#0c0c0e]/95 backdrop-blur-xl transition-shadow"
        style={{ boxShadow: scrolled ? "0 2px 30px rgba(232,25,44,0.12)" : "none" }}
      >
        <div className="mx-auto flex h-14 max-w-300 items-center gap-3 px-4 md:h-18 sm:px-6">
          <Link href="/" className="flex shrink-0 flex-col items-center gap-0.5">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoUrl}
                alt="MAD Delivery"
                width={120}
                height={40}
                decoding="async"
                className="h-9 w-auto object-contain md:h-10"
              />
            ) : (
              <Image
                src="/images/brand/mad-logo.webp"
                alt="MAD Delivery"
                width={140}
                height={52}
                priority
                className="h-9 w-auto object-contain md:h-10"
              />
            )}
            <span
              className="hidden font-display text-lg font-black leading-none text-white md:block"
              style={{ letterSpacing: "1.5px" }}
            >
              MAD <span className="text-brand-500">DELIVERY</span>
            </span>
          </Link>

          <div className="flex min-w-0 flex-1 items-center justify-center px-1 sm:px-3">
            <NavSearch index={searchIndex} />
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <a
              href={`tel:${PHONE.replace("-", "")}`}
              className="hidden items-center gap-2 rounded-lg border border-white/8 bg-surface-dark px-3.5 py-2 text-sm font-semibold text-white hover:border-white/20 lg:flex"
            >
              <PhoneIcon className="size-3.5" /> {PHONE}
            </a>

            <div className="hidden sm:block">
              <LanguageSwitcher tone="dark" />
            </div>

            {loggedIn ? (
              <Link
                href={dashboardHref}
                className="hidden rounded-full bg-white/8 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-white/15 sm:block"
              >
                {t("nav.dashboard")}
              </Link>
            ) : (
              <Link
                href="/login"
                className="hidden rounded-full bg-white/8 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-white/15 sm:block"
              >
                {t("home.header.login")}
              </Link>
            )}

            <button
              onClick={openCart}
              aria-label={t("home.header.cart")}
              data-testid="home-cart-button"
              className={cn(
                "flex items-center gap-2 rounded-full bg-brand-500 px-4 py-2 text-sm font-bold text-white hover:bg-brand-600",
                bounce && "animate-cart-bounce",
              )}
            >
              🛒
              {count > 0 ? (
                <span className="flex size-5 items-center justify-center rounded-full bg-white text-[0.72rem] font-extrabold text-brand-500">
                  {fmt.num(count)}
                </span>
              ) : (
                <span className="hidden sm:inline">{t("home.header.cart")}</span>
              )}
            </button>

            {user ? (
              <div className="relative" ref={userRef}>
                {/* Same testids as the dashboard topbar: a customer now LANDS
                    here after signing in, so this is their primary account menu
                    and logout, and the shared helpers must reach it. */}
                <button
                  onClick={() => setUserMenuOpen((v) => !v)}
                  className="flex items-center gap-2 rounded-full bg-white/8 py-1 pl-1 pr-2 hover:bg-white/15"
                  aria-label={displayName}
                  aria-expanded={userMenuOpen}
                  aria-haspopup="true"
                  data-testid="profile-menu-trigger"
                >
                  <UserAvatar
                    name={displayName}
                    photo={user.profile_photo}
                    version={user.updated_at}
                    className="size-8 text-xs font-bold"
                  />
                  <Icon name="chevron" className="size-4 rotate-90 text-white/60" />
                </button>

                {userMenuOpen ? (
                  <div className="absolute right-0 mt-2 w-52 overflow-hidden rounded-xl border border-slate-200 bg-white py-1.5 shadow-lg">
                    <Link
                      href="/profile"
                      onClick={() => setUserMenuOpen(false)}
                      className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50"
                    >
                      <Icon name="user" className="size-4" />
                      {t("topbar.myProfile")}
                    </Link>
                    <Link
                      href="/change-password"
                      onClick={() => setUserMenuOpen(false)}
                      className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50"
                    >
                      <Icon name="lock" className="size-4" />
                      {t("profile.changePassword")}
                    </Link>
                    <button
                      onClick={() => logoutAction()}
                      data-testid="logout-button"
                      className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50"
                    >
                      <Icon name="logout" className="size-4" />
                      {t("topbar.logout")}
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}

            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="flex size-9 items-center justify-center rounded-[10px] border border-white/8 bg-surface-dark text-white lg:hidden"
              aria-label={t("home.header.openMenu")}
              aria-expanded={menuOpen}
            >
              ☰
            </button>
          </div>
        </div>

        {menuOpen ? (
          <div className="border-t border-white/8 px-4 py-3 lg:hidden">
            <div className="flex flex-col gap-2 text-sm font-medium text-white/80">
              <div className="px-2 py-1 sm:hidden">
                <LanguageSwitcher tone="dark" />
              </div>
              <a href="#menu-section" onClick={() => setMenuOpen(false)} className="rounded-lg px-2 py-2 hover:bg-white/5">🍽️ {t("home.header.menu")}</a>
              <a href="#branches" onClick={() => setMenuOpen(false)} className="rounded-lg px-2 py-2 hover:bg-white/5">📍 {t("home.header.branches")}</a>
              <a href={`tel:${PHONE.replace("-", "")}`} className="rounded-lg px-2 py-2 hover:bg-white/5">📞 {PHONE}</a>
              {user ? (
                <>
                  <Link href={dashboardHref} onClick={() => setMenuOpen(false)} className="rounded-lg px-2 py-2 hover:bg-white/5">📊 {t("nav.dashboard")}</Link>
                  <Link href="/profile" onClick={() => setMenuOpen(false)} className="rounded-lg px-2 py-2 hover:bg-white/5">👤 {t("topbar.myProfile")}</Link>
                  <Link href="/change-password" onClick={() => setMenuOpen(false)} className="rounded-lg px-2 py-2 hover:bg-white/5">🔒 {t("profile.changePassword")}</Link>
                  <button onClick={() => logoutAction()} className="rounded-lg px-2 py-2 text-left text-red-400 hover:bg-white/5">🚪 {t("topbar.logout")}</button>
                </>
              ) : (
                <>
                  <Link href="/login" onClick={() => setMenuOpen(false)} className="rounded-lg px-2 py-2 hover:bg-white/5">🔑 {t("home.header.login")}</Link>
                  <Link href="/register" onClick={() => setMenuOpen(false)} className="rounded-lg px-2 py-2 hover:bg-white/5">📝 {t("home.header.register")}</Link>
                </>
              )}
            </div>
          </div>
        ) : null}
      </nav>
    </header>
  );
}
