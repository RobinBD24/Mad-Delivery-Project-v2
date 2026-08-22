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
import Image from "next/image";
import Link from "next/link";

import { LanguageSwitcher } from "@/components/language/language-switcher";

/** Centered card layout for login/registration pages. */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-gradient-to-br from-ink-950 via-ink-900 to-brand-900/60">
      {/* Subtle radial glow behind the card for depth */}
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/3 h-[600px] w-[800px] rounded-full bg-brand-500/8 blur-3xl"
        aria-hidden="true"
      />
      <header className="relative z-10 flex items-center justify-between px-6 py-5">
        <Link href="/" className="inline-flex items-center">
          <Image
            src="/images/brand/free-delivery-logo.webp"
            alt="MAD Delivery"
            width={150}
            height={56}
            priority
            className="h-12 w-auto"
          />
        </Link>
        <LanguageSwitcher tone="dark" />
      </header>
      <main className="relative z-10 flex flex-1 items-center justify-center px-4 pb-14">
        <div className="w-full max-w-lg">{children}</div>
      </main>
    </div>
  );
}

