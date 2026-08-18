import type { Locale } from "@/lib/i18n/config";
import { makeFormatters } from "@/lib/i18n/format";
import { cn } from "@/lib/utils";

interface Slice {
  label: string;
  value: number;
  color: string;
}

/** Pure-SVG donut chart (server component — no chart library needed). */
export function DonutChart({
  slices,
  centerLabel,
  dark = false,
  locale = "bn",
}: {
  slices: Slice[];
  centerLabel: string;
  dark?: boolean;
  locale?: Locale;
}) {
  const fmt = makeFormatters(locale);
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  const R = 80;
  const C = 2 * Math.PI * R;
  let offset = 0;

  return (
    <div className="flex flex-wrap items-center justify-center gap-6">
      <svg viewBox="0 0 200 200" className="size-44">
        <circle
          cx="100"
          cy="100"
          r={R}
          fill="none"
          stroke={dark ? "#1f2937" : "#eef2f7"}
          strokeWidth="26"
        />
        {total > 0
          ? slices.map((s) => {
              const dash = (s.value / total) * C;
              const el = (
                <circle
                  key={s.label}
                  cx="100"
                  cy="100"
                  r={R}
                  fill="none"
                  stroke={s.color}
                  strokeWidth="26"
                  strokeDasharray={`${dash} ${C - dash}`}
                  strokeDashoffset={-offset}
                  transform="rotate(-90 100 100)"
                />
              );
              offset += dash;
              return el;
            })
          : null}
        <text
          x="100"
          y="94"
          textAnchor="middle"
          className={cn("text-3xl font-bold", dark ? "fill-white" : "fill-fg-base")}
        >
          {fmt.num(total)}
        </text>
        <text
          x="100"
          y="118"
          textAnchor="middle"
          className={cn("text-xs", "fill-fg-subtle")}
        >
          {centerLabel}
        </text>
      </svg>
      <ul className="space-y-2">
        {slices.map((s) => (
          <li key={s.label} className="flex items-center gap-2.5 text-sm">
            <span className="size-3 rounded-full" style={{ background: s.color }} />
            <span className={dark ? "text-slate-300" : "text-fg-muted"}>{s.label}</span>
            <span
              className={cn("ml-auto pl-4 font-semibold", dark ? "text-white" : "text-fg-base")}
            >
              {fmt.num(s.value)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
