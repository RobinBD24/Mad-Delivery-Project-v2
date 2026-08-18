import { getT } from "@/lib/i18n/server";

export async function CallToOrder() {
  const { t, fmt } = await getT();

  return (
    <section className="relative overflow-hidden bg-linear-to-br from-brand-500 to-[#a0101f] px-5 py-12.5 text-center text-white">
      <div className="grid-overlay-cta pointer-events-none absolute inset-0" aria-hidden />
      <div className="relative mx-auto max-w-3xl">
        <h2
          className="font-display font-black uppercase"
          style={{ fontSize: "clamp(1.8rem, 4vw, 2.8rem)", letterSpacing: "1px" }}
        >
          {t("home.callToOrder.title")}
        </h2>
        <p className="mt-2 text-[0.95rem] text-white/75">
          {t("home.callToOrder.availablePre")} <strong className="text-white">11:00 AM – 4:00 AM</strong>{" "}
          {t("home.callToOrder.availablePost", { n: fmt.num(10) })}
        </p>
        <p className="mt-1.5 text-[0.8rem] text-white/55">{t("home.callToOrder.hoursNote")}</p>
        <a
          href="tel:09638050505"
          className="mt-5.5 inline-flex items-center gap-3 rounded-[14px] border-2 border-white/25 bg-white/12 px-8 py-3.5 font-display font-black text-white transition-colors hover:bg-white/20"
          style={{ fontSize: "clamp(1.6rem, 3.5vw, 2.4rem)", letterSpacing: "2px" }}
        >
          📞 09638-050505
        </a>
      </div>
    </section>
  );
}
