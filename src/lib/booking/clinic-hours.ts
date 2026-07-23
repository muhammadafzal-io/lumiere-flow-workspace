/**
 * The clinic's own weekly business hours — read from Settings > Clinic info (`WeeklyHoursEditor`,
 * same shape as a Practitioner's WorkingHours), not a hardcoded constant. This is the single
 * source of truth for "which days are we open" and "what hours" that both the availability
 * engine (google-calendar.ts, recipe.ts) and the direct booking validation (booking-service.ts)
 * read from, so the two can never drift out of sync with each other or with what's configured.
 */
import { getSupabase } from "@/lib/supabase";

export type WeekdayKey = "sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat";

export type ClinicHoursSchedule = Partial<Record<WeekdayKey, { start: string; end: string }>>;

export const WEEKDAY_BY_UTC_DAY: WeekdayKey[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

const WEEKDAY_LABEL: Record<WeekdayKey, string> = {
  sun: "Sunday",
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
};

/** Fallback when Settings has no schedule configured yet — the clinic's previous hardcoded default (Mon–Sat, 9 AM–7 PM). */
export const DEFAULT_CLINIC_HOURS: ClinicHoursSchedule = {
  mon: { start: "09:00", end: "19:00" },
  tue: { start: "09:00", end: "19:00" },
  wed: { start: "09:00", end: "19:00" },
  thu: { start: "09:00", end: "19:00" },
  fri: { start: "09:00", end: "19:00" },
  sat: { start: "09:00", end: "19:00" },
};

const CACHE_TTL_MS = 60_000;
let cached: { value: ClinicHoursSchedule; expiresAt: number } | null = null;

/** Reads the clinic's configured weekly hours, cached briefly since it's called on most booking-related requests. */
export async function getClinicBusinessHours(): Promise<ClinicHoursSchedule> {
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  try {
    const sb = getSupabase();
    const { data } = await sb
      .from("Settings")
      .select("BusinessHoursSchedule")
      .limit(1)
      .maybeSingle();
    const raw = data?.["BusinessHoursSchedule"] as ClinicHoursSchedule | null | undefined;
    const schedule = raw && Object.keys(raw).length > 0 ? raw : DEFAULT_CLINIC_HOURS;
    cached = { value: schedule, expiresAt: Date.now() + CACHE_TTL_MS };
    return schedule;
  } catch {
    return cached?.value ?? DEFAULT_CLINIC_HOURS;
  }
}

/** Call right after writing a new BusinessHoursSchedule so the change takes effect immediately rather than waiting out the cache. */
export function invalidateClinicBusinessHoursCache(): void {
  cached = null;
}

/** The weekday key (timezone-independent — operates on the calendar date string itself, not a wall-clock instant) a YYYY-MM-DD date string falls on. */
export function weekdayKeyForDateStr(dateStr: string): WeekdayKey {
  return WEEKDAY_BY_UTC_DAY[new Date(`${dateStr}T12:00:00Z`).getUTCDay()];
}

/** Whether the clinic is open at all on this calendar date, per the configured schedule. */
export function isDateOpen(dateStr: string, schedule: ClinicHoursSchedule): boolean {
  return hoursForWeekday(schedule, weekdayKeyForDateStr(dateStr)) !== null;
}

export function toFractionalHour(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h + (m || 0) / 60;
}

export function fractionalHourToClock(hour: number): string {
  const h = Math.floor(hour);
  const m = Math.round((hour - h) * 60);
  const period = h >= 12 ? "PM" : "AM";
  const displayHour = h % 12 === 0 ? 12 : h % 12;
  return m === 0
    ? `${displayHour}:00 ${period}`
    : `${displayHour}:${String(m).padStart(2, "0")} ${period}`;
}

/** The clinic's open/close fractional hours for a given weekday, or null if closed that day. */
export function hoursForWeekday(
  schedule: ClinicHoursSchedule,
  weekday: WeekdayKey,
): { startHour: number; endHour: number } | null {
  const day = schedule[weekday];
  if (!day) return null;
  return { startHour: toFractionalHour(day.start), endHour: toFractionalHour(day.end) };
}

/** Human-readable summary for the AI's prompts and client-facing text, e.g. "Monday–Saturday, 9:00 AM – 7:00 PM" (only exact-matching consecutive days are grouped; falls back to a plain list otherwise). */
export function describeClinicHours(schedule: ClinicHoursSchedule): string {
  const openDays = WEEKDAY_BY_UTC_DAY.filter((d) => schedule[d]);
  if (openDays.length === 0) return "Closed all week";

  const sameHours = openDays.every((d) => {
    const a = schedule[d]!;
    const b = schedule[openDays[0]]!;
    return a.start === b.start && a.end === b.end;
  });

  const order = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as WeekdayKey[];
  const orderedOpenDays = order.filter((d) => openDays.includes(d));
  const isConsecutiveRun = orderedOpenDays.every(
    (d, i) => i === 0 || order.indexOf(d) === order.indexOf(orderedOpenDays[i - 1]) + 1,
  );

  const hoursLabel = sameHours
    ? `${fractionalHourToClock(toFractionalHour(schedule[openDays[0]]!.start))} – ${fractionalHourToClock(toFractionalHour(schedule[openDays[0]]!.end))}`
    : null;

  if (isConsecutiveRun && orderedOpenDays.length > 1) {
    const daysLabel = `${WEEKDAY_LABEL[orderedOpenDays[0]]}–${WEEKDAY_LABEL[orderedOpenDays[orderedOpenDays.length - 1]]}`;
    return hoursLabel ? `${daysLabel}, ${hoursLabel}` : daysLabel;
  }

  const daysLabel = orderedOpenDays.map((d) => WEEKDAY_LABEL[d]).join(", ");
  return hoursLabel ? `${daysLabel}, ${hoursLabel}` : daysLabel;
}
