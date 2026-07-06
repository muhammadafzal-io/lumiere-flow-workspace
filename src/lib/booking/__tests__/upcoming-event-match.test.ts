import { describe, expect, it } from "vitest";
import {
  findUpcomingEventByClientName,
  findUpcomingEventInList,
} from "@/lib/booking/upcoming-event-match";
import type { CalendarEvent } from "@/types";

const sampleEvents: CalendarEvent[] = [
  {
    id: "evt_1",
    treatment: "Botox",
    clientName: "Sarah Johnson",
    startTime: "2026-07-10T15:00:00.000Z",
    endTime: "2026-07-10T15:30:00.000Z",
    clientContact: "+15551234567",
    room: "Room 1",
    practitioner: "Dr. A",
  },
];

describe("findUpcomingEventInList", () => {
  it("matches phone variants on calendar contact", () => {
    const match = findUpcomingEventInList(sampleEvents, "5551234567");
    expect(match?.id).toBe("evt_1");
  });
});

describe("findUpcomingEventByClientName", () => {
  it("matches full name when phone on file differs", () => {
    const match = findUpcomingEventByClientName(sampleEvents, "Sarah Johnson");
    expect(match?.id).toBe("evt_1");
  });
});
