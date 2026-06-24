import { describe, expect, it } from "vitest";
import {
  DEFAULT_RULE_SCHEDULE,
  isRuleScheduleDue,
  parseRuleSchedule,
  scheduleSummary,
} from "@/lib/rules/schedule-config";

describe("rule schedule", () => {
  it("parseRuleSchedule defaults", () => {
    expect(parseRuleSchedule(null).enabled).toBe(false);
    expect(parseRuleSchedule({ enabled: true, interval: "daily" }).run_at).toBe("09:00");
  });

  it("daily due after run time on new day", () => {
    const schedule = {
      ...DEFAULT_RULE_SCHEDULE,
      enabled: true,
      interval: "daily" as const,
      run_at: "09:00",
      last_auto_run_at: "2026-06-22T15:00:00Z",
    };
    const now = new Date("2026-06-23T17:00:00Z"); // 12:00 CT
    expect(isRuleScheduleDue(schedule, now)).toBe(true);
  });

  it("daily not due same day", () => {
    const schedule = {
      ...DEFAULT_RULE_SCHEDULE,
      enabled: true,
      interval: "daily" as const,
      run_at: "09:00",
      last_auto_run_at: "2026-06-23T16:00:00Z",
    };
    const now = new Date("2026-06-23T17:00:00Z");
    expect(isRuleScheduleDue(schedule, now)).toBe(false);
  });

  it("once only runs if never run", () => {
    const schedule = { ...DEFAULT_RULE_SCHEDULE, enabled: true, interval: "once" as const };
    expect(isRuleScheduleDue(schedule, new Date("2026-06-23T17:00:00Z"))).toBe(true);
    expect(
      isRuleScheduleDue(
        { ...schedule, last_auto_run_at: "2026-06-23T16:00:00Z" },
        new Date("2026-06-24T17:00:00Z"),
      ),
    ).toBe(false);
  });

  it("scheduleSummary", () => {
    expect(scheduleSummary({ ...DEFAULT_RULE_SCHEDULE, enabled: false })).toContain("Manual");
  });
});
