const FALLBACK_TZ = "America/Chicago";

// ---------------------------------------------------------------------------
// Parameterized API — pass the clinic timezone explicitly.
// ---------------------------------------------------------------------------

/** Current date as YYYY-MM-DD in the given timezone. */
export function todayInTz(tz: string): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: tz });
}

/** ISO timestamp → YYYY-MM-DD in the given timezone. */
export function dateFromIsoInTz(iso: string, tz: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: tz });
}

/** ISO timestamp → "HH:mm" (24 h) wall-clock in the given timezone. */
export function timeKeyInTz(iso: string, tz: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  const hour = parts.find((p) => p.type === "hour")?.value ?? "00";
  const minute = parts.find((p) => p.type === "minute")?.value ?? "00";
  return `${hour}:${minute}`;
}

/** ISO timestamp → hour (0–23) in the given timezone. */
export function hourInTz(iso: string, tz: string): number {
  return Number(timeKeyInTz(iso, tz).split(":")[0] ?? 0);
}

/** True when the ISO timestamp falls on a Sunday in the given timezone. */
export function isSundayFromIsoInTz(iso: string, tz: string): boolean {
  return new Date(iso).toLocaleDateString("en-US", { timeZone: tz, weekday: "short" }) === "Sun";
}

/** Add N calendar days to a YYYY-MM-DD date string (timezone-neutral UTC math). */
export function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** True when a YYYY-MM-DD date string is a Sunday (UTC noon proxy — works for UTC-12..+11). */
export function isSunday(dateStr: string): boolean {
  return new Date(`${dateStr}T12:00:00Z`).getUTCDay() === 0;
}

/** Next non-Sunday date from dateStr (inclusive of dateStr itself). */
export function nextOpenDay(dateStr: string): string {
  let d = dateStr;
  for (let i = 0; i < 8; i++) {
    if (!isSunday(d)) return d;
    d = addDays(d, 1);
  }
  return d;
}

/** Tomorrow's date as YYYY-MM-DD in the given timezone. */
export function tomorrowInTz(tz: string): string {
  return addDays(todayInTz(tz), 1);
}

// ---------------------------------------------------------------------------
// Backward-compat aliases — kept so existing callers compile without changes.
// New code should use the tz-parameterized functions above.
// ---------------------------------------------------------------------------

/** @deprecated Use todayInTz(tz) */
export const todayInChicago = (): string => todayInTz(FALLBACK_TZ);

/** @deprecated Use dateFromIsoInTz(iso, tz) */
export const chicagoDateFromIso = (iso: string): string => dateFromIsoInTz(iso, FALLBACK_TZ);

/** @deprecated Use timeKeyInTz(iso, tz) */
export const chicagoTimeKey = (iso: string): string => timeKeyInTz(iso, FALLBACK_TZ);

/** @deprecated Use hourInTz(iso, tz) */
export const chicagoHour = (iso: string): number => hourInTz(iso, FALLBACK_TZ);

/** @deprecated Use isSundayFromIsoInTz(iso, tz) */
export const isSundayChicagoFromIso = (iso: string): boolean =>
  isSundayFromIsoInTz(iso, FALLBACK_TZ);

/** @deprecated Use addDays(dateStr, days) */
export const addChicagoDays = (dateStr: string, days: number): string => addDays(dateStr, days);

/** @deprecated Use isSunday(dateStr) */
export const isSundayChicago = (dateStr: string): boolean => isSunday(dateStr);

/** @deprecated Use nextOpenDay(dateStr) */
export const nextOpenChicagoDay = (dateStr: string): string => nextOpenDay(dateStr);

/** @deprecated Use tomorrowInTz(tz) */
export const tomorrowInChicago = (): string => tomorrowInTz(FALLBACK_TZ);
