import type { CalendarEvent, OpsLogEntry } from "@/types";

export type LogRow = OpsLogEntry & { id: string };

/** Converts a Google Calendar event into the same shape as an Operations Log row, so it can be
 * merged into a unified activity feed alongside real logged events. */
export function calEventToLogRow(e: CalendarEvent, tz: string): LogRow {
  const parts: string[] = [];
  if (e.treatment) parts.push(e.treatment);
  if (e.practitioner) parts.push(`with ${e.practitioner}`);
  if (e.room) parts.push(`in ${e.room}`);
  const apptTime = new Date(e.startTime).toLocaleString("en-US", {
    timeZone: tz,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  parts.push(`on ${apptTime}`);

  return {
    id: `cal_${e.id}`,
    timestamp: e.startTime,
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

/** A booking made through the calendar shows up twice otherwise: once as the calendar event
 * itself, once as the "booking" row logEvent() wrote when it was confirmed. Filters out calendar
 * entries that already have a matching logged "booking" row (by name + 5-minute time bucket). */
export function dedupeCalendarAgainstLog(logEntries: LogRow[], calEntries: LogRow[]): LogRow[] {
  const logSet = new Set(
    logEntries
      .filter((e) => e.eventType === "booking")
      .map((e) => {
        const t = new Date(e.timestamp ?? 0).getTime();
        return `${(e.clientName ?? "").toLowerCase()}_${Math.round(t / 300000)}`;
      }),
  );

  return calEntries.filter((e) => {
    const t = new Date(e.timestamp ?? 0).getTime();
    return !logSet.has(`${(e.clientName ?? "").toLowerCase()}_${Math.round(t / 300000)}`);
  });
}
