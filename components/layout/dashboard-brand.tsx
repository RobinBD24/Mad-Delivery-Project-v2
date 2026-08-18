import Link from "next/link";

import { CompanyLogo } from "@/components/layout/company-logo";

/**
 * The built-in brand mark — 38px orange rounded-square with the scooter glyph.
 * Inline SVG (no raster asset), so it is the guaranteed no-broken-image fallback
 * when no global company logo (req #3) is configured or one fails to load.
 */
export function BrandMark() {
  return (
    // .brand-mark — 38px, radius 11px, red gradient, soft red glow
    <span
      aria-hidden
      className="flex size-9.5 shrink-0 items-center justify-center rounded-[11px] bg-linear-145 from-brand-400 to-brand-700 shadow-[0_4px_14px_rgba(232,25,44,0.35)]"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-5.25 text-[#0a0c10]"
      >
        <circle cx="6" cy="17" r="2.6" />
        <circle cx="18" cy="17" r="2.6" />
        <path d="M8.5 17h7l-1.1-5.2h-3.1l-2-3H6" />
        <circle cx="14.3" cy="8.6" r="1.4" />
      </svg>
    </span>
  );
}

/**
 * The authenticated-app brand block, ported 1:1 from
 * static_design/Branch-manager_dashboard.html (.brand-row / .brand-mark /
 * .brand-name / .brand-sub): brand mark, "MAD DELIVERY" wordmark, tracked
 * "PLATFORM" subtitle.
 *
 * When a super admin has configured a global company logo (req #3) it renders
 * in place of the built-in mark; otherwise the inline SVG mark shows. The
 * wordmark is a proper noun and is never translated.
 */
export function DashboardBrand({ logoUrl }: { logoUrl?: string | null }) {
  return (
    <Link
      href="/"
      data-testid="dashboard-brand"
      aria-label="MAD DELIVERY Platform"
      className="flex items-center gap-2.5 px-5 pb-4 pt-5.5"
    >
      {logoUrl ? (
        <CompanyLogo
          src={logoUrl}
          alt="MAD DELIVERY"
          className="size-9.5 shrink-0 rounded-[11px] object-contain"
          fallback={<BrandMark />}
        />
      ) : (
        <BrandMark />
      )}
      <span className="flex flex-col">
        {/* .brand-name — Sora 800 16.5px */}
        <span className="font-heading text-[16.5px] font-extrabold leading-[1.1] tracking-[0.2px] text-sidebar-fg">
          MAD DELIVERY
        </span>
        {/* .brand-sub — 10px, 2.2px tracking, faint */}
        <span className="mt-0.5 text-[10px] font-semibold tracking-[2.2px] text-sidebar-fg-faint">
          PLATFORM
        </span>
      </span>
    </Link>
  );
}
