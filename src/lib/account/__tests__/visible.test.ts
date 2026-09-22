import { describe, expect, it } from "vitest";
import {
  clientVisibleNotes,
  customerActions,
  customerAppointmentStatus,
  toCustomerAppointment,
} from "../visible";
import type { CalendarEvent, RequiredFormStatus } from "@/types";

const NOW = new Date("2026-09-21T12:00:00.000Z").getTime();

function event(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: "evt1",
    treatment: "Botox",
    clientName: "Naeem Afnan",
    clientContact: "+14255551234",
    clientEmail: "naeem@example.com",
    clientId: "c1",
    startTime: "2026-09-25T16:00:00.000Z",
    endTime: "2026-09-25T16:40:00.000Z",
    notes: "",
    room: "Room 5",
    practitioner: "Dr Sophia Marchitti",
    ...overrides,
  };
}

function form(overrides: Partial<RequiredFormStatus> = {}): RequiredFormStatus {
  return {
    id: "f1",
    formName: "Botox Consent Form",
    url: "https://example.com/forms/fill/abc",
    source: "inhouse",
    status: "PENDING",
    sentAt: null,
    submittedAt: null,
    completedAt: null,
    ...overrides,
  };
}

describe("clientVisibleNotes", () => {
  it("keeps the client's own note", () => {
    expect(clientVisibleNotes("Please use numbing cream")).toBe("Please use numbing cream");
  });

  it("strips the internal override staff append", () => {
    expect(
      clientVisibleNotes("Please use numbing cream | Override: booked inside notice window"),
    ).toBe("Please use numbing cream");
  });

  it("returns nothing when the note is only internal", () => {
    expect(clientVisibleNotes("Override: staff forced this slot")).toBeNull();
    expect(clientVisibleNotes("")).toBeNull();
    expect(clientVisibleNotes(null)).toBeNull();
  });
});

describe("customerAppointmentStatus", () => {
  it("reads a future appointment as confirmed", () => {
    expect(customerAppointmentStatus(event(), {}, NOW)).toBe("upcoming");
  });

  it("flags one happening within a day as coming up", () => {
    const soon = event({
      startTime: "2026-09-21T18:00:00.000Z",
      endTime: "2026-09-21T18:40:00.000Z",
    });
    expect(customerAppointmentStatus(soon, {}, NOW)).toBe("today");
  });

  it("reads a finished appointment as completed", () => {
    const done = event({
      startTime: "2026-09-01T16:00:00.000Z",
      endTime: "2026-09-01T16:40:00.000Z",
    });
    expect(customerAppointmentStatus(done, {}, NOW)).toBe("past");
  });

  it("puts what the client must do ahead of the date", () => {
    expect(customerAppointmentStatus(event(), { awaitingDetails: true }, NOW)).toBe(
      "awaiting_details",
    );
    expect(customerAppointmentStatus(event(), { awaitingApproval: true }, NOW)).toBe(
      "awaiting_approval",
    );
    expect(customerAppointmentStatus(event(), { cancelled: true }, NOW)).toBe("cancelled");
  });
});

describe("customerActions", () => {
  it("offers only forms that are still outstanding", () => {
    const actions = customerActions({
      forms: [form({ id: "a" }), form({ id: "b", status: "COMPLETED" })],
      photo: null,
      completionUrl: null,
    });
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({ kind: "form" });
  });

  it("words the photo action by how firmly it's needed", () => {
    const required = customerActions({
      forms: [],
      photo: { requirement: "REQUIRED", status: "PENDING", url: "u" },
      completionUrl: null,
    });
    const optional = customerActions({
      forms: [],
      photo: { requirement: "OPTIONAL", status: "PENDING", url: "u" },
      completionUrl: null,
    });
    expect(required[0].label).toBe("Upload your photo");
    expect(optional[0].label).toContain("optional");
  });

  it("says nothing about a photo already uploaded or skipped", () => {
    for (const status of ["COMPLETED", "SKIPPED", "CANCELLED"]) {
      expect(
        customerActions({
          forms: [],
          photo: { requirement: "REQUIRED", status, url: "u" },
          completionUrl: null,
        }),
      ).toEqual([]);
    }
  });

  it("asks for missing booking details when registration is still open", () => {
    const actions = customerActions({ forms: [], photo: null, completionUrl: "u" });
    expect(actions[0]).toMatchObject({ kind: "details" });
  });
});

describe("toCustomerAppointment", () => {
  it("copies across only what a client may see", () => {
    const shaped = toCustomerAppointment(
      event({ notes: "Bring sunscreen | Override: staff booked outside hours" }),
      { status: "upcoming", actions: [] },
    );

    expect(shaped).toEqual({
      id: "evt1",
      treatment: "Botox",
      startTime: "2026-09-25T16:00:00.000Z",
      endTime: "2026-09-25T16:40:00.000Z",
      practitioner: "Dr Sophia Marchitti",
      room: "Room 5",
      status: "upcoming",
      notes: "Bring sunscreen",
      actions: [],
    });
    // Nothing identifying another person, and no internal field, rides along.
    expect(Object.keys(shaped)).not.toContain("clientContact");
    expect(Object.keys(shaped)).not.toContain("clientEmail");
    expect(Object.keys(shaped)).not.toContain("clientId");
    expect(Object.keys(shaped)).not.toContain("clientName");
  });
});
