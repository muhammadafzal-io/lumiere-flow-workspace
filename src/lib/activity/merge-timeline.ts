import type { CalendarEvent, OpsLogEntry } from "@/types";

export type LogRow = OpsLogEntry & { id: string };

const DEDUPE_WINDOW_MS = 5 * 60_000;

/** Appointment time as shown in activity details, e.g. "Sep 25, 1:00 PM" in the clinic's zone. */
export function formatActivityTime(iso: string, tz: string): string {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: tz,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/** Converts a Google Calendar event into the same shape as an Operations Log row, so it can be
 * merged into a unified activity feed alongside real logged events. The row is stamped with when
 * the booking was made (the event's creation time) — the appointment time goes in the details. */
export function calEventToLogRow(e: CalendarEvent, tz: string): LogRow {
  const parts: string[] = [];
  if (e.treatment) parts.push(e.treatment);
  if (e.practitioner) parts.push(`with ${e.practitioner}`);
  if (e.room) parts.push(`in ${e.room}`);
  parts.push(`on ${formatActivityTime(e.startTime, tz)}`);

  return {
    id: `cal_${e.id}`,
    timestamp: e.createdAt ?? e.startTime,
    eventType: "booking",
    clientName: e.clientName || "Unknown",
    phone: e.clientContact || "",
    email: e.clientEmail || "",
    clientId: e.clientId ?? "",
    details: parts.join(" "),
    status: "success",
    platform: "calendar",
  };
}

/** A booking made through the app shows up twice otherwise: once as the calendar event itself,
 * once as the "booking" row logEvent() wrote when it was made. Filters out calendar entries that
 * have a logged "booking" row for the same client within a few minutes of the event's creation. */
export function dedupeCalendarAgainstLog(logEntries: LogRow[], calEntries: LogRow[]): LogRow[] {
  const loggedTimesByClient = new Map<string, number[]>();
  for (const e of logEntries) {
    if (e.eventType !== "booking") continue;
    const key = (e.clientName ?? "").toLowerCase();
    const times = loggedTimesByClient.get(key) ?? [];
    times.push(new Date(e.timestamp ?? 0).getTime());
    loggedTimesByClient.set(key, times);
  }

  return calEntries.filter((e) => {
    const t = new Date(e.timestamp ?? 0).getTime();
    const logged = loggedTimesByClient.get((e.clientName ?? "").toLowerCase()) ?? [];
    return !logged.some((lt) => Math.abs(lt - t) <= DEDUPE_WINDOW_MS);
  });
}
