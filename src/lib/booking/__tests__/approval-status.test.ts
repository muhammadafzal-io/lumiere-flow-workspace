import { describe, expect, it } from "vitest";
import { deriveBookingStatus } from "../approval-status";

describe("deriveBookingStatus", () => {
  it("leaves bookings that need no sign-off exactly as they were", () => {
    // No approval record is what every service without the flag produces.
    expect(deriveBookingStatus(undefined, false)).toBe("confirmed");
    expect(deriveBookingStatus(undefined, true)).toBe("pending");
  });

  it("reports a booking waiting on sign-off", () => {
    expect(deriveBookingStatus("PENDING", false)).toBe("awaiting_approval");
  });

  it("puts sign-off ahead of waiting on the client's details", () => {
    expect(deriveBookingStatus("PENDING", true)).toBe("awaiting_approval");
  });

  it("reports a rejected booking", () => {
    expect(deriveBookingStatus("REJECTED", false)).toBe("rejected");
    expect(deriveBookingStatus("REJECTED", true)).toBe("rejected");
  });

  it("returns an approved booking to the normal statuses", () => {
    expect(deriveBookingStatus("APPROVED", false)).toBe("confirmed");
    expect(deriveBookingStatus("APPROVED", true)).toBe("pending");
  });

  it("treats an approval closed with its booking as no longer blocking", () => {
    expect(deriveBookingStatus("CANCELLED", false)).toBe("confirmed");
  });
});
