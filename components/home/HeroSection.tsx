import Image from "next/image";
import Link from "next/link";

import { getT } from "@/lib/i18n/server";

export async function HeroSection() {
  const { t, fmt } = await getT();

  const STATS = [
    { num: "2", label: t("home.hero.statBrands") },
    { num: "10", label: t("home.hero.statBranches") },
    { num: "80", label: t("home.hero.statMenuItems") },
  ];

  const BRAND_CARDS = [
    {
      logo: "/images/brand/cheez-logo.webp",
      name: "Cheez! Pizza",
      desc: t("home.hero.cheezDesc"),
      tag: t("home.hero.cheezTag"),
      tagClass: "bg-cheez-gold/12 text-cheez-gold",
      hoverClass: "hover:border-cheez-gold/35",
    },
    {
      logo: "/images/brand/madchef-logo.webp",
      name: "Madchef",
      desc: t("home.hero.madchefDesc"),
      tag: t("home.hero.madchefTag"),
      tagClass: "bg-brand-500/12 text-brand-500",
      hoverClass: "hover:border-brand-500/35",
    },
  ];

  return (
    <section className="hero-bg relative flex items-center overflow-hidden border-b border-white/8 md:min-h-[82vh]">
      <div className="grid-overlay pointer-events-none absolute inset-0" aria-hidden />
      <div className="home-container relative py-14 lg:py-20">
        <div className="hero-grid">
          <div>
            <span
              className="animate-fade-up inline-flex items-center gap-2 rounded-full border px-3.5 py-[5px] text-[0.72rem] font-bold uppercase text-brand-500"
              style={{
                background: "rgba(232,25,44,0.1)",
                borderColor: "rgba(232,25,44,0.25)",
                letterSpacing: "1.5px",
              }}
            >
              {t("home.hero.badge")}
            </span>
            <h1
              className="animate-fade-up mt-[18px] font-display font-black uppercase text-white"
              style={{ fontSize: "clamp(3rem, 8vw, 5.5rem)", lineHeight: 0.92, letterSpacing: "-0.5px" }}
            >
              <span className="italic text-brand-500">MAD</span>
              <br />
              <span style={{ WebkitTextStroke: "2px #f0f0f2", color: "transparent" }}>DELIVERY</span>
              <br />
              <span className="italic text-brand-500">PLATFORM</span>
            </h1>
            <p className="animate-fade-up mt-5 max-w-100 text-base leading-7 text-[#a0a0b0]">
              {t("home.hero.blurbPre")} <strong className="text-cheez-gold">Cheez!</strong>{" "}
              {t("home.hero.blurbAnd")} <strong className="text-brand-500">Madchef</strong>{" "}
              {t("home.hero.blurbPost", { n: fmt.num(10) })}
            </p>
            <div className="animate-fade-up mt-8 flex flex-wrap gap-3">
              <a
                href="#menu-section"
                className="inline-flex items-center gap-2 rounded-[10px] bg-brand-500 px-6.5 py-3.25 text-sm font-bold text-white transition-colors hover:bg-brand-600"
              >
                {t("home.hero.browseMenu")}
              </a>
              <a
                href="tel:09638050505"
                className="inline-flex items-center gap-2 rounded-[10px] border border-white/12 px-6.5 py-3.25 text-sm font-semibold text-white transition-colors hover:border-brand-500"
              >
                {t("home.hero.callToOrder")}
              </a>
            </div>
            <div className="animate-fade-up mt-9 flex gap-7">
              {STATS.map((s) => (
                <div key={s.label}>
                  <p className="font-display text-[2rem] font-extrabold leading-none text-white">
                    {fmt.num(s.num)}
                    <span className="text-brand-500">+</span>
                  </p>
                  <p className="mt-0.5 text-[0.72rem] uppercase tracking-wide text-[#606070]">{s.label}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="animate-fade-right hidden flex-col gap-4 md:flex">
            {BRAND_CARDS.map((card) => (
              <a
                key={card.name}
                href="#menu-section"
                className={`group flex items-center gap-4.5 rounded-[20px] border border-white/8 bg-surface-dark px-6 py-5.5 transition-all hover:translate-x-1.5 hover:shadow-2xl ${card.hoverClass}`}
              >
                <span className="relative size-15 shrink-0 overflow-hidden rounded-xl border border-white/8">
                  <Image src={card.logo} alt={card.name} fill sizes="60px" className="object-cover" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-display text-[1.3rem] font-extrabold leading-tight text-white" style={{ letterSpacing: "0.5px" }}>
                    {card.name}
                  </span>
                  <span className="block truncate text-[0.8rem] text-[#a0a0b0]">{card.desc}</span>
                  <span className={`mt-1 inline-flex items-center rounded-full px-2.25 py-0.75 text-[0.7rem] font-bold ${card.tagClass}`}>
                    {card.tag}
                  </span>
                </span>
                <span className="text-[#606070] transition-transform group-hover:translate-x-1">→</span>
              </a>
            ))}
            <p className="text-center text-xs text-white/40">
              {t("home.hero.newHere")}{" "}
              <Link href="/register" className="font-semibold text-brand-400 hover:underline">
                {t("home.hero.createAccount")}
              </Link>{" "}
              {t("home.hero.toPlaceOrders")}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
