"use client";

import { useEffect, useState } from "react";

import type { PublicHomeBranch } from "@/lib/selectors";
import { useTranslation } from "@/lib/i18n/use-translation";
import { branchOpenStatus, parseMinutes, type BranchOpenStatus } from "@/lib/services/branch-hours";
import { cn } from "@/lib/utils";

/**
 * req #8 — this section is now driven ENTIRELY by the database (see
 * `publicHomeBranches`). The previous implementation rendered a hardcoded array
 * of 10 demo branches with invented addresses/coverage and name-keyed opening
 * hours; none of that is customer-truth. Hours now come from the branch's own
 * openingTime/closingTime, coverage from its active delivery areas, and the
 * late-night window from its brand type. No branch is fabricated: when the
 * database returns nothing the section renders an empty state.
 */
type Branch = PublicHomeBranch;

interface LiveStatus {
  status: BranchOpenStatus;
  label: string;
  sub: string;
}

const STATUS_TONES: Record<BranchOpenStatus, { dot: string; bg: string; border: string; text: string }> = {
  open: { dot: "#22c55e", bg: "rgba(34,197,94,0.10)", border: "rgba(34,197,94,0.30)", text: "#22c55e" },
  "last-orders": { dot: "#f59e0b", bg: "rgba(245,158,11,0.10)", border: "rgba(245,158,11,0.30)", text: "#f59e0b" },
  "delivery-only": { dot: "#818cf8", bg: "rgba(129,140,248,0.10)", border: "rgba(129,140,248,0.30)", text: "#818cf8" },
  closed: { dot: "#ef4444", bg: "rgba(239,68,68,0.08)", border: "rgba(239,68,68,0.22)", text: "#ef4444" },
};

function formatTime(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  const ampm = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}${m ? ":" + String(m).padStart(2, "0") : ""} ${ampm}`;
}

/**
 * Display wrapper around the shared `branchOpenStatus` decision. The 4-state
 * status now comes from ONE implementation (also used by server enforcement);
 * this only maps that status — plus the coarse time-of-day window — to the
 * homepage's labels/sub-text. Reads the browser's local clock, as before: this
 * chip is display-only and is NOT the authority for whether an order is allowed.
 */
function liveStatus(
  branch: Branch,
  now: Date,
  t: (key: string, vars?: Record<string, string | number>) => string,
): LiveStatus {
  const minutes = now.getHours() * 60 + now.getMinutes();
  const status = branchOpenStatus(branch, minutes);
  const open = parseMinutes(branch.openingTime) ?? 660; // 11:00 AM default
  const close = parseMinutes(branch.closingTime) ?? 1380; // 11:00 PM default
  const lastEntry = Math.max(open, close - 30);

  if (status === "open") {
    return { status, label: t("home.branches.status.openNow"), sub: t("home.branches.status.diningDelivery") };
  }
  if (status === "delivery-only") {
    return {
      status,
      label: minutes < 240 ? t("home.branches.status.cheezDelivery") : t("home.branches.status.deliveryOnly"),
      sub: t("home.branches.status.deliveryUntil"),
    };
  }
  if (status === "last-orders") {
    const sub =
      minutes < 240
        ? t("home.branches.status.cheezLastOrder")
        : minutes < lastEntry
          ? t("home.branches.status.lastEntry")
          : t("home.branches.status.closesAt");
    return { status, label: t("home.branches.status.lastOrders"), sub };
  }
  // status === "closed"
  if (!branch.isActive) {
    return { status, label: t("home.branches.status.permanentlyClosed"), sub: "" };
  }
  if (minutes >= 240 && minutes < open && open - minutes <= 30) {
    return { status, label: t("home.branches.status.openingSoon"), sub: t("home.branches.status.opensAt", { time: formatTime(open) }) };
  }
  return { status, label: t("home.branches.status.closed"), sub: t("home.branches.status.opens", { time: formatTime(open) }) };
}

function StatusChip({ live }: { live: LiveStatus }) {
  const tone = STATUS_TONES[live.status];
  return (
    <span data-testid="branch-status" className="flex shrink-0 flex-col items-end gap-1">
      <span
        className="inline-flex items-center gap-1.5 rounded-full border px-2.25 py-0.75"
        style={{ background: tone.bg, borderColor: tone.border }}
      >
        <span
          className={cn("size-1.5 rounded-full", live.status === "open" && "animate-status-pulse")}
          style={{ background: tone.dot, boxShadow: live.status !== "closed" ? `0 0 5px ${tone.dot}` : "none" }}
        />
        <span className="whitespace-nowrap text-[0.62rem] font-bold" style={{ color: tone.text, letterSpacing: "0.6px" }}>
          {live.label}
        </span>
      </span>
      {live.sub ? <span className="pr-1 text-[0.6rem] text-[#a0a0b0]">{live.sub}</span> : null}
    </span>
  );
}

export function BranchesCoverage({ branches }: { branches: PublicHomeBranch[] }) {
  const { t, fmt } = useTranslation();
  const [open, setOpen] = useState<number | null>(null);
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const boot = setTimeout(() => setNow(new Date()), 0);
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => {
      clearTimeout(boot);
      clearInterval(timer);
    };
  }, []);

  // Badge reflects the branch's REAL brand type from the database.
  const TYPE_META: Record<"dining" | "closed", { color: string; bg: string; border: string; icon: string }> = {
    dining: { color: "#22c55e", bg: "rgba(34,197,94,0.08)", border: "rgba(34,197,94,0.25)", icon: "🍽️" },
    closed: { color: "#ef4444", bg: "rgba(239,68,68,0.08)", border: "rgba(239,68,68,0.25)", icon: "🚫" },
  };

  const LEGEND = [
    { color: "#22c55e", label: t("home.branches.legendDining") },
    { color: "#818cf8", label: t("home.branches.legendCloud") },
    { color: "#ef4444", label: t("home.branches.legendClosed") },
  ];

  return (
    <section
      id="branches"
      className="scroll-mt-14 border-t border-white/8 px-5 pb-20 pt-18 md:scroll-mt-18"
      style={{ background: "linear-gradient(180deg, #0c0c0e 0%, #0d0d0f 100%)" }}
    >
      <div className="mx-auto max-w-275">
        <div className="mb-12 text-center">
          <span className="mb-2.5 inline-block text-[0.7rem] font-bold uppercase text-brand-500" style={{ letterSpacing: "2.5px" }}>
            {t("home.branches.eyebrow", { n: fmt.num(branches.length) })}
          </span>
          <h2
            className="font-display font-black text-[#f0f0f2]"
            style={{ fontSize: "clamp(2rem, 5vw, 3rem)", letterSpacing: "1px", lineHeight: 1.1 }}
          >
            {t("home.branches.titlePre")} <span className="text-brand-500">{t("home.branches.titleAccent")}</span>{" "}
            {t("home.branches.titlePost")}
          </h2>
          <p className="mx-auto mt-3 max-w-125 text-[0.88rem] leading-6 text-[#a0a0b0]">{t("home.branches.subtitle")}</p>
        </div>

        <div className="mb-8 flex flex-wrap justify-center gap-5">
          {LEGEND.map((item) => (
            <span key={item.label} className="flex items-center gap-1.75 text-[0.78rem] text-[#a0a0b0]">
              <span className="size-2.25 rounded-full" style={{ background: item.color, boxShadow: `0 0 6px ${item.color}66` }} />
              {item.label}
            </span>
          ))}
        </div>

        {branches.length === 0 ? (
          <p
            className="rounded-[14px] border border-white/8 bg-surface-dark px-5 py-8 text-center text-[0.85rem] text-[#a0a0b0]"
            data-testid="home-branches-empty"
          >
            {t("home.branches.emptyState")}
          </p>
        ) : null}

        <div className="flex flex-col gap-2.5">
          {branches.map((branch, index) => {
            const disabled = !branch.isActive;
            const meta = TYPE_META[disabled ? "closed" : "dining"];
            const metaLabel = t(`brands.${branch.brandType}`);
            const isOpen = open === branch.id;
            const live = now ? liveStatus(branch, now, t) : null;
            return (
              <div
                key={branch.id}
                className="overflow-hidden rounded-[14px] bg-surface-dark transition-colors"
                style={{ border: `1px solid ${isOpen ? `${meta.color}55` : "rgba(255,255,255,0.07)"}` }}
              >
                <button
                  disabled={disabled}
                  onClick={() => setOpen(isOpen ? null : branch.id)}
                  aria-expanded={isOpen}
                  className={cn(
                    "flex w-full items-center gap-3 px-4 py-3.5 text-left",
                    disabled ? "cursor-not-allowed opacity-55" : "cursor-pointer",
                  )}
                >
                  <span
                    className="flex size-9 shrink-0 items-center justify-center rounded-[10px] border font-display text-base font-black"
                    style={{ background: meta.bg, borderColor: meta.border, color: meta.color }}
                  >
                    {fmt.num(index + 1)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="mb-0.5 flex flex-wrap items-center gap-1.75">
                      <span className="font-display text-[1.05rem] font-extrabold text-white" style={{ letterSpacing: "0.5px" }}>
                        {branch.name}
                      </span>
                      <span
                        className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-1.75 py-0.5 text-[0.62rem] font-bold uppercase"
                        style={{ letterSpacing: "0.8px", color: meta.color, background: meta.bg, borderColor: meta.border }}
                      >
                        {meta.icon} {metaLabel}
                      </span>
                    </span>
                    <span className="block text-[0.72rem] leading-5 text-[#a0a0b0]">
                      {disabled ? t("home.branches.closedText") : branch.address}
                    </span>
                  </span>
                  {live ? <StatusChip live={live} /> : null}
                  {!disabled ? (
                    <span
                      className="shrink-0 text-[0.7rem] text-[#a0a0b0] transition-transform"
                      style={{ transform: isOpen ? "rotate(180deg)" : "none" }}
                    >
                      ▼
                    </span>
                  ) : null}
                </button>

                {live?.status === "delivery-only" ? (
                  <div
                    className="flex items-center gap-2 border-t px-4 py-1.75 pl-17"
                    style={{ background: "rgba(129,140,248,0.08)", borderColor: "rgba(129,140,248,0.18)" }}
                  >
                    <span className="text-[0.9rem]">🍕</span>
                    <span className="text-[0.72rem] leading-5 text-[#a5b4fc]">
                      <strong className="text-[#c4b5fd]">{t("home.branches.deliveryOnlyStrong")}</strong>{" "}
                      {t("home.branches.deliveryOnlyText")}
                    </span>
                  </div>
                ) : null}

                {isOpen && !disabled && branch.coverage.length > 0 ? (
                  <div className="animate-fade-slide-in border-t px-5 pb-4.5 pt-3.5 sm:pl-18" style={{ borderColor: meta.border }}>
                    <p className="mb-2.5 text-[0.68rem] font-bold uppercase" style={{ color: meta.color, letterSpacing: "1.8px" }}>
                      {t("home.branches.coverageArea", { n: fmt.num(branch.coverage.length) })}
                    </p>
                    <div className="flex flex-wrap gap-x-2 gap-y-1.5">
                      {branch.coverage.map((zone) => (
                        <span
                          key={zone}
                          className="whitespace-nowrap rounded-full border border-white/8 bg-white/4 px-2.5 py-0.75 text-[0.74rem] leading-5 text-[#a0a0b0]"
                        >
                          {zone}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
