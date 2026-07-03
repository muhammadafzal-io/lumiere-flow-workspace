import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/integrations/google-calendar", () => ({
  getAvailableSlots: vi.fn(),
  bookAdminAppointment: vi.fn(),
  getEventsByRange: vi.fn(),
}));

vi.mock("@/lib/integrations/airtable", () => ({
  getPractitioners: vi.fn(),
}));

import { getAvailableSlots } from "@/lib/integrations/google-calendar";
import { getPractitioners } from "@/lib/integrations/airtable";
import { findMatchingSlot, resolveRequestedSlot } from "@/lib/services/booking-service";

const getAvailableSlotsMock = vi.mocked(getAvailableSlots);
const getPractitionersMock = vi.mocked(getPractitioners);

const slot935 = {
  startTime: "2026-07-04T14:35:00.000Z",
  endTime: "2026-07-04T15:05:00.000Z",
  displayTime: "Friday, Jul 4, 9:35 AM CDT",
  availableRooms: ["Room 2"],
  availablePractitioners: ["Dr. Sofia Marchetti"],
};

describe("findMatchingSlot", () => {
  it("matches wrong UTC when wall clock matches clinic time on booking date", () => {
    const match = findMatchingSlot([slot935], "2026-07-04T09:35:00.000Z", "2026-07-04");
    expect(match?.startTime).toBe(slot935.startTime);
  });

  it("matches correct UTC instant", () => {
    const match = findMatchingSlot([slot935], slot935.startTime, "2026-07-04");
    expect(match?.startTime).toBe(slot935.startTime);
  });
});

describe("resolveRequestedSlot", () => {
  beforeEach(() => {
    getAvailableSlotsMock.mockReset();
    getPractitionersMock.mockResolvedValue([
      { id: "prac-1", name: "Dr. Sofia Marchetti", role: "NP", status: "Active" },
    ]);
  });

  it("resolves room from the exact requested slot", async () => {
    getAvailableSlotsMock.mockResolvedValue([
      {
        startTime: "2026-07-02T15:00:00.000Z",
        endTime: "2026-07-02T15:30:00.000Z",
        displayTime: "Thursday, Jul 2, 10:00 AM CDT",
        availableRooms: ["Room 2"],
        availablePractitioners: ["Dr. Sofia Marchetti"],
      },
      {
        startTime: "2026-07-02T16:00:00.000Z",
        endTime: "2026-07-02T16:30:00.000Z",
        displayTime: "Thursday, Jul 2, 11:00 AM CDT",
        availableRooms: ["Room 1"],
        availablePractitioners: ["Dr. Sofia Marchetti"],
      },
    ]);

    const resolved = await resolveRequestedSlot({
      startTime: "2026-07-02T16:00:00.000Z",
      durationMinutes: 30,
      preferredPractitioner: "Dr. Sofia Marchetti",
      date: "2026-07-02",
    });

    expect(resolved.practitioner).toBe("Dr. Sofia Marchetti");
    expect(resolved.room).toBe("Room 1");
    expect(resolved.slot.startTime).toBe("2026-07-02T16:00:00.000Z");
  });

  it("matches spoken 9:35 AM via wall-clock fallback", async () => {
    getAvailableSlotsMock.mockResolvedValue([slot935]);

    const resolved = await resolveRequestedSlot({
      startTime: "2026-07-04T09:35:00.000Z",
      durationMinutes: 30,
      date: "2026-07-04",
    });

    expect(resolved.room).toBe("Room 2");
    expect(resolved.practitioner).toBe("Dr. Sofia Marchetti");
    expect(resolved.slot.startTime).toBe(slot935.startTime);
  });

  it("fails clearly when the exact time is gone", async () => {
    getAvailableSlotsMock.mockResolvedValue([
      {
        startTime: "2026-07-02T15:00:00.000Z",
        endTime: "2026-07-02T15:30:00.000Z",
        displayTime: "Thursday, Jul 2, 10:00 AM CDT",
        availableRooms: ["Room 2"],
        availablePractitioners: ["Dr. Sofia Marchetti"],
      },
    ]);

    await expect(
      resolveRequestedSlot({
        startTime: "2026-07-02T16:00:00.000Z",
        durationMinutes: 30,
        date: "2026-07-02",
      }),
    ).rejects.toThrow("That time is not available");
  });
});
