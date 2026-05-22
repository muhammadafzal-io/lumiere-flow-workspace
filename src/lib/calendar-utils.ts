import type { Appointment, Practitioner } from "./types";

export const DAY_MS = 86400000;
export const HOUR_START = 9; // 9am
export const HOUR_END = 20; // 8pm
export const SLOT_MIN = 30;
export const SLOTS_PER_HOUR = 60 / SLOT_MIN;
export const TOTAL_SLOTS = (HOUR_END - HOUR_START) * SLOTS_PER_HOUR;
export const SLOT_PX = 28; // px per 30-min slot

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
export function startOfWeek(d: Date): Date {
  const x = startOfDay(d);
  const dow = x.getDay(); // Sun=0
  // Week starts Monday
  const diff = (dow + 6) % 7;
  x.setDate(x.getDate() - diff);
  return x;
}
export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
export function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
export function fmtTime(d: Date): string {
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}
export function fmtTimeRange(start: Date, end: Date): string {
  return `${fmtTime(start)} – ${fmtTime(end)}`;
}
export function fmtDateShort(d: Date): string {
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
export function fmtWeekday(d: Date, len: "short" | "long" = "short"): string {
  return d.toLocaleDateString(undefined, { weekday: len });
}
export function isClinicOpen(d: Date): boolean {
  const dow = d.getDay();
  if (dow === 0 || dow === 1) return false; // Sun, Mon closed
  const h = d.getHours();
  return h >= 10 && h < 19;
}

export function appointmentsOnDate(apts: Appointment[], date: Date): Appointment[] {
  return apts.filter((a) => sameDay(new Date(a.start_time), date) && a.status !== "cancelled");
}

// Position helper: given the day's start (00:00), return the top px offset
export function topOffsetPx(start: Date): number {
  const minsFromStart = (start.getHours() - HOUR_START) * 60 + start.getMinutes();
  return (minsFromStart / SLOT_MIN) * SLOT_PX;
}
export function heightPx(durationMin: number): number {
  return (durationMin / SLOT_MIN) * SLOT_PX;
}

export function practitionerById(prs: Practitioner[], id: string): Practitioner | undefined {
  return prs.find((p) => p.id === id);
}

function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
export function slotIdFor(date: Date, hour: number, minute: number): string {
  return `slot_${localDateStr(date)}_${hour}_${minute}`;
}
export function parseSlotId(id: string): { date: Date; hour: number; minute: number } | null {
  const m = id.match(/^slot_(\d{4})-(\d{2})-(\d{2})_(\d+)_(\d+)$/);
  if (!m) return null;
  const [, y, mo, dd, h, mm] = m;
  const d = new Date(Number(y), Number(mo) - 1, Number(dd), Number(h), Number(mm), 0, 0);
  return { date: d, hour: Number(h), minute: Number(mm) };
}
