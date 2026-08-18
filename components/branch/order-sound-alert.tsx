"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Icon } from "@/components/layout/icons";
import { useTranslation } from "@/lib/i18n/use-translation";
import { cn } from "@/lib/utils";

/**
 * Branch-manager incoming-order alert. Polls the pending-order count; when it
 * rises, plays a short beep (WebAudio, no asset) and refreshes the list.
 * A mute toggle lets the manager silence it. Sound needs a user gesture first
 * (browser autoplay policy) — the toggle doubles as that gesture.
 */
export function OrderSoundAlert({ initialCount }: { initialCount: number }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [muted, setMuted] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const lastCount = useRef(initialCount);
  const ctxRef = useRef<AudioContext | null>(null);

  function beep() {
    if (muted || !ctxRef.current) return;
    const ctx = ctxRef.current;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.4);
  }

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const timer = setInterval(async () => {
      try {
        const res = await fetch("/api/orders?status=pending&page_size=1", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { count: number };
        if (!alive) return;
        if (data.count > lastCount.current) {
          beep();
          router.refresh();
        }
        lastCount.current = data.count;
      } catch {
        /* ignore */
      }
    }, 15_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, muted]);

  function enable() {
    if (!ctxRef.current) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctxRef.current = new Ctx();
    }
    ctxRef.current?.resume();
    setEnabled(true);
    beep();
  }

  if (!enabled) {
    return (
      <button
        type="button"
        onClick={enable}
        className="inline-flex items-center gap-1.5 rounded-xl border border-border-strong bg-surface-card px-3.5 py-2 text-sm font-medium text-fg-base hover:bg-surface-hover"
      >
        <Icon name="bell" className="size-4" /> {t("bmExtras.enableAlert")}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setMuted((m) => !m)}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-medium",
        muted ? "bg-surface-muted text-fg-muted" : "bg-emerald-50 text-emerald-700",
      )}
    >
      <Icon name="bell" className="size-4" /> {muted ? t("bmExtras.alertMuted") : t("bmExtras.alertOn")}
    </button>
  );
}
