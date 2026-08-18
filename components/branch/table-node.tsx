"use client";

import type { PointerEvent as ReactPointerEvent } from "react";

/**
 * PHASE K — one table drawn with EXACTLY as many chairs as its capacity.
 *
 * Chairs are dealt round-robin to the four sides (top, right, bottom, left), so
 * 2 seats sit opposite each other, 4 sit one per side, 6 and 8 stay balanced,
 * and any other capacity still spreads evenly rather than piling up on one
 * edge. Within a side, chair k of m sits at (k+1)/(m+1) of the way along, which
 * keeps the gaps equal and the chairs off the corners.
 *
 * Overlap is prevented by construction: the rendered body is widened/heightened
 * until every side has room for its chairs at the minimum pitch. The stored
 * pos_x/pos_y/width/height are never rewritten — this is presentation only, so
 * drag-and-drop coordinates keep their meaning.
 *
 * Status is never conveyed by colour alone: each table also carries a written
 * status line, a distinct border style, and an aria-label naming it.
 */

const CHAIR = 10; // chair square, px
const CHAIR_GAP = 6; // clearance between the table edge and a chair
const MIN_PITCH = CHAIR + 8; // smallest centre-to-centre spacing along a side

export interface TableNodeData {
  id: number;
  name: string;
  pos_x: number;
  pos_y: number;
  width: number;
  height: number;
  seats: number;
  status: string;
  is_active: boolean;
}

/** How many chairs each side gets, dealt round-robin: top, right, bottom, left. */
export function chairsPerSide(seats: number): [number, number, number, number] {
  const counts: [number, number, number, number] = [0, 0, 0, 0];
  const total = Math.max(0, Math.floor(seats));
  for (let i = 0; i < total; i += 1) counts[i % 4] += 1;
  return counts;
}

/** Chair centres in the node's own coordinate space, given the body box. */
export function chairPositions(seats: number, bodyW: number, bodyH: number) {
  const [top, right, bottom, left] = chairsPerSide(seats);
  const out: { x: number; y: number }[] = [];
  const along = (count: number, length: number, k: number) => ((k + 1) / (count + 1)) * length;

  for (let k = 0; k < top; k += 1) out.push({ x: along(top, bodyW, k), y: -CHAIR_GAP - CHAIR / 2 });
  for (let k = 0; k < right; k += 1) out.push({ x: bodyW + CHAIR_GAP + CHAIR / 2, y: along(right, bodyH, k) });
  for (let k = 0; k < bottom; k += 1) out.push({ x: along(bottom, bodyW, k), y: bodyH + CHAIR_GAP + CHAIR / 2 });
  for (let k = 0; k < left; k += 1) out.push({ x: -CHAIR_GAP - CHAIR / 2, y: along(left, bodyH, k) });
  return out;
}

/** Body size that fits the chairs on every side without them touching. */
export function bodySize(seats: number, width: number, height: number) {
  const [top, right, bottom, left] = chairsPerSide(seats);
  const needW = (Math.max(top, bottom) + 1) * MIN_PITCH;
  const needH = (Math.max(right, left) + 1) * MIN_PITCH;
  return { w: Math.max(width, needW, 48), h: Math.max(height, needH, 48) };
}

const STATUS_BODY: Record<string, string> = {
  available: "border-solid border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200",
  occupied: "border-dotted border-amber-500 bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-200",
  out_of_service: "border-dashed border-red-500 bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-200",
};

const STATUS_CHAIR: Record<string, string> = {
  available: "bg-emerald-500",
  occupied: "bg-amber-500",
  out_of_service: "bg-red-400",
};

export function TableNode({
  table,
  selected,
  statusLabel,
  seatsLabel,
  onPointerDown,
}: {
  table: TableNodeData;
  selected: boolean;
  /** Translated status text — the label, not just the colour, carries meaning. */
  statusLabel: string;
  /** Translated "N seats" text used for the accessible name. */
  seatsLabel: string;
  onPointerDown?: (e: ReactPointerEvent) => void;
}) {
  const { w, h } = bodySize(table.seats, table.width, table.height);
  const chairs = chairPositions(table.seats, w, h);
  const pad = CHAIR_GAP + CHAIR; // room for the chairs on every side

  return (
    <div
      data-table={table.id}
      data-testid="table-node"
      data-seats={table.seats}
      data-status={table.status}
      className={`absolute ${table.is_active ? "" : "opacity-50"}`}
      style={{ left: table.pos_x, top: table.pos_y, width: w + pad * 2, height: h + pad * 2 }}
    >
      <button
        type="button"
        onPointerDown={onPointerDown}
        aria-label={`${table.name} — ${seatsLabel} — ${statusLabel}`}
        className={`absolute cursor-move rounded-lg border-2 text-center shadow-sm ${STATUS_BODY[table.status] ?? "border-solid border-border-strong"} ${selected ? "ring-2 ring-brand-500" : ""}`}
        style={{ left: pad, top: pad, width: w, height: h }}
        data-testid="table-body"
      >
        {/* Name above the seat count, both readable at the smallest size. */}
        <span className="block truncate px-1 text-[11px] font-semibold leading-tight">{table.name}</span>
        <span className="block text-[10px] leading-tight" data-testid="table-seat-count">
          {table.seats}
        </span>
        <span className="block truncate px-1 text-[9px] leading-tight opacity-80" data-testid="table-status-label">
          {statusLabel}
        </span>
      </button>

      {chairs.map((c, i) => (
        <span
          key={i}
          data-testid="table-chair"
          aria-hidden="true"
          className={`absolute rounded-[3px] ${STATUS_CHAIR[table.status] ?? "bg-fg-subtle"}`}
          style={{
            left: pad + c.x - CHAIR / 2,
            top: pad + c.y - CHAIR / 2,
            width: CHAIR,
            height: CHAIR,
          }}
        />
      ))}
    </div>
  );
}
