"use client";

import { useState, type ReactNode } from "react";

import { DashboardStatusBar } from "@/components/dashboard/dashboard-status-bar";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { useTranslation } from "@/lib/i18n/use-translation";
import type { Role } from "@/types";

/**
 * The authenticated shell for every role — .shell / .main / .content from
 * static_design/Branch-manager_dashboard.html.
 *
 * Client component purely to own the mobile drawer state, which the topbar's
 * menu button toggles and the sidebar consumes. The route layout stays a server
 * component so session/auth work is unchanged.
 */
export function DashboardShell({
  name,
  role,
  photo,
  version,
  phone,
  branchName,
  locale,
  logoUrl,
  children,
}: {
  name: string;
  role: Role;
  photo: string | null;
  version?: string | null;
  phone?: string | null;
  locale: "bn" | "en";
  /** Set only for a branch manager with a branch; drives the topbar BRANCH block. */
  branchName?: string | null;
  /** Global company logo URL (req #3); null → built-in brand mark. */
  logoUrl?: string | null;
  children: ReactNode;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { t } = useTranslation();

  return (
    // .shell
    <div className="flex min-h-screen">
      <a
        href="#dashboard-content"
        className="fixed left-3 top-3 z-[100] -translate-y-20 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg transition-transform focus:translate-y-0 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-brand-600 motion-reduce:transition-none"
      >
        {t("common.skipToContent")}
      </a>
      <Sidebar role={role} open={drawerOpen} onClose={() => setDrawerOpen(false)} logoUrl={logoUrl} />

      {/* .main — min-w-0 so wide tables scroll instead of stretching the shell */}
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          name={name}
          role={role}
          photo={photo}
          version={version}
          phone={phone}
          branchName={branchName}
          onMenuClick={() => setDrawerOpen(true)}
        />
        {/* .route-bar — sits between topbar and content, as in the mockup */}
        <DashboardStatusBar locale={locale} />
        <main id="dashboard-content" tabIndex={-1} className="min-w-0 flex-1">
          <div className="dashboard-content-inner">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
