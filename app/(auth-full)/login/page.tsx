import type { Metadata } from "next";
import { Fragment } from "react";
import Image from "next/image";
import Link from "next/link";

import { LoginForm } from "@/components/auth/login-form";
import { Icon } from "@/components/layout/icons";
import { getT } from "@/lib/i18n/server";
import { getCompanyLogoUrl } from "@/lib/services/settings";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("auth.loginTitle") };
}

/** /login — approved login design (static_design/login). */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ expired?: string; reset?: string; callbackUrl?: string }>;
}) {
  const { expired, reset, callbackUrl } = await searchParams;
  const { t, fmt } = await getT();
  const logoUrl = await getCompanyLogoUrl(); // req #3 — global logo on the login brand panel

  const steps = [
    { icon: "clipboard-check", label: t("auth.stepConfirmed"), state: "is-done" },
    { icon: "kitchen-set", label: t("auth.stepPreparing"), state: "is-done" },
    { icon: "bike", label: t("auth.stepOnTheWay"), state: "is-active" },
    { icon: "circle-check", label: t("auth.stepDelivered"), state: "" },
  ];
  const lines = ["is-done", "is-active", ""];

  return (
    <main className="auth-wrapper">
      <div className="auth-card">
        {/* ============ Visual / Brand panel ============ */}
        <div className="brand-panel">
          <div className="brand-panel__bg" aria-hidden />
          <div className="brand-panel__glow" aria-hidden />

          <div className="brand-content">
            <Link href="/" className="brand-mark" aria-label="MAD Delivery">
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="brand-mark__logo" src={logoUrl} alt="MAD Delivery" width={48} height={48} decoding="async" />
              ) : (
                <Image
                  className="brand-mark__logo"
                  src="/images/brand/free-delivery-logo.webp"
                  alt="MAD Delivery"
                  width={804}
                  height={293}
                  priority
                />
              )}
            </Link>

            <span className="brand-eyebrow">{t("auth.brandEyebrow")}</span>
            <h1 className="brand-headline">{t("auth.brandHeadline")}</h1>
            <p className="brand-sub">{t("auth.brandSub")}</p>

            <ul className="brand-stats">
              <li>
                <span className="brand-stats__num">
                  {fmt.num(45)}
                  <small>{t("auth.statDeliveryUnit")}</small>
                </span>
                <span className="brand-stats__label">{t("auth.statDeliveryLabel")}</span>
              </li>
              <li>
                <span className="brand-stats__num">
                  {fmt.num(4.9)}
                  <small>★</small>
                </span>
                <span className="brand-stats__label">{t("auth.statRatingLabel")}</span>
              </li>
            </ul>
          </div>

          <div className="hero-scene" aria-hidden>
            <svg className="hero-scene__speedlines" viewBox="0 0 300 180" preserveAspectRatio="none">
              <defs>
                <linearGradient id="speedGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="var(--secondary)" stopOpacity="0" />
                  <stop offset="100%" stopColor="var(--secondary)" stopOpacity="0.9" />
                </linearGradient>
              </defs>
              <line x1="40" y1="60" x2="140" y2="60" />
              <line x1="20" y1="90" x2="150" y2="90" />
              <line x1="50" y1="120" x2="130" y2="120" />
              <line x1="10" y1="40" x2="100" y2="40" />
              <line x1="35" y1="145" x2="120" y2="145" />
            </svg>

            <Image
              className="hero-scene__rider-photo"
              src="/images/auth/rider-photo.webp"
              alt=""
              width={440}
              height={989}
              priority
            />

            <div className="phone-mock">
              <div className="phone-mock__notch" />
              <div className="phone-mock__screen">
                <div className="phone-mock__map">
                  <svg viewBox="0 0 220 280" preserveAspectRatio="none" className="phone-mock__map-svg">
                    <path
                      d="M 18,250 C 60,230 50,170 100,150 C 150,130 140,70 196,40"
                      fill="none"
                      stroke="var(--secondary)"
                      strokeWidth="2.5"
                      strokeDasharray="5 7"
                      strokeLinecap="round"
                    />
                    <circle cx="18" cy="250" r="6" fill="var(--secondary)" />
                    <circle cx="196" cy="40" r="6" fill="#fff" />
                  </svg>
                  <div className="phone-mock__badge">
                    <span className="phone-mock__badge-label">{t("auth.phoneBadgeLabel")}</span>
                    <span className="phone-mock__badge-time">
                      {t("auth.phoneBadgeTime")} <small>{t("auth.min")}</small>
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="order-stepper">
            {steps.map((step, i) => (
              <Fragment key={step.label}>
                <div className={`order-stepper__step ${step.state}`}>
                  <span className="order-stepper__icon">
                    <Icon name={step.icon} className="size-3.5" />
                  </span>
                  <span className="order-stepper__label">{step.label}</span>
                </div>
                {i < lines.length ? <span className={`order-stepper__line ${lines[i]}`} /> : null}
              </Fragment>
            ))}
          </div>
        </div>

        {/* ============ Form panel ============ */}
        <div className="form-panel">
          <LoginForm expired={expired === "1"} reset={reset === "1"} callbackUrl={callbackUrl} />
        </div>
      </div>
    </main>
  );
}
