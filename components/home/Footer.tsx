import Link from "next/link";

import { getT } from "@/lib/i18n/server";

const LOCATIONS = ["Dhanmondi", "Banani", "Uttara", "Bashundhara", "Mirpur"];

export async function Footer() {
  const { t, fmt } = await getT();

  const colTitle = "mb-3.5 text-[0.75rem] font-bold uppercase tracking-wide text-[#606070]";
  const colLink = "text-[0.85rem] text-[#a0a0b0] transition-colors hover:text-white";

  return (
    <footer className="border-t border-white/8 bg-[#08080A] px-5 pb-6 pt-12">
      <div className="mx-auto max-w-300">
        <div className="footer-grid">
          <div>
            <h3 className="font-display text-[1.6rem] font-black text-white" style={{ letterSpacing: "1px" }}>
              MAD <span className="text-brand-500">DELIVERY</span>
            </h3>
            <p className="mt-2 max-w-65 text-[0.85rem] leading-7 text-[#a0a0b0]">
              {t("home.footer.aboutText", { n: fmt.num(10) })}
            </p>
            <div className="mt-4 flex gap-2.5">
              {["🍕", "🔥"].map((emoji) => (
                <span
                  key={emoji}
                  className="flex size-9 items-center justify-center rounded-lg border border-white/8 bg-surface-dark text-[1.1rem]"
                >
                  {emoji}
                </span>
              ))}
            </div>
          </div>

          <div>
            <h4 className={colTitle}>{t("home.footer.brands")}</h4>
            <ul className="space-y-2">
              <li><a href="#menu-section" className={colLink}>Cheez! Pizza</a></li>
              <li><a href="#menu-section" className={colLink}>Madchef</a></li>
            </ul>
          </div>

          <div>
            <h4 className={colTitle}>{t("home.footer.locations")}</h4>
            <ul className="space-y-2">
              {LOCATIONS.map((l) => (
                <li key={l}><a href="#branches" className={colLink}>{l}</a></li>
              ))}
              <li><a href="#branches" className="text-[0.85rem] text-brand-400 hover:underline">{t("home.footer.moreLocations", { n: fmt.num(5) })}</a></li>
            </ul>
          </div>

          <div>
            <h4 className={colTitle}>{t("home.footer.accountContact")}</h4>
            <ul className="space-y-2">
              <li><a href="tel:09638050505" className={colLink}>{t("home.footer.callForOrder", { phone: "09638-050505" })}</a></li>
              <li><Link href="/login" className={colLink}>{t("home.footer.staffLogin")}</Link></li>
              <li><Link href="/register" className={colLink}>{t("home.footer.createAccount")}</Link></li>
            </ul>
          </div>
        </div>

        <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-white/8 pt-6 text-[0.8rem] text-[#606070] sm:flex-row">
          <p>
            {t("home.footer.copyrightPre")}{" "}
            <a
              href="https://robinsecuritybd.online"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-brand-500 hover:underline"
            >
              Robin Security
            </a>
          </p>
          <p>Cheez! • Madchef — Dhaka, Bangladesh</p>
        </div>
      </div>
    </footer>
  );
}
