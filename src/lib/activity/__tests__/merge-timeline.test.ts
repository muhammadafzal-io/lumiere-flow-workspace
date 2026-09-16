import { describe, expect, it } from "vitest";
import {
  calEventToLogRow,
  dedupeCalendarAgainstLog,
  type LogRow,
} from "@/lib/activity/merge-timeline";
import type { CalendarEvent } from "@/types";

const TZ = "America/Chicago";

function calEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: "evt1",
    treatment: "Botox",
    clientName: "Nizam Ali",
    clientContact: "3838838383",
    startTime: "2026-09-25T18:00:00.000Z",
    endTime: "2026-09-25T18:40:00.000Z",
    createdAt: "2026-09-17T09:15:00.000Z",
    notes: "",
    room: "Room 5",
    practitioner: "Dr Sophia Marchitti",
    ...overrides,
  };
}

function logRow(overrides: Partial<LogRow> = {}): LogRow {
  return {
    id: "log1",
    timestamp: "2026-09-17T09:15:20.000Z",
    eventType: "booking",
    clientName: "Nizam Ali",
    phone: "3838838383",
    email: "",
    clientId: "",
    details: "Booked Botox",
    status: "success",
    platform: "chat",
    ...overrides,
  };
}

describe("calEventToLogRow", () => {
  it("stamps the row with when the booking was made, not the appointment time", () => {
    const row = calEventToLogRow(calEvent(), TZ);
    expect(row.timestamp).toBe("2026-09-17T09:15:00.000Z");
  });

  it("keeps the appointment time in the details", () => {
    const row = calEventToLogRow(calEvent(), TZ);
    expect(row.details).toBe("Botox with Dr Sophia Marchitti in Room 5 on Sep 25, 1:00 PM");
  });

  it("falls back to the appointment time when the creation time is unknown", () => {
    const row = calEventToLogRow(calEvent({ createdAt: undefined }), TZ);
    expect(row.timestamp).toBe("2026-09-25T18:00:00.000Z");
  });
});

describe("dedupeCalendarAgainstLog", () => {
  const cal = [calEventToLogRow(calEvent(), TZ)];

  it("drops a calendar row whose booking was already logged moments after creation", () => {
    expect(dedupeCalendarAgainstLog([logRow()], cal)).toEqual([]);
  });

  it("matches across a 5-minute bucket boundary", () => {
    const created = "2026-09-17T09:14:59.000Z";
    const calAtBoundary = [calEventToLogRow(calEvent({ createdAt: created }), TZ)];
    const logged = logRow({ timestamp: "2026-09-17T09:15:01.000Z" });
    expect(dedupeCalendarAgainstLog([logged], calAtBoundary)).toEqual([]);
  });

  it("keeps a calendar row when the logged booking is for a different client", () => {
    expect(dedupeCalendarAgainstLog([logRow({ clientName: "Someone Else" })], cal)).toHaveLength(1);
  });

  it("keeps a calendar row when the logged booking was made at a different time", () => {
    const later = logRow({ timestamp: "2026-09-17T11:00:00.000Z" });
    expect(dedupeCalendarAgainstLog([later], cal)).toHaveLength(1);
  });

  it("ignores non-booking log rows", () => {
    expect(dedupeCalendarAgainstLog([logRow({ eventType: "inquiry" })], cal)).toHaveLength(1);
  });
});
