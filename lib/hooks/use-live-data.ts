"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * PHASE D — targeted live refresh.
 *
 * Polls ONE endpoint on an interval and swaps the data in place. It never calls
 * `router.refresh()` and never reloads the page, so the operator keeps their
 * scroll position, open menus and typed-in filters while the numbers move.
 *
 * Deliberate behaviours:
 * - a failed tick keeps the last good data (a blip must not blank the board),
 * - overlapping requests are impossible: a tick is skipped while one is in
 *   flight, so a slow server cannot build a queue of stale responses,
 * - polling pauses while the tab is hidden and resumes (with an immediate
 *   fetch) when it becomes visible again — background tabs cost nothing.
 */
export function useLiveData<T>(url: string, intervalMs: number, initial: T | null = null) {
  const [data, setData] = useState<T | null>(initial);
  const [error, setError] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const inFlight = useRef(false);

  const tick = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) {
        setError(true);
        return;
      }
      setData((await res.json()) as T);
      setError(false);
      setUpdatedAt(Date.now());
    } catch {
      // Transient network error — keep the last good snapshot on screen.
      setError(true);
    } finally {
      inFlight.current = false;
    }
  }, [url]);

  useEffect(() => {
    // First fetch is deferred out of the effect body (no sync setState).
    const first = setTimeout(tick, 0);
    let id: ReturnType<typeof setInterval> | null = setInterval(tick, intervalMs);

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        if (id) clearInterval(id);
        id = null;
      } else if (!id) {
        void tick();
        id = setInterval(tick, intervalMs);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      clearTimeout(first);
      if (id) clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [tick, intervalMs]);

  return { data, error, updatedAt, refresh: tick };
}
