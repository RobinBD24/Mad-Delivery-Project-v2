import type { Metadata } from "next";
import { DM_Sans } from "next/font/google";

import { BranchesCoverage } from "@/components/home/BranchesCoverage";
import { CallToOrder } from "@/components/home/CallToOrder";
import { CartDrawer } from "@/components/home/CartDrawer";
import { BranchSwitchDialog } from "@/components/home/BranchSwitchDialog";
import { CartToast } from "@/components/home/CartToast";
import { CutoffCountdown } from "@/components/home/CutoffCountdown";
import { FloatingActions } from "@/components/home/FloatingActions";
import { Footer } from "@/components/home/Footer";
import { Header } from "@/components/home/Header";
import { HeroSection } from "@/components/home/HeroSection";
import { HomeCartProvider } from "@/components/home/home-cart-context";
import { MenuSection } from "@/components/home/MenuSection";
import { OperatingHours } from "@/components/home/OperatingHours";
import { getOptionalUser } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import type { Brand } from "@/lib/home/types";
import { getCompanyLogoUrl } from "@/lib/services/settings";
import { BranchBar, type BranchBarContext } from "@/components/home/BranchBar";
import { resolveCustomerBranch } from "@/lib/services/customer-branch";
import { branchMenu, publicMenu } from "@/lib/services/public-catalog";
import { publicHomeBranches } from "@/lib/selectors";
import { siteOrigin } from "@/lib/seo/site";

const dmSans = DM_Sans({ subsets: ["latin"], weight: ["400", "500", "700", "800", "900"] });

const HOME_TITLE = "MAD Delivery — Cheez! & Madchef | Dhaka";
const HOME_DESCRIPTION =
  "Order from Cheez! Pizza and Madchef in Dhaka. Pizza, pasta, boats, burgers & more — one platform, one helpline.";

/**
 * PHASE B — the storefront is the one page meant to be found. It declares its
 * own canonical (self-referencing, so no duplicate canonicals) and the social
 * cards; the base URL comes from the deployment, never a hardcoded domain.
 */
export async function generateMetadata(): Promise<Metadata> {
  const origin = await siteOrigin();
  return {
    title: HOME_TITLE,
    description: HOME_DESCRIPTION,
    alternates: { canonical: "/" },
    openGraph: {
      type: "website",
      url: origin,
      title: HOME_TITLE,
      description: HOME_DESCRIPTION,
      siteName: "MAD DELIVERY HQ",
    },
    twitter: { card: "summary_large_image", title: HOME_TITLE, description: HOME_DESCRIPTION },
    robots: { index: true, follow: true },
  };
}

/**
 * Public restaurant landing page (server component). Composes the homepage
 * sections; interactive parts (menu filtering, cart) live in client components
 * wrapped by <HomeCartProvider>. No authentication required.
 */
export default async function HomePage() {
  // Public page: resolve auth state without redirecting logged-out visitors.
  const user = await getOptionalUser();
  const { t } = await getT();
  const logoUrl = await getCompanyLogoUrl(); // req #3 — global logo in the public header
  // req #8 — real branches from the database (no hardcoded demo branches). An
  // empty result renders an empty state rather than fabricated data.
  const branches = await publicHomeBranches();
  // BRANCH SCOPE. An authenticated CUSTOMER orders from exactly one branch — the
  // nearest eligible one, resolved server-side from their own trusted GPS fix or
  // default saved address. The catalogue is scoped to it, so every section (cards,
  // category tabs, nav search) is drawn from the same single-branch query and no
  // section can show a product the customer cannot buy. Resolution is per request
  // and never cached: it depends on one customer's private coordinates.
  //
  // Guests keep the existing all-branches showcase. No eligible branch (or no
  // location) → an EMPTY catalogue plus an explanatory state, never a fallback
  // branch and never every branch's products.
  // ROLE-AWARE CATALOGUE MODE, resolved from the SERVER session — never from
  // anything the browser sends.
  //
  //   customer_nearest_branch — one branch, resolved from the customer's own
  //     trusted coordinates. No location or no covering branch → an empty
  //     catalogue plus an explanatory state, never a fallback branch.
  //   all_branches — every customer-orderable product across every live branch.
  //     Used by a super admin (who may browse and order like a customer without
  //     first having a GPS fix) and by guests, whose showcase is unchanged.
  //
  // Eligibility is identical in both modes: the same `customerProductWhere`
  // clause decides what is orderable, so a super admin never sees an inactive,
  // held, deleted or otherwise ineligible product on the PUBLIC page — those
  // stay in the admin product pages.
  const isCustomer = user?.role === "customer";
  const catalogueMode = isCustomer ? "customer_nearest_branch" : "all_branches";
  const branchContext = isCustomer ? await resolveCustomerBranch(user.id) : null;
  const menu =
    catalogueMode === "customer_nearest_branch"
      ? branchContext?.branchId != null
        ? await branchMenu(branchContext.branchId)
        : { categories: [], items: [], search: [] }
      : await publicMenu();

  // Which brand tab opens. Hardcoding "cheez" meant a catalogue holding only
  // Madchef products opened on an empty tab and reported "No items found" while
  // the products were loaded and eligible all along — the exact defect this
  // round fixes. Prefer the first brand that actually has products.
  const brandsWithItems = new Set(menu.items.map((item) => item.brand));
  const initialBrand: Brand = brandsWithItems.has("cheez")
    ? "cheez"
    : brandsWithItems.has("madchef")
      ? "madchef"
      : "cheez";

  // Why the grid is empty, in the customer's terms — never a hint that another
  // branch's products exist somewhere.
  const emptyMenuMessage = branchContext
    ? branchContext.state === "ok"
      ? t("nearestHome.noProductsForBranch")
      : branchContext.state === "out-of-zone"
        ? t("nearestHome.outOfZoneBody")
        : t("nearestHome.locationRequiredBody")
    : undefined;

  const branchBar: BranchBarContext | null = branchContext
    ? {
        state: branchContext.state,
        branchName: branchContext.branch?.name ?? null,
        brandType: branchContext.branch?.brandType ?? null,
        distanceKm: branchContext.distanceKm,
        deliveryFee: branchContext.deliveryFee,
        pickupEnabled: branchContext.branch?.pickupEnabled ?? false,
        prepTimeMinutes: branchContext.branch?.prepTimeMinutes ?? null,
        open: branchContext.open,
        opensAt: branchContext.opensAt,
      }
    : null;
  const origin = await siteOrigin();

  // PHASE B — structured data built from the REAL branch rows, so what search
  // engines read is what the database actually contains. No branches → no
  // fabricated locations, just the organisation itself.
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "MAD DELIVERY HQ",
    url: origin,
    description: HOME_DESCRIPTION,
    department: branches.map((b) => ({
      "@type": "Restaurant",
      name: b.name,
      address: { "@type": "PostalAddress", streetAddress: b.address, addressCountry: "BD" },
      servesCuisine: b.brandType,
      ...(b.openingTime && b.closingTime
        ? { openingHours: `Mo-Su ${b.openingTime}-${b.closingTime}` }
        : {}),
    })),
  };

  return (
    <div
      className={`${dmSans.className} min-h-screen overflow-x-clip bg-[#0c0c0e] pb-20 text-white md:pb-0`}
    >
      <script
        type="application/ld+json"
        data-testid="home-structured-data"
        // Server-rendered from our own data; no user input is interpolated.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <HomeCartProvider initialBrand={initialBrand}>
        <Header user={user} logoUrl={logoUrl} searchIndex={menu.search} />
        <main>
          <HeroSection />
          {/* One slim band, in the storefront's own palette — branch context for
              a signed-in customer without a new dashboard section. */}
          {branchBar ? <BranchBar context={branchBar} /> : null}
          <MenuSection
            branchCount={branches.length}
            categories={menu.categories}
            items={menu.items}
            emptyMessage={emptyMenuMessage}
          />
          <CallToOrder />
          <OperatingHours branches={branches} />
          <BranchesCoverage branches={branches} />
        </main>
        <Footer />
        <FloatingActions />
        <CartDrawer signedIn={Boolean(user)} />
        <CartToast />
        <BranchSwitchDialog />
        <CutoffCountdown />
      </HomeCartProvider>
    </div>
  );
}
