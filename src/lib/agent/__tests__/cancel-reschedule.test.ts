import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/booking/appointment-by-phone", () => ({
  findUpcomingAppointmentByPhone: vi.fn(),
  findRecentPastAppointmentByPhone: vi.fn(),
}));

vi.mock("@/lib/integrations/airtable", () => ({
  lookupClientByPhone: vi.fn(),
}));

vi.mock("@/lib/integrations/google-calendar", () => ({
  getCalendarBookingDetails: vi.fn(),
}));

vi.mock("@/lib/clinic-config", () => ({
  getClinicConfig: vi.fn().mockResolvedValue({ timezone: "America/New_York" }),
}));

import {
  findUpcomingAppointmentByPhone,
  findRecentPastAppointmentByPhone,
} from "@/lib/booking/appointment-by-phone";
import { lookupClientByPhone } from "@/lib/integrations/airtable";
import { getCalendarBookingDetails } from "@/lib/integrations/google-calendar";
import {
  prepareCancelRescheduleInput,
  validateCancelAppointment,
  validateRescheduleAppointment,
} from "@/lib/agent/booking-guards";

const findApptMock = vi.mocked(findUpcomingAppointmentByPhone);
const findPastApptMock = vi.mocked(findRecentPastAppointmentByPhone);
const lookupMock = vi.mocked(lookupClientByPhone);
const getBookingMock = vi.mocked(getCalendarBookingDetails);

/** Relative to the real clock, not a hardcoded date, so this test never silently rots into the
 * past (which would trip the isAppointmentPast guard on an unrelated future test run). */
const futureIso = (daysFromNow: number) =>
  new Date(Date.now() + daysFromNow * 86_400_000).toISOString();

describe("prepareCancelRescheduleInput", () => {
  beforeEach(() => {
    findApptMock.mockReset();
    findPastApptMock.mockReset();
    lookupMock.mockReset();
    getBookingMock.mockReset();
    lookupMock.mockResolvedValue(null);
    findPastApptMock.mockResolvedValue(null);
  });

  it("requires phone", async () => {
    const error = await prepareCancelRescheduleInput({});
    expect(error).toContain("Phone number is required");
  });

  it("resolves event_id and email from phone", async () => {
    findApptMock.mockResolvedValue({
      eventId: "evt_123",
      clientName: "Muhammad Afzal",
      treatment: "Botox",
      startTime: "2026-07-04T14:35:00.000Z",
      endTime: "2026-07-04T15:05:00.000Z",
      clientPhone: "+15353534567",
      clientEmail: "muhammad@example.com",
    });

    const input: Record<string, unknown> = { phone: "+15353534567" };
    const error = await validateCancelAppointment(input);

    expect(error).toBeNull();
    expect(input.event_id).toBe("evt_123");
    expect(input.client_name).toBe("Muhammad Afzal");
    expect(input.client_email).toBe("muhammad@example.com");
  });

  it("no upcoming appointment for this phone returns a clear error", async () => {
    findApptMock.mockResolvedValue(null);
    const error = await validateCancelAppointment({ phone: "+15550001111" });
    expect(error).toContain("No upcoming appointment found");
  });

  it("tells the client their appointment already passed when only a past one is found", async () => {
    findApptMock.mockResolvedValue(null);
    findPastApptMock.mockResolvedValue({
      eventId: "evt_old",
      clientName: "Real Client",
      treatment: "HydraFacial",
      startTime: "2026-07-01T14:00:00.000Z",
      endTime: "2026-07-01T14:30:00.000Z",
      clientPhone: "+15551234567",
      clientEmail: "real@example.com",
    });

    const error = await validateCancelAppointment({ phone: "+15551234567" });

    expect(error).toContain("HydraFacial");
    expect(error).toContain("already passed");
    expect(error).not.toContain("No upcoming appointment found");
  });

  it("trusts a model-supplied event_id when it actually belongs to the given phone", async () => {
    getBookingMock.mockResolvedValue({
      id: "evt_555",
      clientName: "Real Client",
      treatment: "HydraFacial",
      clientContact: "+15551234567",
      clientEmail: "real@example.com",
      startTime: futureIso(3),
      endTime: futureIso(3),
      practitionerName: "Dr. A",
      room: "Room 1",
      notes: "",
    });

    const input: Record<string, unknown> = {
      phone: "+15551234567",
      event_id: "evt_555",
    };
    const error = await validateCancelAppointment(input);

    expect(error).toBeNull();
    expect(input.event_id).toBe("evt_555");
    expect(input.client_name).toBe("Real Client");
    expect(input.client_email).toBe("real@example.com");
    // Must never fall back to a phone-based calendar search once the event_id is verified.
    expect(findApptMock).not.toHaveBeenCalled();
  });

  it("rejects a model-supplied event_id whose appointment has already ended", async () => {
    getBookingMock.mockResolvedValue({
      id: "evt_past",
      clientName: "Real Client",
      treatment: "HydraFacial",
      clientContact: "+15551234567",
      clientEmail: "real@example.com",
      startTime: futureIso(-3),
      endTime: futureIso(-3),
      practitionerName: "Dr. A",
      room: "Room 1",
      notes: "",
    });

    const input: Record<string, unknown> = {
      phone: "+15551234567",
      event_id: "evt_past",
    };
    const error = await validateCancelAppointment(input);

    expect(error).toContain("already passed");
    expect(error).toContain("HydraFacial");
    // Must not fall back to a phone-based search either — the appointment was correctly
    // identified, it's just not editable, so there's no other appointment to substitute.
    expect(findApptMock).not.toHaveBeenCalled();
  });

  it("ignores a model-supplied event_id that belongs to a DIFFERENT phone number and falls back to a fresh phone lookup", async () => {
    // The event_id points at someone else's appointment (different client_contact).
    getBookingMock.mockResolvedValue({
      id: "evt_other",
      clientName: "Someone Else",
      treatment: "Botox",
      clientContact: "+19998887777",
      clientEmail: "someone-else@example.com",
      startTime: "2026-08-02T15:00:00.000Z",
      endTime: "2026-08-02T15:30:00.000Z",
      practitionerName: "Dr. B",
      room: "Room 2",
      notes: "",
    });
    findApptMock.mockResolvedValue({
      eventId: "evt_real_owner",
      clientName: "Caller Client",
      treatment: "Laser",
      startTime: "2026-08-03T15:00:00.000Z",
      endTime: "2026-08-03T15:30:00.000Z",
      clientPhone: "+15551234567",
      clientEmail: "caller@example.com",
    });

    const input: Record<string, unknown> = {
      phone: "+15551234567",
      event_id: "evt_other",
    };
    const error = await validateCancelAppointment(input);

    expect(error).toBeNull();
    // The mismatched event_id must be discarded — the caller's own appointment (found via
    // their phone) is used instead, never the other client's.
    expect(input.event_id).toBe("evt_real_owner");
    expect(input.client_name).toBe("Caller Client");
    expect(input.client_email).toBe("caller@example.com");
    expect(findApptMock).toHaveBeenCalled();
  });

  it("ignores an event_id for an appointment that no longer exists and falls back to phone lookup", async () => {
    getBookingMock.mockRejectedValue(new Error("404 Not Found"));
    findApptMock.mockResolvedValue({
      eventId: "evt_current",
      clientName: "Caller Client",
      treatment: "Botox",
      startTime: "2026-08-05T15:00:00.000Z",
      endTime: "2026-08-05T15:30:00.000Z",
      clientPhone: "+15551234567",
      clientEmail: "caller@example.com",
    });

    const input: Record<string, unknown> = {
      phone: "+15551234567",
      event_id: "evt_deleted",
    };
    const error = await validateCancelAppointment(input);

    expect(error).toBeNull();
    expect(input.event_id).toBe("evt_current");
  });
});

describe("validateRescheduleAppointment", () => {
  beforeEach(() => {
    findApptMock.mockReset();
    findPastApptMock.mockReset();
    lookupMock.mockReset();
    getBookingMock.mockReset();
    lookupMock.mockResolvedValue(null);
    findPastApptMock.mockResolvedValue(null);
  });

  it("requires new_date_time after resolving the appointment", async () => {
    findApptMock.mockResolvedValue({
      eventId: "evt_123",
      clientName: "Muhammad Afzal",
      treatment: "Botox",
      startTime: "2026-07-04T14:35:00.000Z",
      endTime: "2026-07-04T15:05:00.000Z",
      clientPhone: "+15353534567",
      clientEmail: "muhammad@example.com",
    });

    const error = await validateRescheduleAppointment({ phone: "+15353534567" });
    expect(error).toContain("new_date_time is required");
  });

  it("passes once phone resolves an appointment and new_date_time is present", async () => {
    findApptMock.mockResolvedValue({
      eventId: "evt_123",
      clientName: "Muhammad Afzal",
      treatment: "Botox",
      startTime: "2026-07-04T14:35:00.000Z",
      endTime: "2026-07-04T15:05:00.000Z",
      clientPhone: "+15353534567",
      clientEmail: "muhammad@example.com",
    });

    const input: Record<string, unknown> = {
      phone: "+15353534567",
      new_date_time: "2026-07-06T14:35:00.000Z",
    };
    const error = await validateRescheduleAppointment(input);
    expect(error).toBeNull();
    expect(input.event_id).toBe("evt_123");
  });
});
