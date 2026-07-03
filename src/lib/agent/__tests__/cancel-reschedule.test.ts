import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/booking/appointment-by-phone", () => ({
  findUpcomingAppointmentByPhone: vi.fn(),
}));

vi.mock("@/lib/integrations/airtable", () => ({
  lookupClientByPhone: vi.fn(),
}));

import { findUpcomingAppointmentByPhone } from "@/lib/booking/appointment-by-phone";
import { lookupClientByPhone } from "@/lib/integrations/airtable";
import {
  prepareCancelRescheduleInput,
  validateCancelAppointment,
} from "@/lib/agent/booking-guards";

const findApptMock = vi.mocked(findUpcomingAppointmentByPhone);
const lookupMock = vi.mocked(lookupClientByPhone);

describe("prepareCancelRescheduleInput", () => {
  beforeEach(() => {
    findApptMock.mockReset();
    lookupMock.mockReset();
    lookupMock.mockResolvedValue(null);
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
});
