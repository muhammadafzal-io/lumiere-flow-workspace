import { describe, expect, it } from "vitest";
import {
  blockRescheduleToolDuringCancel,
  blockRescheduleToolDuringNewBooking,
  detectVoiceBookingIntent,
  userWantsCancelOnly,
} from "@/lib/voice/booking-intent";

describe("detectVoiceBookingIntent", () => {
  it("detects new booking from opening message", () => {
    const intent = detectVoiceBookingIntent([
      {
        role: "user",
        text: "My full name is Mehdeen Hussain and I want to book appointment on 8th July.",
      },
    ]);
    expect(intent).toBe("new");
  });

  it("detects cancel/reschedule intent", () => {
    const intent = detectVoiceBookingIntent([
      { role: "user", text: "I need to reschedule my microneedling appointment" },
    ]);
    expect(intent).toBe("cancel_reschedule");
  });

  it("blocks find_upcoming during new booking", () => {
    expect(blockRescheduleToolDuringNewBooking("find_upcoming_appointment", "new")).toContain(
      "check_availability",
    );
  });

  it("does not block check_availability during new booking", () => {
    expect(blockRescheduleToolDuringNewBooking("check_availability", "new")).toBeNull();
  });

  it("detects cancel-only intent", () => {
    expect(
      userWantsCancelOnly([{ role: "user", text: "I need to cancel my appointment please" }]),
    ).toBe(true);
  });

  it("blocks reschedule tools when caller wants cancel only", () => {
    const lines = [{ role: "user", text: "Please cancel my laser appointment" }];
    expect(blockRescheduleToolDuringCancel("check_reschedule_availability", lines)).toContain(
      "cancel_appointment",
    );
  });
});
