import { describe, expect, it } from "vitest";
import {
  computeCustomerStatistics,
  groupPractitioners,
  groupTreatments,
  mergeTimeline,
} from "../profile";
import type { AppointmentHistoryResult } from "@/lib/integrations/google-calendar";
import type { Customer } from "@/lib/types";
import type { CalendarEvent, OpsLogEntry } from "@/types";

function customerEvent(overrides: Partial<CalendarEvent>): CalendarEvent {
  return {
    id: "evt1",
    treatment: "Botox",
    clientName: "Jane Doe",
    clientContact: "5125551234",
    startTime: "2026-06-01T14:00:00.000Z",
    endTime: "2026-06-01T15:00:00.000Z",
    notes: "",
    room: "Room 5",
    practitioner: "Dr Josuf",
    ...overrides,
  };
}

function fakeCustomer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: "c1",
    name: "Jane Doe",
    phone: "5125551234",
    email: "jane@example.com",
    birthday: "",
    last_visit: "2026-05-01T00:00:00.000Z",
    total_visits: 3,
    lifetime_value: 0,
    treatments: ["Botox"],
    status: "Active",
    notes: "",
    visits: [],
    payments: [],
    appointments: "",
    ...overrides,
  };
}

describe("computeCustomerStatistics", () => {
  it("derives visit stats from calendar history when matched by phone", () => {
    const history: AppointmentHistoryResult = {
      past: [
        customerEvent({ id: "1", startTime: "2026-06-01T14:00:00.000Z", treatment: "Botox" }),
        customerEvent({ id: "2", startTime: "2026-05-01T14:00:00.000Z", treatment: "HydraFacial" }),
        customerEvent({ id: "3", startTime: "2026-04-01T14:00:00.000Z", treatment: "Botox" }),
      ],
      upcoming: [customerEvent({ id: "4", startTime: "2027-01-01T14:00:00.000Z" })],
      truncated: false,
      matchedBy: "phone",
    };
    const stats = computeCustomerStatistics(fakeCustomer(), history, []);

    expect(stats.totalVisits).toBe(3);
    expect(stats.lastVisit).toBe("2026-06-01T14:00:00.000Z");
    expect(stats.firstVisit).toBe("2026-04-01T14:00:00.000Z");
    expect(stats.upcomingCount).toBe(1);
    expect(stats.primaryTreatment).toBe("Botox");
    expect(stats.primaryPractitioner).toBe("Dr Josuf");
    expect(stats.spend).toEqual({ tracked: false });
  });

  it("falls back to the flaky field-derived customer stats when Calendar matching fails", () => {
    const history: AppointmentHistoryResult = {
      past: [],
      upcoming: [],
      truncated: false,
      matchedBy: "unmatched",
    };
    const stats = computeCustomerStatistics(
      fakeCustomer({ total_visits: 7, last_visit: "2026-01-01T00:00:00.000Z" }),
      history,
      [],
    );

    expect(stats.totalVisits).toBe(7);
    expect(stats.lastVisit).toBe("2026-01-01T00:00:00.000Z");
    expect(stats.firstVisit).toBeNull();
  });

  it("counts no-show events from activity rows", () => {
    const history: AppointmentHistoryResult = {
      past: [],
      upcoming: [],
      truncated: false,
      matchedBy: "phone",
    };
    const activity: (OpsLogEntry & { id: string })[] = [
      {
        id: "a1",
        timestamp: "2026-01-01T00:00:00.000Z",
        eventType: "no-show",
        clientName: "Jane",
        details: "",
        status: "success",
        platform: "system",
      },
      {
        id: "a2",
        timestamp: "2026-01-02T00:00:00.000Z",
        eventType: "noshow-recovery",
        clientName: "Jane",
        details: "",
        status: "success",
        platform: "system",
      },
      {
        id: "a3",
        timestamp: "2026-01-03T00:00:00.000Z",
        eventType: "reminder",
        clientName: "Jane",
        details: "",
        status: "success",
        platform: "system",
      },
    ];
    const stats = computeCustomerStatistics(fakeCustomer(), history, activity);
    expect(stats.noShowCount).toBe(2);
  });
});

describe("groupTreatments", () => {
  it("merges visited treatments with never-visited interest entries", () => {
    const history: AppointmentHistoryResult = {
      past: [
        customerEvent({ id: "1", treatment: "Botox", startTime: "2026-06-01T00:00:00.000Z" }),
        customerEvent({ id: "2", treatment: "Botox", startTime: "2026-05-01T00:00:00.000Z" }),
      ],
      upcoming: [],
      truncated: false,
      matchedBy: "phone",
    };
    const result = groupTreatments(history, ["Botox", "Microneedling"]);

    const botox = result.find((t) => t.name === "Botox");
    const micro = result.find((t) => t.name === "Microneedling");
    expect(botox).toEqual({
      name: "Botox",
      visitCount: 2,
      lastDate: "2026-06-01T00:00:00.000Z",
      source: "history",
    });
    expect(micro).toEqual({
      name: "Microneedling",
      visitCount: 0,
      lastDate: null,
      source: "interest",
    });
  });
});

describe("groupPractitioners", () => {
  it("counts visits and tracks the most recent date per practitioner", () => {
    const history: AppointmentHistoryResult = {
      past: [
        customerEvent({
          id: "1",
          practitioner: "Dr Josuf",
          startTime: "2026-06-01T00:00:00.000Z",
        }),
        customerEvent({
          id: "2",
          practitioner: "Dr Josuf",
          startTime: "2026-01-01T00:00:00.000Z",
        }),
        customerEvent({
          id: "3",
          practitioner: "Dr John",
          startTime: "2026-05-01T00:00:00.000Z",
        }),
      ],
      upcoming: [],
      truncated: false,
      matchedBy: "phone",
    };
    const result = groupPractitioners(history);
    expect(result[0]).toEqual({
      name: "Dr Josuf",
      visitCount: 2,
      lastDate: "2026-06-01T00:00:00.000Z",
    });
    expect(result[1]).toEqual({
      name: "Dr John",
      visitCount: 1,
      lastDate: "2026-05-01T00:00:00.000Z",
    });
  });
});

describe("mergeTimeline", () => {
  it("dedupes a calendar booking against its matching logged booking row", () => {
    const history: AppointmentHistoryResult = {
      past: [customerEvent({ id: "1", startTime: "2026-06-01T14:00:00.000Z" })],
      upcoming: [],
      truncated: false,
      matchedBy: "phone",
    };
    const activity: (OpsLogEntry & { id: string })[] = [
      {
        id: "log1",
        timestamp: "2026-06-01T14:00:00.000Z",
        eventType: "booking",
        clientName: "Jane Doe",
        details: "Booked",
        status: "success",
        platform: "widget",
      },
    ];
    const entries = mergeTimeline(activity, history, [], [], "UTC");
    const bookingEntries = entries.filter((e) => e.eventType === "booking");
    expect(bookingEntries).toHaveLength(1);
    expect(bookingEntries[0].source).toBe("activity");
  });

  it("sorts merged entries newest first and caps at the limit", () => {
    const history: AppointmentHistoryResult = {
      past: [],
      upcoming: [],
      truncated: false,
      matchedBy: "unmatched",
    };
    const activity: (OpsLogEntry & { id: string })[] = [
      {
        id: "a1",
        timestamp: "2026-01-01T00:00:00.000Z",
        eventType: "inquiry",
        clientName: "Jane",
        details: "",
        status: "success",
        platform: "system",
      },
      {
        id: "a2",
        timestamp: "2026-06-01T00:00:00.000Z",
        eventType: "inquiry",
        clientName: "Jane",
        details: "",
        status: "success",
        platform: "system",
      },
    ];
    const entries = mergeTimeline(activity, history, [], [], "UTC", 1);
    expect(entries).toHaveLength(1);
    expect(entries[0].id).toBe("a2");
  });
});
