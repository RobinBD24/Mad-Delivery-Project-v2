"use client";

import { useEffect, useState } from "react";

import { useTranslation } from "@/lib/i18n/use-translation";

const TONES = {
  red: { bg: "#ef4444", fg: "#fff", glow: "rgba(239,68,68,0.45)", ring: "rgba(239,68,68,0.25)" },
  amber: { bg: "#f59e0b", fg: "#111", glow: "rgba(245,158,11,0.45)", ring: "rgba(245,158,11,0.25)" },
  green: { bg: "#16a34a", fg: "#fff", glow: "rgba(22,163,74,0.40)", ring: "rgba(22,163,74,0.20)" },
} as const;

/**
 * Live last-order countdown (bottom-right), ported from the reference design:
 * Madchef window 8:45–10:45 PM (cutoff 10:45 PM), Cheez! window 1:45–3:45 AM
 * (cutoff 3:45 AM). Green >1h, amber <1h, red <30m.
 */
export function CutoffCountdown() {
  const { t } = useTranslation();
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const boot = setTimeout(() => setNow(new Date()), 0);
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => {
      clearTimeout(boot);
      clearInterval(timer);
    };
  }, []);

  if (!now) return null;

  const seconds = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
  const madCutoff = 1365 * 60; // 22:45
  const madFrom = madCutoff - 7200;
  const cheezCutoff = 13500; // 03:45
  const cheezFrom = cheezCutoff - 7200;

  let brand: "madchef" | "cheez" | null = null;
  let left = 0;
  let cutoffLabel = "";
  if (seconds >= madFrom && seconds < madCutoff) {
    brand = "madchef";
    left = madCutoff - seconds;
    cutoffLabel = "10:45 PM";
  } else if (seconds >= cheezFrom && seconds < cheezCutoff) {
    brand = "cheez";
    left = cheezCutoff - seconds;
    cutoffLabel = "3:45 AM";
  }
  if (!brand || left <= 0) return null;

  const h = Math.floor(left / 3600);
  const m = Math.floor((left % 3600) / 60);
  const s = left % 60;
  const display = h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  const tone = TONES[left < 1800 ? "red" : left < 3600 ? "amber" : "green"];

  return (
    <div
      data-testid="cutoff-countdown"
      className="animate-fade-slide-in fixed bottom-22 right-4 z-40 flex min-w-42 select-none flex-col items-start gap-0.5 rounded-2xl px-4 pb-2.5 pt-2.75 md:bottom-4"
      style={{ background: tone.bg, color: tone.fg, boxShadow: `0 6px 28px ${tone.glow}, 0 0 0 1px ${tone.ring}` }}
    >
      <p className="mb-0.5 text-[0.6rem] font-extrabold uppercase tracking-widest opacity-80">
        {brand === "madchef" ? "🔥" : "🍕"}{" "}
        {brand === "madchef" ? t("home.countdown.madchefLastOrder") : t("home.countdown.cheezLastDelivery")}
      </p>
      <p className="font-display text-[2rem] font-black leading-none" style={{ letterSpacing: "1px" }}>
        {display}
      </p>
      <p className="mt-0.5 text-[0.6rem] opacity-75">{t("home.countdown.orderBefore", { time: cutoffLabel })}</p>
    </div>
  );
}
