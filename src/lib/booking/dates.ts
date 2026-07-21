/** Today's date (YYYY-MM-DD) in the given IANA timezone. */
export function todayInZone(timezone: string): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: timezone });
}

/**
 * Adds/subtracts whole calendar days to a YYYY-MM-DD string. Pure UTC-anchored date math —
 * timezone-independent since it never crosses a wall-clock hour boundary.
 */
export function addCalendarDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The calendar date (YYYY-MM-DD) an arbitrary instant falls on, in the given IANA timezone. */
export function dateInZone(date: Date | string, timezone: string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-CA", { timeZone: timezone });
}

/** Whole calendar days between two YYYY-MM-DD strings (positive when `to` is after `from`). */
export function daysBetweenDates(fromDateStr: string, toDateStr: string): number {
  const from = new Date(`${fromDateStr}T12:00:00Z`).getTime();
  const to = new Date(`${toDateStr}T12:00:00Z`).getTime();
  return Math.round((to - from) / (24 * 60 * 60_000));
}
