"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { Field, Input, Select } from "@/components/ui/input";
import { TableNode } from "@/components/branch/table-node";
import { useTranslation } from "@/lib/i18n/use-translation";
import { parseFieldErrors, type FieldErrors } from "@/lib/validation/contract";
import { LIMITS } from "@/lib/validation/limits";
import { integer, max, maxLength, min, required } from "@/lib/validation/rules";
import { useFormValidation, type FieldRules } from "@/lib/validation/use-form-validation";

export interface TableRow {
  id: number;
  name: string;
  pos_x: number;
  pos_y: number;
  width: number;
  height: number;
  seats: number;
  status: string;
  section: string;
  is_active: boolean;
}

const STATUS = ["available", "occupied", "out_of_service"] as const;
const STATUS_COLOR: Record<string, string> = {
  available: "border-emerald-400 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300",
  occupied: "border-amber-400 bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300",
  out_of_service: "border-red-400 bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-300",
};

/** Throws an ApiFailure carrying the parsed field map so callers can place it. */
class ApiFailure extends Error {
  constructor(readonly parsed: ReturnType<typeof parseFieldErrors>) {
    super(parsed.formError ?? "request failed");
  }
}

async function api(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new ApiFailure(parseFieldErrors(data, "request failed"));
  }
  return res.status === 204 ? null : res.json();
}

const TABLE_RULES: FieldRules = {
  name: [required, maxLength(LIMITS.nameMax)],
  seats: [required, integer, min(LIMITS.partySizeMin), max(LIMITS.partySizeMax)],
};

/** Graphical, responsive, drag-to-position branch table layout editor. */
export function TableLayoutEditor({ tables }: { tables: TableRow[] }) {
  const { t } = useTranslation();
  const router = useRouter();
  const canvasRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<TableRow | null>(null);
  const drag = useRef<{ id: number; dx: number; dy: number } | null>(null);

  // Add-table draft
  const [name, setName] = useState("");
  const [seats, setSeats] = useState("4");
  const [busy, setBusy] = useState(false);
  const [serverErrors, setServerErrors] = useState<FieldErrors>({});
  const [submissionId, setSubmissionId] = useState(0);

  /** Report a failed request: field messages under their fields, rest as a banner. */
  const report = useCallback(
    (err: unknown) => {
      if (err instanceof ApiFailure) {
        setSubmissionId((n) => n + 1);
        setServerErrors(err.parsed.fieldErrors);
        setError(Object.keys(err.parsed.fieldErrors).length ? null : err.parsed.formError ?? t("errors.generic"));
        return;
      }
      setError(t("errors.generic"));
    },
    [t],
  );

  function onPointerDown(e: React.PointerEvent, tRow: TableRow) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    drag.current = { id: tRow.id, dx: e.clientX - rect.left - tRow.pos_x, dy: e.clientY - rect.top - tRow.pos_y };
    setSelected(tRow);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current) return;
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width - 60, e.clientX - rect.left - drag.current.dx));
    const y = Math.max(0, Math.min(rect.height - 60, e.clientY - rect.top - drag.current.dy));
    const el = canvas.querySelector<HTMLElement>(`[data-table="${drag.current.id}"]`);
    if (el) { el.style.left = `${x}px`; el.style.top = `${y}px`; }
  }
  async function onPointerUp() {
    if (!drag.current) return;
    const canvas = canvasRef.current!;
    const el = canvas.querySelector<HTMLElement>(`[data-table="${drag.current.id}"]`);
    const id = drag.current.id;
    drag.current = null;
    if (el) {
      const posX = Math.round(parseFloat(el.style.left));
      const posY = Math.round(parseFloat(el.style.top));
      try { await api(`/api/branch-tables/${id}`, "PATCH", { pos_x: posX, pos_y: posY }); router.refresh(); }
      catch (err) { report(err); }
    }
  }

  /** Runs only after the client rules passed. */
  const addTable = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setError(null);
      setBusy(true);
      void (async () => {
        try {
          await api("/api/branch-tables", "POST", { name, seats: Number(seats), pos_x: 20, pos_y: 20 });
          setServerErrors({});
          // Cleared only after the table was created.
          setName("");
          setSeats("4");
          router.refresh();
        } catch (err) {
          report(err); // a duplicate table name lands under the name field
        } finally {
          setBusy(false);
        }
      })();
    },
    [name, report, router, seats],
  );

  const { errors, formProps } = useFormValidation(TABLE_RULES, {
    onSubmitValid: addTable,
    serverErrors,
    submissionId,
    pending: busy,
  });

  async function patchSelected(patch: Record<string, unknown>) {
    if (!selected) return;
    try { const updated = await api(`/api/branch-tables/${selected.id}`, "PATCH", patch); setSelected(updated); router.refresh(); }
    catch (err) { report(err); }
  }
  async function removeSelected() {
    if (!selected) return;
    try { await api(`/api/branch-tables/${selected.id}`, "DELETE"); setSelected(null); router.refresh(); }
    catch (err) { report(err); }
  }

  return (
    <div className="space-y-4">
      <Alert tone="error" message={error} />

      <form {...formProps} className="flex flex-wrap items-end gap-3" data-testid="table-add-form">
        <Field label={t("b3.tableName")} name="name" required error={errors.name}>
          <Input name="name" value={name} onChange={(e) => setName(e.target.value)} data-testid="table-name" placeholder={t("b3.tableNamePlaceholder")} />
        </Field>
        <Field label={t("b3.seats")} name="seats" required error={errors.seats}>
          <Input name="seats" type="number" min="1" value={seats} onChange={(e) => setSeats(e.target.value)} className="w-24" data-testid="table-seats" />
        </Field>
        <Button type="submit" disabled={busy}>+ {t("b3.addTable")}</Button>
      </form>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-xs">
        {STATUS.map((s) => (
          <span key={s} className={`rounded-md border px-2 py-0.5 ${STATUS_COLOR[s]}`}>{t(`b3.status.${s}`)}</span>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
        {/* Canvas */}
        <div
          ref={canvasRef}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          className="relative h-80 w-full touch-none overflow-hidden rounded-xl border border-border-strong bg-surface-muted sm:h-96"
          style={{ backgroundImage: "radial-gradient(circle, var(--color-border-base, #cbd5e1) 1px, transparent 1px)", backgroundSize: "24px 24px" }}
          data-testid="table-canvas"
        >
          {tables.length === 0 ? (
            <p className="absolute inset-0 flex items-center justify-center text-sm text-fg-muted">{t("b3.noTables")}</p>
          ) : null}
          {/* PHASE K — each table draws exactly `seats` chairs around its sides. */}
          {tables.map((tb) => (
            <TableNode
              key={tb.id}
              table={tb}
              selected={selected?.id === tb.id}
              statusLabel={t(`b3.status.${tb.status}`)}
              seatsLabel={t("b3.seatsCount", { count: tb.seats })}
              onPointerDown={(e) => onPointerDown(e, tb)}
            />
          ))}
        </div>

        {/* Inspector */}
        <div className="rounded-xl border border-border-strong p-4">
          {selected ? (
            <div className="space-y-3" data-testid="table-inspector">
              <p className="font-semibold text-fg-base">{selected.name}</p>
              <Field label={t("b3.tableName")}>
                <Input defaultValue={selected.name} onBlur={(e) => e.target.value !== selected.name && patchSelected({ name: e.target.value })} />
              </Field>
              <Field label={t("b3.seats")}>
                <Input type="number" min="1" defaultValue={selected.seats} onBlur={(e) => patchSelected({ seats: Number(e.target.value) })} data-testid="inspector-seats" />
              </Field>
              <Field label={t("common.status")}>
                <Select value={selected.status} onChange={(e) => patchSelected({ status: e.target.value })} data-testid="inspector-status">
                  {STATUS.map((s) => <option key={s} value={s}>{t(`b3.status.${s}`)}</option>)}
                </Select>
              </Field>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={selected.is_active} onChange={(e) => patchSelected({ is_active: e.target.checked })} />
                {t("common.active")}
              </label>
              {/* Deleting a table is destructive and irreversible, so it is
                  confirmed in a dialog that names the exact table. */}
              <ConfirmModal
                trigger={
                  <Button type="button" variant="ghost" size="sm" className="text-red-600">
                    {t("common.delete")}
                  </Button>
                }
                title={t("b3.deleteTableTitle")}
                description={t("b3.deleteTableDesc", { name: selected.name })}
                confirmLabel={t("common.delete")}
                action={async () => {
                  await removeSelected();
                  return { error: null };
                }}
              />
            </div>
          ) : (
            <p className="text-sm text-fg-muted">{t("b3.selectHint")}</p>
          )}
        </div>
      </div>
    </div>
  );
}
