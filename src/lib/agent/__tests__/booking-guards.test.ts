import { describe, expect, it } from "vitest";
import { hasValidBirthday } from "@/lib/agent/booking-guards";

describe("hasValidBirthday", () => {
  it("accepts YYYY-MM-DD", () => {
    expect(hasValidBirthday({ birthday: "1990-03-15" })).toBe(true);
  });

  it("rejects empty or skip flags", () => {
    expect(hasValidBirthday({})).toBe(false);
    expect(hasValidBirthday({ birthday: "" })).toBe(false);
    expect(hasValidBirthday({ birthday_skipped: true })).toBe(false);
    expect(hasValidBirthday({ birthdaySkipped: true })).toBe(false);
  });
});
