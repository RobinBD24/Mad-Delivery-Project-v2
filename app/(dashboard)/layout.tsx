import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";

import { DashboardShell } from "@/components/layout/dashboard-shell";
import { ScrollToTop } from "@/components/layout/scroll-to-top";
import { RiderAssignmentGate } from "@/components/rider/assignment-gate";
import { RiderLocationTracker } from "@/components/rider/location-tracker";
import { CartProvider } from "@/lib/hooks/use-cart";
import { requireUser } from "@/lib/auth/session";
import { getManagedBranch } from "@/lib/services/branches";
import { getCompanyLogoUrl } from "@/lib/services/settings";
import { activeDutySession } from "@/lib/services/rider-duty";
import { getLocale } from "@/lib/i18n/server";

/**
 * PHASE B — nothing behind the login is indexable. Declaring it on the shared
 * authenticated layout means every current and future dashboard page inherits
 * the rule, instead of each page having to remember it.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

/**
 * Shared authenticated shell for every role and every authenticated page
 * (/profile, /change-password, /complaints, /notifications included).
 * Layout/structure comes from static_design/Branch-manager_dashboard.html;
 * see components/layout/dashboard-shell.tsx.
 */
export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  // The topbar's BRANCH / MANAGER blocks only apply to a manager who actually
  // has a branch; null for every other role, and the blocks don't render.
  const branch = user.role === "branch_manager" ? await getManagedBranch(user.id) : null;
  const locale = await getLocale();
  const logoUrl = await getCompanyLogoUrl();
  // req #6/#12 — rider blocking assignment popup + GPS tracking (rider only).
  const riderOnDuty = user.role === "rider" ? Boolean(await activeDutySession(user.id)) : false;
  const mapsKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? null;

  return (
    <CartProvider>
      {/* `useSearchParams` needs a Suspense boundary; this renders nothing, so
          the boundary never shows a fallback. */}
      <Suspense fallback={null}>
        <ScrollToTop />
      </Suspense>
      <DashboardShell
        name={user.full_name || user.username}
        role={user.role}
        photo={user.profile_photo}
        version={user.updated_at}
        phone={user.phone}
        branchName={branch?.name ?? null}
        locale={locale}
        logoUrl={logoUrl}
      >
        {children}
      </DashboardShell>
      {user.role === "rider" ? (
        <>
          <RiderAssignmentGate mapsKey={mapsKey} />
          <RiderLocationTracker onDuty={riderOnDuty} />
        </>
      ) : null}
    </CartProvider>
  );
}
