"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { pushRiderLocationAction } from "@/lib/api/actions";
import { useTranslation } from "@/lib/i18n/use-translation";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { FieldError } from "@/components/ui/field-error";
import { Select } from "@/components/ui/input";
import { parseFieldErrors } from "@/lib/validation/contract";

interface Branch { id: number; name: string; brand_type?: string }

/**
 * Rider duty control (C1/C2): a rider must SELECT an eligible active branch to go
 * online, which opens a branch-scoped duty session. Going offline ends the
 * session (blocked while a delivery is active). While online, geolocation is
 * pushed to the server. Retains the design's offline/online styling + testids.
 */
export function RiderOnlinePanel({ initialOnline }: { initialOnline: boolean }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [online, setOnline] = useState(initialOnline);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [activeBranchName, setActiveBranchName] = useState<string>("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Branch-selection error, shown under the dropdown it belongs to. */
  const [branchError, setBranchError] = useState<string | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const watchId = useRef<number | null>(null);

  const load = useCallback(async () => {
    const d = await (await fetch("/api/rider/duty")).json();
    setBranches(d.eligible_branches ?? []);
    setOnline(Boolean(d.active_session));
    setActiveBranchName(d.active_session?.branch_name ?? "");
    setSelected((prev) => prev || String(d.eligible_branches?.[0]?.id ?? ""));
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  function startWatch() {
    if (!("geolocation" in navigator)) return;
    watchId.current = navigator.geolocation.watchPosition(
      (pos) => { setGeoError(null); void pushRiderLocationAction(pos.coords.latitude, pos.coords.longitude); },
      () => setGeoError(t("riderLoc.geoDenied")),
      { enableHighAccuracy: true, maximumAge: 20_000, timeout: 15_000 },
    );
  }
  function stopWatch() {
    if (watchId.current !== null) { navigator.geolocation.clearWatch(watchId.current); watchId.current = null; }
  }
  useEffect(() => {
    if (online) startWatch();
    return stopWatch;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online]);

  async function goOnline() {
    if (pending) return;
    // Client validation first — the branch choice is required, and the message
    // appears under the dropdown rather than as a detached banner.
    if (!selected) { setBranchError(t("errors.rider.selectBranch")); return; }
    setBranchError(null);
    setPending(true); setError(null);
    const res = await fetch("/api/rider/duty/start", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ branch_id: Number(selected) }) });
    setPending(false);
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      const { fieldErrors, formError } = parseFieldErrors(data, t("errors.generic"));
      setBranchError(fieldErrors.branch_id ?? null);
      setError(fieldErrors.branch_id ? null : formError);
      return;
    }
    await load(); router.refresh();
  }
  async function goOffline() {
    if (pending) return;
    setPending(true); setError(null);
    const res = await fetch("/api/rider/duty/end", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    setPending(false);
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(parseFieldErrors(data, t("errors.generic")).formError);
      return;
    }
    stopWatch(); await load(); router.refresh();
  }
  function toggle() { if (online) void goOffline(); else void goOnline(); }

  return (
    <div
      data-testid="rider-online-panel"
      data-online={online}
      className={cn(
        "mb-4.5 flex flex-wrap items-center gap-3 rounded-2xl border px-4 py-3.5 sm:px-5",
        online ? "border-rider-600/30 bg-rider-50 dark:bg-rider-500/10" : "border-red-300/60 bg-red-50 dark:border-red-500/30 dark:bg-red-500/10",
      )}
    >
      <span className={cn("size-3 shrink-0 rounded-full", online ? "animate-pulse bg-rider-500" : "bg-red-500")} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className={cn("text-sm font-extrabold", online ? "text-rider-700 dark:text-rider-500" : "text-red-700 dark:text-red-400")}>
          {online ? t("rider.youAreOnline") : t("rider.youAreOffline")}
        </p>
        <p className="text-xs text-fg-muted">
          {online ? (activeBranchName ? t("rider.onDutyAt", { branch: activeBranchName }) : t("rider.readyToReceive")) : t("rider.notAcceptingOrders")}
        </p>
        {geoError ? <p className="mt-0.5 text-xs text-amber-600">{geoError}</p> : null}
        {error ? <p className="mt-0.5 text-xs text-red-600" data-testid="rider-duty-error">{error}</p> : null}
      </div>

      {/* Branch selection (required to go online). The shared themed Select is
          width:100% by design, so it is bounded by this fixed-basis wrapper —
          otherwise it would take a full row and wrap this flex panel. */}
      {!online ? (
        <span className="w-full shrink-0 sm:w-52">
          <Select
            data-testid="rider-branch-select"
            name="branch_id"
            value={selected}
            onChange={(e) => {
              setSelected(e.target.value);
              if (branchError) setBranchError(null);
            }}
            className="h-10 py-0 text-sm"
            aria-label={t("rider.selectBranch")}
            aria-invalid={Boolean(branchError)}
            aria-describedby={branchError ? "rider-branch-error" : undefined}
          >
            {branches.length === 0 ? <option value="">{t("rider.noBranches")}</option> : null}
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
          <FieldError id="rider-branch-error" message={branchError} />
        </span>
      ) : null}

      <button
        type="button" role="switch" aria-checked={online} aria-label={t("rider.onlineOffline")}
        onClick={toggle} disabled={pending} data-testid="rider-online-toggle"
        className={cn(
          "flex h-10 w-14 shrink-0 cursor-pointer items-center rounded-full px-1 transition-colors",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rider-600",
          online ? "justify-end bg-rider-500" : "justify-start bg-slate-400 dark:bg-slate-600",
        )}
      >
        <span className="size-6 rounded-full bg-white shadow" />
      </button>

      <button
        type="button" onClick={toggle} disabled={pending} data-testid="rider-go-online"
        className={cn(
          "inline-flex h-12 w-full shrink-0 cursor-pointer items-center justify-center gap-2 rounded-xl px-5 text-sm font-extrabold text-white shadow-sm transition-opacity sm:w-auto",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rider-600",
          "disabled:pointer-events-none disabled:opacity-60",
          online ? "bg-red-600 hover:bg-red-700" : "bg-rider-600 hover:bg-rider-700",
        )}
      >
        {pending ? <Spinner className="size-4 border-white/40 border-t-white" label={t("common.loading")} /> : null}
        {online ? t("rider.goOffline") : t("rider.goOnline")}
      </button>
    </div>
  );
}
