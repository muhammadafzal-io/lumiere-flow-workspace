import { describe, expect, it } from "vitest";
import {
  countCustomerVisits,
  countDatedAppointments,
  normalizeMinVisits,
  splitAppointmentField,
} from "../customers/visit-count";

describe("visit-count", () => {
  it("splits on semicolons and commas", () => {
    expect(splitAppointmentField("2026-05-01; 2026-06-05")).toHaveLength(2);
    expect(splitAppointmentField("2026-05-01, 2026-06-05")).toHaveLength(2);
  });

  it("counts only dated appointment segments", () => {
    expect(countDatedAppointments(["2026-05-01", "notes only", ""])).toBe(1);
    expect(countDatedAppointments(["Mon Jun 01, 2026", "2026-06-05"])).toBe(2);
  });

  it("returns 0 when no appointments or last visit", () => {
    expect(countCustomerVisits(null)).toBe(0);
    expect(countCustomerVisits("")).toBe(0);
    expect(countCustomerVisits("pending")).toBe(0);
  });

  it("uses Last Visit as one visit when Appointments is empty", () => {
    expect(countCustomerVisits(null, "2026-06-10")).toBe(1);
    expect(countCustomerVisits("", "2026-06-10")).toBe(1);
  });

  it("prefers dated Appointments over Last Visit fallback", () => {
    expect(countCustomerVisits("2026-05-01;2026-06-05", "2026-06-10")).toBe(2);
  });

  it("normalizeMinVisits guards invalid values", () => {
    expect(normalizeMinVisits(0)).toBe(1);
    expect(normalizeMinVisits(NaN)).toBe(1);
    expect(normalizeMinVisits(5.9)).toBe(5);
  });
});
