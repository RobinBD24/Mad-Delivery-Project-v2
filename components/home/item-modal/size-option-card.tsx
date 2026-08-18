"use client";

/**
 * Selectable option row from the reference design: radio dot, label,
 * optional sub-label (crust / slices) and right-aligned price.
 * Used for sizes, bun/sauce choices and flavours.
 */
export function SizeOptionCard({
  label,
  sub,
  price,
  active,
  accent,
  onSelect,
}: {
  label: string;
  sub?: string;
  price?: string;
  active: boolean;
  accent: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onSelect}
      className="flex w-full items-center justify-between gap-3 rounded-[10px] border px-3 py-2.75 text-left transition-colors"
      style={{
        borderColor: active ? accent : "rgba(255,255,255,0.07)",
        background: active ? `${accent}14` : "#1c1c24",
      }}
    >
      <span className="flex items-center gap-2.5">
        <span
          aria-hidden
          className="flex size-4 shrink-0 items-center justify-center rounded-full border-2"
          style={{ borderColor: active ? accent : "#606070" }}
        >
          {active ? <span className="size-1.75 rounded-full" style={{ background: accent }} /> : null}
        </span>
        <span>
          <span className="block text-[0.82rem] font-semibold text-white">{label}</span>
          {sub ? <span className="block text-[0.68rem] text-[#606070]">{sub}</span> : null}
        </span>
      </span>
      {price ? (
        <span className="font-display text-base font-extrabold" style={{ color: active ? accent : "#a0a0b0" }}>
          {price}
        </span>
      ) : null}
    </button>
  );
}
