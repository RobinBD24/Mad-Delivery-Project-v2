import Image from "next/image";

import { getT } from "@/lib/i18n/server";
import type { PublicHomeBranch } from "@/lib/selectors";

/**
 * req #8 — no hardcoded demo branches. Branch names and opening groupings come
 * from the database (publicHomeBranches); late-night delivery is decided by the
 * branch's own brand type, not by a hand-written name list.
 */
function lateNightBranches(branches: PublicHomeBranch[]): string[] {
  return branches
    .filter((b) => b.brandType === "cheez" || b.brandType === "combined")
    .map((b) => b.name);
}

/** Group real branches by their configured opening time ("HH:MM" → label). */
function groupByOpening(branches: PublicHomeBranch[]): { time: string; branches: string[] }[] {
  const groups = new Map<string, string[]>();
  for (const b of branches) {
    const key = (b.openingTime ?? "").trim() || "11:00";
    groups.set(key, [...(groups.get(key) ?? []), b.name]);
  }
  return [...groups.entries()]
    .sort(([a], [z]) => a.localeCompare(z))
    .map(([time, names]) => ({ time, branches: names }));
}

function DividerLabel({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-[0.68rem] font-bold uppercase text-[#a0a0b0]" style={{ letterSpacing: "1.8px" }}>
        {label}
      </span>
      <span className="h-px flex-1 bg-white/8" />
    </div>
  );
}

function ScheduleRow({
  icon,
  label,
  detail,
  color,
}: {
  icon: string;
  label: string;
  detail: string;
  color: string;
}) {
  return (
    <div className="flex items-start gap-2.5 py-1.5">
      <span className="mt-px shrink-0 text-[0.9rem]">{icon}</span>
      <span>
        <span className="block text-[0.68rem] font-bold uppercase tracking-wide" style={{ color }}>
          {label}
        </span>
        <span className="mt-0.5 block text-[0.78rem] leading-5 text-[#a0a0b0]">{detail}</span>
      </span>
    </div>
  );
}

function StatBlock({ label, time }: { label: string; time: string }) {
  return (
    <div className="min-w-25 rounded-xl border border-brand-500/25 bg-brand-500/10 px-4 py-2.5 text-center">
      <p className="mb-1 text-[0.6rem] font-bold uppercase text-[#a0a0b0]" style={{ letterSpacing: "1.2px" }}>
        {label}
      </p>
      <p className="font-display text-[1.4rem] font-black leading-none text-brand-500" style={{ letterSpacing: "1px" }}>
        {time}
      </p>
    </div>
  );
}

function openingRows(branches: PublicHomeBranch[]) {
  return groupByOpening(branches).map((g) => ({
    time: g.time,
    who: "Cheez! & Madchef",
    cloud: false,
    branches: g.branches,
  }));
}

export async function OperatingHours({ branches }: { branches: PublicHomeBranch[] }) {
  const { t, fmt } = await getT();

  const SCHEDULE = [
    {
      name: "Cheez!",
      logo: "/images/brand/cheez-logo.webp",
      color: "#e8192c",
      bg: "rgba(232,25,44,0.08)",
      border: "rgba(232,25,44,0.25)",
      dinein: t("home.hours.dineInDetail"),
      delivery: t("home.hours.cheezDeliveryDetail"),
      note: t("home.hours.cheezNote"),
    },
    {
      name: "Madchef",
      logo: "/images/brand/madchef-logo.webp",
      color: "#f97316",
      bg: "rgba(249,115,22,0.08)",
      border: "rgba(249,115,22,0.25)",
      dinein: t("home.hours.dineInDetail"),
      delivery: t("home.hours.madchefDeliveryDetail"),
      note: t("home.hours.madchefNote"),
    },
  ];

  const PICKUP = [
    { area: "Mirpur DOHS", place: t("home.hours.pickupMainGate") },
    { area: "Mohakhali DOHS", place: t("home.hours.pickupRawaClub") },
    { area: "Dhaka Cantonment", place: t("home.hours.pickupSainikClub") },
    { area: "Nikunja", place: t("home.hours.pickupNavyHq") },
    { area: "Bashundhara", place: t("home.hours.pickupBaridhara"), note: t("home.hours.bashundharaNote") },
  ];

  return (
    <section className="border-t border-white/8 bg-[#0a0a0c] px-5 pb-20 pt-18">
      <div className="mx-auto max-w-275">
        <div className="mb-13 text-center">
          <span className="mb-2.5 inline-block text-[0.7rem] font-bold uppercase text-brand-500" style={{ letterSpacing: "2.5px" }}>
            {t("home.hours.eyebrow", { n: fmt.num(10) })}
          </span>
          <h2
            className="font-display font-black text-[#f0f0f2]"
            style={{ fontSize: "clamp(2rem, 5vw, 3rem)", letterSpacing: "1px", lineHeight: 1.1 }}
          >
            {t("home.hours.titlePre")} <span className="text-brand-500">{t("home.hours.titleAccent")}</span>
          </h2>
          <p className="mx-auto mt-3 max-w-120 text-[0.88rem] leading-6 text-[#a0a0b0]">{t("home.hours.subtitle")}</p>
        </div>

        {/* Opening times by branch */}
        <div className="mb-12">
          <DividerLabel label={t("home.hours.openingTimesTitle")} />
          <div className="mt-4 grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
            {openingRows(branches).map((row) => (
              <div
                key={row.time}
                className="flex flex-col gap-2.5 rounded-[14px] border p-4.5"
                style={{
                  background: row.cloud ? "rgba(129,140,248,0.06)" : "#1c1c24",
                  borderColor: row.cloud ? "rgba(129,140,248,0.2)" : "rgba(255,255,255,0.07)",
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className="font-display text-[1.6rem] font-black leading-none"
                    style={{ color: row.cloud ? "#818cf8" : "#e8192c", letterSpacing: "0.5px" }}
                  >
                    {row.time}
                  </span>
                  <span
                    className="whitespace-nowrap rounded-full border px-2.25 py-0.75 text-[0.62rem] font-bold uppercase"
                    style={{
                      letterSpacing: "0.8px",
                      color: row.cloud ? "#818cf8" : "#a0a0b0",
                      background: row.cloud ? "rgba(129,140,248,0.12)" : "rgba(255,255,255,0.05)",
                      borderColor: row.cloud ? "rgba(129,140,248,0.25)" : "rgba(255,255,255,0.08)",
                    }}
                  >
                    {row.who}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {row.branches.map((b) => (
                    <span key={b} className="rounded-full border border-white/8 bg-white/4 px-2.5 py-0.75 text-[0.74rem] text-[#a0a0b0]">
                      {b}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Dine-in & delivery schedule */}
        <div className="mb-12">
          <DividerLabel label={t("home.hours.scheduleTitle")} />
          <div className="mt-4 grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))" }}>
            {SCHEDULE.map((brand) => (
              <div key={brand.name} className="overflow-hidden rounded-[14px] border" style={{ background: brand.bg, borderColor: brand.border }}>
                <div className="flex items-center gap-2.5 border-b px-4.5 pb-3 pt-3.5" style={{ borderColor: brand.border }}>
                  <span className="relative size-7 shrink-0 overflow-hidden rounded-md">
                    <Image src={brand.logo} alt={brand.name} fill sizes="28px" className="object-cover" />
                  </span>
                  <span className="font-display text-[1.15rem] font-extrabold" style={{ color: brand.color, letterSpacing: "0.5px" }}>
                    {brand.name}
                  </span>
                </div>
                <div className="px-4.5 pb-1.5 pt-3">
                  <ScheduleRow icon="🍽️" label={t("home.hours.dineIn")} detail={brand.dinein} color={brand.color} />
                  <div className="my-2 h-px bg-white/5" />
                  <ScheduleRow icon="🛵" label={t("home.hours.delivery")} detail={brand.delivery} color={brand.color} />
                </div>
                <div className="mx-3 mb-3 mt-2 rounded-lg bg-black/20 px-3 py-2 text-[0.71rem] leading-5 text-[#a0a0b0]">
                  ℹ️ {brand.note}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Late-night Cheez! delivery */}
        <div className="mb-4 flex flex-wrap items-start gap-x-8 gap-y-4.5 rounded-2xl border border-brand-500/20 bg-brand-500/6 px-7 py-6">
          <div className="min-w-0 flex-auto">
            <div className="mb-1.5 flex items-center gap-2.5">
              <span className="text-[1.4rem]">🌙</span>
              <h3 className="font-display text-[1.2rem] font-extrabold text-brand-500" style={{ letterSpacing: "0.5px" }}>
                {t("home.hours.lateNightTitle")}
              </h3>
            </div>
            <p className="mb-3.5 max-w-120 text-[0.8rem] leading-6 text-[#a0a0b0]">
              {t("home.hours.lateNightPre")} <strong className="text-[#fca5a5]">3:45 AM</strong>
              {t("home.hours.lateNightMid")} <strong className="text-[#fca5a5]">4:00 AM</strong>.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {lateNightBranches(branches).map((b) => (
                <span key={b} className="rounded-full border border-brand-500/25 bg-brand-500/12 px-2.5 py-0.75 text-[0.74rem] text-[#fca5a5]">
                  {b}
                </span>
              ))}
            </div>
          </div>
          <div className="ml-auto flex flex-wrap gap-2.5">
            <StatBlock label={t("home.hours.lastOrder")} time="3:45 AM" />
            <StatBlock label={t("home.hours.serviceEnds")} time="4:00 AM" />
          </div>
        </div>

        {/* Night pickup points */}
        <div className="rounded-2xl border px-7 py-6" style={{ background: "rgba(15,12,5,0.9)", borderColor: "rgba(251,191,36,0.4)" }}>
          <div className="mb-2.5 flex items-center gap-2.5">
            <span className="text-[1.25rem]">📍</span>
            <h3 className="font-display text-[1.2rem] font-extrabold text-[#fbbf24]" style={{ letterSpacing: "0.5px" }}>
              {t("home.hours.pickupTitle")}
            </h3>
          </div>
          <p
            className="mb-4 rounded-[10px] border px-3.5 py-2.5 text-[0.78rem] leading-6 text-[#e8e2d0]"
            style={{ background: "rgba(251,191,36,0.07)", borderColor: "rgba(251,191,36,0.25)" }}
          >
            ⏰ {t("home.hours.pickupNotePre")}{" "}
            <strong className="text-[#fbbf24]">Mirpur DOHS, Mohakhali DOHS, Bashundhara, Nikunja & Dhaka Cantonment</strong>{" "}
            {t("home.hours.pickupNoteMid")} <strong className="text-[#fbbf24]">10:15 PM</strong>
            {t("home.hours.pickupNotePost")}
          </p>
          <div className="grid gap-2.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))" }}>
            {PICKUP.map((p) => (
              <div
                key={p.area}
                className="rounded-xl border bg-white/4 px-3.5 py-3"
                style={{ borderColor: "rgba(251,191,36,0.28)" }}
              >
                <p className="mb-1 font-display text-[0.95rem] font-extrabold text-[#fbbf24]">{p.area}</p>
                <p className="text-[0.74rem] leading-5 text-[#d6cebc]">📍 {p.place}</p>
                {p.note ? (
                  <p className="mt-1.5 border-t pt-1.5 text-[0.69rem] leading-5 text-[#a89060]" style={{ borderColor: "rgba(251,191,36,0.2)" }}>
                    {p.note}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
