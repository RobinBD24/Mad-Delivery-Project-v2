import type { Metadata } from "next";

import { siteOrigin } from "@/lib/seo/site";
import { Barlow_Condensed, Inter, JetBrains_Mono, Noto_Sans_Bengali, Sora } from "next/font/google";
import "./globals.css";

import { LanguageProvider } from "@/components/providers/language-provider";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { getLocale } from "@/lib/i18n/server";
import { THEME_BOOTSTRAP_SCRIPT } from "@/lib/theme/bootstrap";
import { resolveThemeForServer } from "@/lib/theme/config";
import { getThemePreference } from "@/lib/theme/server";

const bengali = Noto_Sans_Bengali({
  variable: "--font-bengali",
  subsets: ["bengali"],
  weight: ["400", "500", "600", "700", "800"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

// Homepage display face (hero title, section headings, stat numbers).
const barlow = Barlow_Condensed({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800", "900"],
});

// Auth (login) display face — matches the approved login design. Also the
// dashboard heading/KPI face in the branch-manager design.
const sora = Sora({
  variable: "--font-sora",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
});

// Tabular numbers in the dashboard design (KPI values, table amounts/times).
const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

/**
 * PHASE B — site-wide metadata.
 *
 * `metadataBase` is resolved per request from the forwarded/current host, so
 * canonical/OG links carry the domain that served the request
 * instead of localhost. Individual pages inherit this and only override what is
 * genuinely theirs.
 */
export async function generateMetadata(): Promise<Metadata> {
  const origin = await siteOrigin();
  const title = "MAD DELIVERY HQ";
  const description =
    "Multi-branch food delivery from MAD Delivery HQ — order from your nearest branch with live order tracking.";
  return {
    metadataBase: new URL(origin),
    title: { default: title, template: `%s | ${title}` },
    description,
    applicationName: title,
    alternates: { canonical: "/" },
    openGraph: {
      type: "website",
      siteName: title,
      title,
      description,
      url: origin,
      locale: "en_US",
      alternateLocale: ["bn_BD"],
    },
    twitter: { card: "summary_large_image", title, description },
    // Public pages are indexable; every authenticated section opts out in its
    // own layout, which is where the rule actually belongs.
    robots: { index: true, follow: true },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const themePreference = await getThemePreference();

  return (
    // suppressHydrationWarning: the pre-paint script may correct data-theme
    // (only the browser knows the OS setting) before React hydrates.
    <html
      lang={locale}
      data-theme={resolveThemeForServer(themePreference)}
      data-theme-pref={themePreference}
      data-scroll-behavior="smooth"
      suppressHydrationWarning
      className={`${bengali.variable} ${inter.variable} ${barlow.variable} ${sora.variable} ${jetbrains.variable} h-full antialiased`}
    >
      <head suppressHydrationWarning>
        <script
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }}
        />
      </head>
      <body className="flex min-h-full flex-col font-sans">
        <ThemeProvider initialPreference={themePreference}>
          <LanguageProvider locale={locale}>{children}</LanguageProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
