import { describe, expect, it } from "vitest";
import { isAppointmentPast } from "../appointment-lock";

const NOW = new Date("2026-06-15T14:00:00.000Z");

describe("isAppointmentPast", () => {
  it("returns true when the end time is before now", () => {
    expect(isAppointmentPast("2026-06-15T13:59:59.999Z", NOW)).toBe(true);
  });

  it("returns false when the end time equals now (exclusive boundary)", () => {
    expect(isAppointmentPast("2026-06-15T14:00:00.000Z", NOW)).toBe(false);
  });

  it("returns false when the end time is after now", () => {
    expect(isAppointmentPast("2026-06-15T14:00:00.001Z", NOW)).toBe(false);
  });

  it("returns false for an in-progress appointment (started but not yet ended)", () => {
    // Appointment 13:30–14:30, "now" is 14:00 — started, not over.
    expect(isAppointmentPast("2026-06-15T14:30:00.000Z", NOW)).toBe(false);
  });

  it("accepts a Date for endTime", () => {
    expect(isAppointmentPast(new Date("2026-06-15T10:00:00.000Z"), NOW)).toBe(true);
    expect(isAppointmentPast(new Date("2026-06-15T20:00:00.000Z"), NOW)).toBe(false);
  });

  it("accepts a Date or epoch-ms number for now", () => {
    expect(isAppointmentPast("2026-06-15T13:00:00.000Z", NOW)).toBe(true);
    expect(isAppointmentPast("2026-06-15T13:00:00.000Z", NOW.getTime())).toBe(true);
  });

  it("defaults now to the current time when omitted", () => {
    expect(isAppointmentPast("2000-01-01T00:00:00.000Z")).toBe(true);
    expect(isAppointmentPast("2999-01-01T00:00:00.000Z")).toBe(false);
  });
});
