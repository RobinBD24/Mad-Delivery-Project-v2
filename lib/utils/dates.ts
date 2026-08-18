// Date helpers for dashboards + duty logs (local-day based, mirroring the previous backend
// timezone.localdate() semantics).

export function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function endOfToday(): Date {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}

/** Local midnight for a given date — used as the unique key for a duty day. */
export function midnight(date: Date = new Date()): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function daysAgo(days: number): Date {
  const d = startOfToday();
  d.setDate(d.getDate() - days);
  return d;
}

/** Current week's Sunday → Saturday span (aware start/end + array of 7 day-starts). */
export function weekBounds(): { start: Date; end: Date; days: Date[] } {
  const today = startOfToday();
  const start = new Date(today);
  start.setDate(today.getDate() - today.getDay()); // Sunday
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
  return { start, end, days };
}

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
