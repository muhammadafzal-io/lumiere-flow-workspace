import type { Appointment, Practitioner } from "./types";

export const DAY_MS = 86400000;
export const HOUR_START = 9;
export const HOUR_END = 20;
export const SLOT_MIN = 30;
export const SLOTS_PER_HOUR = 60 / SLOT_MIN;
export const TOTAL_SLOTS = (HOUR_END - HOUR_START) * SLOTS_PER_HOUR;
export const SLOT_PX = 28;

/**
 * The clinic's configured display timezone (Settings > Clinic info), set once when the admin
 * calendar loads `/api/settings`. A client-side singleton is safe here — one browser tab/admin
 * session only ever displays one clinic's calendar at a time.
 */
let currentTimezone = "America/Chicago";

export function setDisplayTimezone(timezone: string): void {
  if (timezone) currentTimezone = timezone;
}

export function getDisplayTimezone(): string {
  return currentTimezone;
}

export function zonedParts(d: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: currentTimezone,
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

// UTC ms for midnight on a given clinic-local calendar date (year/month 1-based).
function zonedMidnightMs(year: number, month: number, day: number): number {
  // Noon UTC is always within the same clinic-local calendar day (offset <= 12h).
  const noonMs = Date.UTC(year, month - 1, day, 12, 0, 0);
  const p = zonedParts(new Date(noonMs));
  return noonMs - p.hour * 3_600_000 - p.minute * 60_000;
}

/**
 * Converts a "YYYY-MM-DD" date and "HH:MM" time in the clinic's configured timezone to a UTC
 * Date — the client-side (server-secret-free) equivalent of google-calendar.ts's
 * `zonedDateTimeToUtc`, DST-safe via the same probe-and-adjust technique.
 */
export function zonedDateTimeToUtc(dateStr: string, timeStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  const [hour, minute] = timeStr.split(":").map(Number);
  const probe = new Date(Date.UTC(year, month - 1, day, hour, minute >= 0 ? minute : 0, 0));
  const p = zonedParts(probe);
  const targetMinutes = hour * 60 + (minute || 0);
  const localMinutes = p.hour * 60 + p.minute;
  return new Date(probe.getTime() + (targetMinutes - localMinutes) * 60_000);
}

export function startOfDay(d: Date): Date {
  const p = zonedParts(d);
  return new Date(zonedMidnightMs(p.year, p.month, p.day));
}

export function startOfWeek(d: Date): Date {
  const p = zonedParts(d);
  const dow = new Date(Date.UTC(p.year, p.month - 1, p.day, 12)).getUTCDay(); // Sun=0
  const diff = (dow + 6) % 7; // Mon=0
  return addDays(d, -diff);
}

export function addDays(d: Date, n: number): Date {
  const p = zonedParts(d);
  const probeMs = Date.UTC(p.year, p.month - 1, p.day + n, 12, 0, 0);
  const np = zonedParts(new Date(probeMs));
  return new Date(zonedMidnightMs(np.year, np.month, np.day));
}

export function sameDay(a: Date, b: Date): boolean {
  const pa = zonedParts(a);
  const pb = zonedParts(b);
  return pa.year === pb.year && pa.month === pb.month && pa.day === pb.day;
}

// Returns the UTC Date for clinic-local hour:minute on the day represented by `day`
// (which must be a clinic-local-midnight UTC date produced by startOfDay / addDays).
export function chicagoSlotDate(day: Date, hour: number, minute: number): Date {
  return new Date(day.getTime() + hour * 3_600_000 + minute * 60_000);
}

export function fmtTime(d: Date): string {
  return d.toLocaleTimeString("en-US", {
    timeZone: currentTimezone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export function fmtTimeRange(start: Date, end: Date): string {
  return `${fmtTime(start)} – ${fmtTime(end)}`;
}

// Safe for clinic-local-midnight UTC dates and for raw timestamps alike.
export function fmtDateShort(d: Date): string {
  const p = zonedParts(d);
  return new Date(Date.UTC(p.year, p.month - 1, p.day, 12)).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
  });
}

export function fmtWeekday(d: Date, len: "short" | "long" = "short"): string {
  const p = zonedParts(d);
  return new Date(Date.UTC(p.year, p.month - 1, p.day, 12)).toLocaleDateString("en-US", {
    timeZone: "UTC",
    weekday: len,
  });
}

export function isClinicOpen(d: Date): boolean {
  const p = zonedParts(d);
  const dow = new Date(Date.UTC(p.year, p.month - 1, p.day, 12)).getUTCDay();
  if (dow === 0 || dow === 1) return false; // Sun, Mon closed
  return p.hour >= 10 && p.hour < 19;
}

export function appointmentsOnDate(apts: Appointment[], date: Date): Appointment[] {
  const dp = zonedParts(date);
  return apts.filter((a) => {
    const ap = zonedParts(new Date(a.start_time));
    return (
      dp.year === ap.year && dp.month === ap.month && dp.day === ap.day && a.status !== "cancelled"
    );
  });
}

export function topOffsetPx(start: Date): number {
  const p = zonedParts(start);
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
  const p = zonedParts(date);
  const dateStr = `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
  return `slot_${dateStr}_${hour}_${minute}`;
}

export function parseSlotId(id: string): { date: Date; hour: number; minute: number } | null {
  const m = id.match(/^slot_(\d{4})-(\d{2})-(\d{2})_(\d+)_(\d+)$/);
  if (!m) return null;
  const [, y, mo, dd, h, mm] = m;
  const midnight = zonedMidnightMs(Number(y), Number(mo), Number(dd));
  const d = new Date(midnight + Number(h) * 3_600_000 + Number(mm) * 60_000);
  return { date: d, hour: Number(h), minute: Number(mm) };
}
