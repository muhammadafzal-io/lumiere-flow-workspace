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
import {
  findMatchingSlot,
  parsePreferredTimeKey,
  resolveRequestedSlot,
  selectPresentableSlots,
} from "@/lib/services/booking-service";

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

describe("parsePreferredTimeKey", () => {
  it("parses 12-hour times with meridiem", () => {
    expect(parsePreferredTimeKey("11 AM")).toBe("11:00");
    expect(parsePreferredTimeKey("2:30 pm")).toBe("14:30");
    expect(parsePreferredTimeKey("12 am")).toBe("00:00");
    expect(parsePreferredTimeKey("12 pm")).toBe("12:00");
  });

  it("parses 24-hour times and ISO strings", () => {
    expect(parsePreferredTimeKey("15:00")).toBe("15:00");
    // 11:00 AM CDT is 16:00 UTC on 2026-07-11
    expect(parsePreferredTimeKey("2026-07-11T16:00:00.000Z")).toBe("11:00");
  });

  it("returns undefined for empty or junk", () => {
    expect(parsePreferredTimeKey("")).toBeUndefined();
    expect(parsePreferredTimeKey(undefined)).toBeUndefined();
  });
});

describe("selectPresentableSlots", () => {
  // Slots every hour 9 AM–6 PM CDT on 2026-07-11 (9 AM CDT = 14:00 UTC).
  const daySlots = Array.from({ length: 10 }, (_, i) => {
    const utcHour = 14 + i;
    const start = `2026-07-11T${String(utcHour).padStart(2, "0")}:00:00.000Z`;
    const end = `2026-07-11T${String(utcHour).padStart(2, "0")}:30:00.000Z`;
    return {
      startTime: start,
      endTime: end,
      displayTime: `slot ${9 + i}`,
      availableRooms: ["Room 1"],
      availablePractitioners: ["Dr. Dao"],
    };
  });

  it("spreads selections across the day instead of first consecutive slots", () => {
    const picked = selectPresentableSlots(daySlots, 3);
    // First, middle, last — not 9:00/9:05/9:10.
    expect(picked).toHaveLength(3);
    expect(picked[0].startTime).toBe(daySlots[0].startTime);
    expect(picked[2].startTime).toBe(daySlots[daySlots.length - 1].startTime);
    expect(picked[1].startTime).not.toBe(daySlots[1].startTime);
  });

  it("returns slots nearest a requested time in chronological order", () => {
    const picked = selectPresentableSlots(daySlots, 3, "11:00");
    // 11 AM CDT = 16:00 UTC → index 2, with neighbors 10 AM and noon.
    expect(picked.map((s) => s.startTime)).toEqual([
      "2026-07-11T15:00:00.000Z",
      "2026-07-11T16:00:00.000Z",
      "2026-07-11T17:00:00.000Z",
    ]);
  });

  it("returns all slots when count is within the limit", () => {
    expect(selectPresentableSlots(daySlots.slice(0, 2), 3)).toHaveLength(2);
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
