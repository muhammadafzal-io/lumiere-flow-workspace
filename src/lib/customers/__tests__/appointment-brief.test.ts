import { describe, expect, it } from "vitest";
import { appointmentState, buildClientHistory, type BriefSource } from "../appointment-brief";
import type { TimelineEntry } from "../profile";
import type { Customer } from "@/lib/types";
import type { CalendarEvent, RequiredFormStatus } from "@/types";

const NOW = new Date("2026-09-17T12:00:00.000Z").getTime();

function event(overrides: Partial<CalendarEvent>): CalendarEvent {
  return {
    id: "evt",
    treatment: "Botox",
    clientName: "Naeem Afnan",
    clientContact: "+142552525772",
    startTime: "2026-09-01T16:00:00.000Z",
    endTime: "2026-09-01T16:40:00.000Z",
    notes: "",
    room: "Room 5",
    practitioner: "Dr Sophia Marchitti",
    ...overrides,
  };
}

function customer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: "c1",
    name: "Naeem Afnan",
    phone: "+142552525772",
    email: "naeem@example.com",
    birthday: "",
    last_visit: "",
    total_visits: 0,
    lifetime_value: 0,
    treatments: [],
    status: "Active",
    notes: "",
    visits: [],
    payments: [],
    appointments: "",
    ...overrides,
  };
}

function form(overrides: Partial<RequiredFormStatus>): RequiredFormStatus {
  return {
    id: "f1",
    formName: "Botox Consent Form",
    url: "",
    source: "inhouse",
    status: "PENDING",
    sentAt: null,
    submittedAt: null,
    completedAt: null,
    ...overrides,
  };
}

function timelineEntry(overrides: Partial<TimelineEntry>): TimelineEntry {
  return {
    id: "t1",
    timestamp: "2026-09-01T10:00:00.000Z",
    eventType: "booking",
    details: "Booked Botox",
    status: "success",
    platform: "chat",
    source: "activity",
    ...overrides,
  };
}

const past = [
  event({
    id: "a4",
    startTime: "2026-09-01T16:00:00.000Z",
    endTime: "2026-09-01T16:40:00.000Z",
    practitioner: "Dr Sophia Marchitti",
  }),
  event({
    id: "a3",
    startTime: "2026-08-28T14:20:00.000Z",
    endTime: "2026-08-28T15:00:00.000Z",
    practitioner: "Dr Josuf",
  }),
  event({
    id: "a2",
    treatment: "Classic HydraFacial",
    startTime: "2026-08-25T14:30:00.000Z",
    endTime: "2026-08-25T15:30:00.000Z",
    practitioner: "Dr Sophia Marchitti",
  }),
  event({
    id: "a1",
    startTime: "2026-08-12T16:00:00.000Z",
    endTime: "2026-08-12T16:40:00.000Z",
    practitioner: "Dr Josuf",
  }),
];

function source(overrides: Partial<BriefSource> = {}): BriefSource {
  return {
    customer: customer(),
    appointments: { upcoming: [], past, pendingEventIds: [], cancellations: [] },
    timeline: [],
    reviews: [],
    ...overrides,
  };
}

describe("buildClientHistory", () => {
  it("lists past services newest first and upcoming ones soonest first", () => {
    const upcoming = [
      event({
        id: "u2",
        startTime: "2026-10-05T16:00:00.000Z",
        endTime: "2026-10-05T16:40:00.000Z",
      }),
      event({
        id: "u1",
        startTime: "2026-10-01T16:00:00.000Z",
        endTime: "2026-10-01T16:40:00.000Z",
      }),
    ];
    const history = buildClientHistory(
      source({ appointments: { upcoming, past: [...past].reverse() } }),
      NOW,
    );
    expect(history.past.map((p) => p.event.id)).toEqual(["a4", "a3", "a2", "a1"]);
    expect(history.upcoming.map((p) => p.event.id)).toEqual(["u1", "u2"]);
    expect(history.overview.nextAppointment?.event.id).toBe("u1");
  });

  it("combines treatment and practitioner history across all past services", () => {
    const history = buildClientHistory(source(), NOW);
    expect(history.treatments).toEqual([
      {
        name: "Botox",
        count: 3,
        lastDate: "2026-09-01T16:00:00.000Z",
        lastPractitioner: "Dr Sophia Marchitti",
      },
      {
        name: "Classic HydraFacial",
        count: 1,
        lastDate: "2026-08-25T14:30:00.000Z",
        lastPractitioner: "Dr Sophia Marchitti",
      },
    ]);
    expect(history.practitioners).toEqual([
      { name: "Dr Sophia Marchitti", count: 2, lastDate: "2026-09-01T16:00:00.000Z" },
      { name: "Dr Josuf", count: 2, lastDate: "2026-08-28T14:20:00.000Z" },
    ]);
    expect(history.lastPractitioner).toBe("Dr Sophia Marchitti");
    expect(history.overview.lastTreatment).toBe("Botox");
  });

  it("gives a new client an empty history", () => {
    const history = buildClientHistory(source({ appointments: { upcoming: [], past: [] } }), NOW);
    expect(history.past).toEqual([]);
    expect(history.treatments).toEqual([]);
    expect(history.practitioners).toEqual([]);
    expect(history.lastPractitioner).toBeNull();
    expect(history.overview).toMatchObject({
      totalAppointments: 0,
      visits: 0,
      clientSince: null,
      lastActivity: null,
      nextAppointment: null,
      lastTreatment: null,
    });
  });

  it("summarises the client across all appointments", () => {
    const upcoming = [
      event({
        id: "u1",
        startTime: "2026-10-01T16:00:00.000Z",
        endTime: "2026-10-01T16:40:00.000Z",
      }),
    ];
    const history = buildClientHistory(
      source({
        customer: customer({
          created_at: "2026-08-01T00:00:00.000Z",
          appointments: "2026-08-12 Botox; 2026-08-25 Classic HydraFacial",
        }),
        appointments: {
          upcoming,
          past,
          pendingEventIds: ["u1"],
          cancellations: [
            {
              id: "x",
              timestamp: "2026-08-20T00:00:00.000Z",
              details: "Cancelled Botox",
              platform: "chat",
            },
          ],
        },
        timeline: [
          timelineEntry({ id: "old", timestamp: "2026-08-01T00:00:00.000Z" }),
          timelineEntry({ id: "new", timestamp: "2026-09-10T00:00:00.000Z" }),
        ],
      }),
      NOW,
    );
    expect(history.overview).toMatchObject({
      totalAppointments: 5,
      visits: 4,
      markedComplete: 2,
      cancelled: 1,
      pendingDetails: 1,
      clientSince: "2026-08-01T00:00:00.000Z",
      lastActivity: "2026-09-10T00:00:00.000Z",
    });
    expect(history.cancellations.map((c) => c.id)).toEqual(["x"]);
    expect(history.recentActivity[0].id).toBe("new");
  });

  it("falls back to the first appointment when the client's creation date is unknown", () => {
    expect(buildClientHistory(source(), NOW).overview.clientSince).toBe("2026-08-12T16:00:00.000Z");
  });

  it("counts an in-progress appointment as past but not yet as a visit", () => {
    const now = new Date("2026-09-01T16:20:00.000Z").getTime();
    const history = buildClientHistory(source(), now);
    expect(history.past[0]).toMatchObject({ state: "in_progress" });
    expect(history.overview.visits).toBe(3);
  });

  it("leaves appointments with invalid dates out of the history lists", () => {
    const broken = event({ id: "bad", startTime: "not a date", endTime: "" });
    const history = buildClientHistory(
      source({ appointments: { upcoming: [], past: [...past, broken] } }),
      NOW,
    );
    expect(history.past.map((p) => p.event.id)).not.toContain("bad");
    expect(history.overview.totalAppointments).toBe(5);
  });

  it("does not count unassigned appointments towards practitioner history", () => {
    const unassigned = event({
      id: "a0",
      startTime: "2026-08-01T10:00:00.000Z",
      endTime: "2026-08-01T11:00:00.000Z",
      practitioner: "",
    });
    const history = buildClientHistory(
      source({ appointments: { upcoming: [], past: [unassigned] } }),
      NOW,
    );
    expect(history.practitioners).toEqual([]);
    expect(history.treatments[0].lastPractitioner).toBeNull();
  });

  it("collects every form, newest sent first, and counts pending ones", () => {
    const withForms = past.map((e) =>
      e.id === "a1"
        ? { ...e, requiredForms: [form({ id: "old", sentAt: "2026-08-10T00:00:00.000Z" })] }
        : e.id === "a3"
          ? {
              ...e,
              requiredForms: [
                form({ id: "new", sentAt: "2026-08-27T00:00:00.000Z", status: "COMPLETED" }),
                form({ id: "unsent", sentAt: null }),
              ],
            }
          : e,
    );
    const history = buildClientHistory(
      source({ appointments: { upcoming: [], past: withForms } }),
      NOW,
    );
    expect(history.forms.map((f) => f.form.id)).toEqual(["new", "old", "unsent"]);
    expect(history.pendingForms).toBe(2);
    expect(history.lastFormSent?.form.id).toBe("new");
    expect(history.lastFormSent?.event.id).toBe("a3");
  });

  it("finds each booking's channel from a booking logged when the event was created", () => {
    const booked = past.map((e) =>
      e.id === "a4" ? { ...e, createdAt: "2026-08-30T09:00:00.000Z" } : e,
    );
    const timeline = [
      timelineEntry({ id: "other", timestamp: "2026-08-20T09:00:00.000Z", platform: "chat" }),
      timelineEntry({ id: "match", timestamp: "2026-08-30T09:01:00.000Z", platform: "voice" }),
    ];
    const history = buildClientHistory(
      source({ appointments: { upcoming: [], past: booked }, timeline }),
      NOW,
    );
    expect(history.past.find((p) => p.event.id === "a4")?.bookedVia).toBe("voice");
    expect(history.past.find((p) => p.event.id === "a3")?.bookedVia).toBeNull();
  });

  it("lists all feedback newest first", () => {
    const reviews = [
      {
        id: "r2",
        appointmentId: "a3",
        sentiment: "NEUTRAL",
        status: "SKIPPED" as const,
        feedback: "Ok",
        createdAt: "2026-08-29T00:00:00.000Z",
      },
      {
        id: "r1",
        appointmentId: "a4",
        sentiment: "POSITIVE",
        status: "SENT" as const,
        feedback: "Great",
        createdAt: "2026-09-02T00:00:00.000Z",
      },
    ];
    expect(buildClientHistory(source({ reviews }), NOW).reviews.map((r) => r.id)).toEqual([
      "r1",
      "r2",
    ]);
  });
});

describe("appointmentState", () => {
  const ctx = { now: NOW, pending: new Set<string>(), completed: new Set<string>() };

  it("tells upcoming, in-progress and past apart", () => {
    expect(
      appointmentState(
        event({ startTime: "2026-09-18T10:00:00.000Z", endTime: "2026-09-18T11:00:00.000Z" }),
        ctx,
      ),
    ).toBe("upcoming");
    expect(
      appointmentState(
        event({ startTime: "2026-09-17T11:30:00.000Z", endTime: "2026-09-17T12:30:00.000Z" }),
        ctx,
      ),
    ).toBe("in_progress");
    expect(
      appointmentState(
        event({ startTime: "2026-09-17T10:00:00.000Z", endTime: "2026-09-17T11:00:00.000Z" }),
        ctx,
      ),
    ).toBe("past");
  });

  it("marks voice bookings still waiting on details as pending", () => {
    const e = event({
      id: "p1",
      startTime: "2026-09-20T10:00:00.000Z",
      endTime: "2026-09-20T11:00:00.000Z",
    });
    expect(appointmentState(e, { ...ctx, pending: new Set(["p1"]) })).toBe("pending");
  });

  it("matches a visit marked complete by its date and treatment", () => {
    const e = event({ startTime: "2026-09-01T16:00:00.000Z" });
    expect(appointmentState(e, { ...ctx, completed: new Set(["2026-09-01 botox"]) })).toBe(
      "completed",
    );
    expect(appointmentState(e, { ...ctx, completed: new Set(["2026-09-01 hydrafacial"]) })).toBe(
      "past",
    );
  });

  it("treats an appointment with no valid start as past", () => {
    expect(appointmentState(event({ startTime: "", endTime: "" }), ctx)).toBe("past");
  });
});
