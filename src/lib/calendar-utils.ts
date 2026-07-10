import type { Appointment, Practitioner } from "./types";

/** Clinic timezone — set once from settings via setClinicTimezone(). */
export let BUSSINESS_TZ = "America/Chicago";

/** Call after fetching clinic settings so all calendar helpers use the correct timezone. */
export function setClinicTimezone(tz: string): void {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    BUSSINESS_TZ = tz;
  } catch {
    // Invalid IANA timezone — keep existing value
  }
}

/** Returns the currently active clinic timezone. */
export function getActiveTimezone(): string {
  return BUSSINESS_TZ;
}
export const DAY_MS = 86400000;
export const HOUR_START = 9;
export const HOUR_END = 20;
export const SLOT_MIN = 30;
export const SLOTS_PER_HOUR = 60 / SLOT_MIN;
export const TOTAL_SLOTS = (HOUR_END - HOUR_START) * SLOTS_PER_HOUR;
export const SLOT_PX = 28;

export function chicagoParts(d: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BUSSINESS_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour") % 24,
    minute: get("minute"),
  };
}

// UTC ms for midnight on a given Chicago calendar date (year/month 1-based).
function chicagoMidnightMs(year: number, month: number, day: number): number {
  // Noon UTC is always within the same Chicago calendar day (offset ≤ 6 h).
  const noonMs = Date.UTC(year, month - 1, day, 12, 0, 0);
  const p = chicagoParts(new Date(noonMs));
  return noonMs - p.hour * 3_600_000 - p.minute * 60_000;
}

export function startOfDay(d: Date): Date {
  const p = chicagoParts(d);
  return new Date(chicagoMidnightMs(p.year, p.month, p.day));
}

export function startOfWeek(d: Date): Date {
  const p = chicagoParts(d);
  const dow = new Date(Date.UTC(p.year, p.month - 1, p.day, 12)).getUTCDay(); // Sun=0
  const diff = (dow + 6) % 7; // Mon=0
  return addDays(d, -diff);
}

export function addDays(d: Date, n: number): Date {
  const p = chicagoParts(d);
  const probeMs = Date.UTC(p.year, p.month - 1, p.day + n, 12, 0, 0);
  const np = chicagoParts(new Date(probeMs));
  return new Date(chicagoMidnightMs(np.year, np.month, np.day));
}

export function sameDay(a: Date, b: Date): boolean {
  const pa = chicagoParts(a);
  const pb = chicagoParts(b);
  return pa.year === pb.year && pa.month === pb.month && pa.day === pb.day;
}

// Returns the UTC Date for Chicago-local hour:minute on the day represented by `day`
// (which must be a Chicago-midnight UTC date produced by startOfDay / addDays).
export function chicagoSlotDate(day: Date, hour: number, minute: number): Date {
  return new Date(day.getTime() + hour * 3_600_000 + minute * 60_000);
}

export function fmtTime(d: Date): string {
  return d.toLocaleTimeString("en-US", {
    timeZone: BUSSINESS_TZ,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export function fmtTimeRange(start: Date, end: Date): string {
  return `${fmtTime(start)} – ${fmtTime(end)}`;
}

// Safe for Chicago-midnight UTC dates and for raw timestamps alike.
export function fmtDateShort(d: Date): string {
  const p = chicagoParts(d);
  return new Date(Date.UTC(p.year, p.month - 1, p.day, 12)).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
  });
}

export function fmtWeekday(d: Date, len: "short" | "long" = "short"): string {
  const p = chicagoParts(d);
  return new Date(Date.UTC(p.year, p.month - 1, p.day, 12)).toLocaleDateString("en-US", {
    timeZone: "UTC",
    weekday: len,
  });
}

export function isClinicOpen(d: Date): boolean {
  const p = chicagoParts(d);
  const dow = new Date(Date.UTC(p.year, p.month - 1, p.day, 12)).getUTCDay();
  if (dow === 0 || dow === 1) return false; // Sun, Mon closed
  return p.hour >= 10 && p.hour < 19;
}

export function appointmentsOnDate(apts: Appointment[], date: Date): Appointment[] {
  const dp = chicagoParts(date);
  return apts.filter((a) => {
    const ap = chicagoParts(new Date(a.start_time));
    return (
      dp.year === ap.year && dp.month === ap.month && dp.day === ap.day && a.status !== "cancelled"
    );
  });
}

export function topOffsetPx(start: Date): number {
  const p = chicagoParts(start);
  const minsFromStart = (p.hour - HOUR_START) * 60 + p.minute;
  return (minsFromStart / SLOT_MIN) * SLOT_PX;
}

export function heightPx(durationMin: number): number {
  return (durationMin / SLOT_MIN) * SLOT_PX;
}

export function practitionerById(prs: Practitioner[], id: string): Practitioner | undefined {
  return prs.find((p) => p.id === id);
}

export function slotIdFor(date: Date, hour: number, minute: number): string {
  const p = chicagoParts(date);
  const dateStr = `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
  return `slot_${dateStr}_${hour}_${minute}`;
}

export function parseSlotId(id: string): { date: Date; hour: number; minute: number } | null {
  const m = id.match(/^slot_(\d{4})-(\d{2})-(\d{2})_(\d+)_(\d+)$/);
  if (!m) return null;
  const [, y, mo, dd, h, mm] = m;
  const midnight = chicagoMidnightMs(Number(y), Number(mo), Number(dd));
  const d = new Date(midnight + Number(h) * 3_600_000 + Number(mm) * 60_000);
  return { date: d, hour: Number(h), minute: Number(mm) };
}
