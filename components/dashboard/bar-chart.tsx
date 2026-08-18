import type { Locale } from "@/lib/i18n/config";
import { makeFormatters } from "@/lib/i18n/format";
import { cn } from "@/lib/utils";

/** Weekly bar chart in pure SVG (Sunday–Saturday). `format` picks label style. */
export function WeeklySalesChart({
  data,
  dark = false,
  format = "money",
  locale = "bn",
}: {
  data: { date: string; total: number }[];
  dark?: boolean;
  format?: "money" | "count";
  locale?: Locale;
}) {
  const fmt = makeFormatters(locale);
  const bcp = locale === "bn" ? "bn-BD" : "en-US";
  const dayName = (iso: string) =>
    new Date(iso).toLocaleDateString(bcp, { weekday: "short" });
  const max = Math.max(1, ...data.map((d) => d.total));
  const barWidth = 100 / (data.length * 2);

  return (
    <div>
      <svg viewBox="0 0 100 58" className="w-full" preserveAspectRatio="none" aria-hidden>
        {data.map((d, i) => {
          const height = (d.total / max) * 44;
          const x = i * (100 / data.length) + barWidth / 2;
          return (
            <g key={d.date}>
              <rect
                x={x}
                y={50 - height}
                width={barWidth}
                height={Math.max(height, 0.8)}
                rx={1.6}
                className={cn(
                  d.total > 0 ? "fill-flame-500" : dark ? "fill-white/10" : "fill-border-base",
                  d.total > 0 && !dark && "fill-brand-500",
                )}
              />
            </g>
          );
        })}
        <line
          x1="0"
          y1="50.4"
          x2="100"
          y2="50.4"
          className={dark ? "stroke-white/15" : "stroke-border-base"}
          strokeWidth="0.4"
        />
      </svg>
      <div
        className={cn(
          "mt-1 grid grid-cols-7 text-center text-xs",
          dark ? "text-fg-subtle" : "text-fg-muted",
        )}
      >
        {data.map((d) => (
          <div key={d.date}>
            <p>{dayName(d.date)}</p>
            <p className={cn("mt-0.5 font-medium", dark ? "text-slate-200" : "text-fg-base")}>
              {format === "count"
                ? fmt.num(d.total)
                : d.total > 0
                  ? fmt.money(d.total)
                  : fmt.num(0)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
