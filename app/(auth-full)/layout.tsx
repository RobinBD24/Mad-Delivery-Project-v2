import type { Metadata } from "next";

/**
 * PHASE B — sign-in and registration screens are functional, not content. They
 * are kept out of the index so search results point at the storefront rather
 * than at a login form.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

import type { ReactNode } from "react";

import "./auth-design.css";

import { AuthThemeToggle } from "@/components/auth/auth-theme-toggle";
import { LanguageSwitcher } from "@/components/language/language-switcher";

/**
 * Full-bleed shell for the login screen (approved login design).
 *
 * Kept in its own route group so /login can own the whole viewport while
 * /register and /forgot-password keep the standard centered card layout.
 *
 * The theme is applied globally now — the root layout stamps <html data-theme>
 * pre-paint, so this shell only has to render the switcher.
 */
export default function AuthFullLayout({ children }: { children: ReactNode }) {
  return (
    <div className="auth-shell">
      <div className="auth-lang">
        <LanguageSwitcher />
      </div>
      <AuthThemeToggle />
      {children}
    </div>
  );
}
