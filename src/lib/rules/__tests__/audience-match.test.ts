import { describe, expect, it } from "vitest";
import type { Customer, Rule } from "@/lib/types";
import {
  birthdayWithinDays,
  daysSince,
  isCampaignDateReached,
  isNoShowStatus,
  matchesExtraFilters,
  matchesLastVisitBucket,
  matchesRuleTrigger,
  normalizeTreatmentRuleConfig,
  sanitizeAudienceFilters,
  treatmentTimingMode,
} from "@/lib/rules/audience-match";

function customer(partial: Partial<Customer> & Pick<Customer, "id" | "name">): Customer {
  return {
    phone: "",
    email: "test@example.com",
    birthday: "",
    last_visit: "",
    total_visits: 0,
    lifetime_value: 0,
    treatments: [],
    status: "Active",
    notes: "",
    visits: [],
    payments: [],
    ...partial,
  };
}

function rule(partial: Partial<Rule> & Pick<Rule, "trigger_type">): Rule {
  return {
    id: "r1",
    name: "Test",
    trigger_config: {},
    audience_filter: [],
    channel: "Email",
    message_template: "",
    status: "active",
    created_at: new Date().toISOString(),
    audience_size: 0,
    sent_30d: 0,
    reply_rate: 0,
    revenue: 0,
    ...partial,
  };
}

describe("matchesRuleTrigger", () => {
  it("Visit count requires min visits", () => {
    const r = rule({ trigger_type: "Visit count", trigger_config: { min_visits: 5 } });
    expect(matchesRuleTrigger(customer({ id: "1", name: "A", total_visits: 5 }), r)).toBe(true);
    expect(matchesRuleTrigger(customer({ id: "2", name: "B", total_visits: 4 }), r)).toBe(false);
  });

  it("Inactivity requires days since last visit", () => {
    const r = rule({ trigger_type: "Inactivity", trigger_config: { days: 90 } });
    const recent = new Date(Date.now() - 10 * 86400000).toISOString();
    const old = new Date(Date.now() - 100 * 86400000).toISOString();
    expect(matchesRuleTrigger(customer({ id: "1", name: "A", last_visit: recent }), r)).toBe(false);
    expect(matchesRuleTrigger(customer({ id: "2", name: "B", last_visit: old }), r)).toBe(true);
  });

  it("Birthday matches upcoming birthdays", () => {
    const r = rule({ trigger_type: "Birthday", trigger_config: { days_before: 7 } });
    const now = new Date("2026-06-23T12:00:00");
    expect(matchesRuleTrigger(customer({ id: "1", name: "A", birthday: "06-25" }), r, now)).toBe(
      birthdayWithinDays("06-25", 7, now),
    );
    expect(matchesRuleTrigger(customer({ id: "2", name: "B", birthday: "12-25" }), r, now)).toBe(
      birthdayWithinDays("12-25", 7, now),
    );
  });

  it("normalizeTreatmentRuleConfig fixes minimum_days + last_visit 30 conflict", () => {
    const cfg = normalizeTreatmentRuleConfig(
      {
        treatment: "Any",
        days_after: 30,
        exact_calendar_day: false,
        audience_filters: { status: ["Active"], last_visit: "30" },
      },
      "Treatment Offer for Last Month",
    );
    expect(treatmentTimingMode(cfg)).toBe("exact_day");
    expect(cfg.days_after).toBe(30);
    expect((cfg.audience_filters as { last_visit?: string }).last_visit).toBe("any");
  });

  it("normalizeTreatmentRuleConfig maps last N days from rule name", () => {
    const cfg = normalizeTreatmentRuleConfig(
      { treatment: "Any", exact_calendar_day: true, days_after: 7 },
      "Most visited Customers in 7 days",
    );
    expect(treatmentTimingMode(cfg)).toBe("within_last_days");
    expect(cfg.within_last_days).toBe(7);
  });

  it("normalizeTreatmentRuleConfig keeps exact_day for 30-day month offer", () => {
    const cfg = normalizeTreatmentRuleConfig(
      { treatment: "Any", treatment_timing: "exact_day", exact_calendar_day: true, days_after: 30 },
      "Treatment Offer for Last Month",
    );
    expect(treatmentTimingMode(cfg)).toBe("exact_day");
    expect(cfg.days_after).toBe(30);
  });

  it("Treatment-based within_last_days matches recent visits", () => {
    const r = rule({
      trigger_type: "Treatment-based",
      trigger_config: {
        treatment: "Any",
        treatment_timing: "within_last_days",
        within_last_days: 7,
      },
    });
    const recent = new Date(Date.now() - 3 * 86400000).toISOString();
    const old = new Date(Date.now() - 20 * 86400000).toISOString();
    expect(matchesRuleTrigger(customer({ id: "1", name: "A", last_visit: recent }), r)).toBe(true);
    expect(matchesRuleTrigger(customer({ id: "2", name: "B", last_visit: old }), r)).toBe(false);
  });

  it("Treatment-based exact calendar day matches yesterday only", () => {
    const now = new Date("2026-07-02T18:00:00Z");
    const r = rule({
      trigger_type: "Treatment-based",
      trigger_config: {
        treatment: "Any",
        days_after: 1,
        exact_calendar_day: true,
        treatment_timing: "exact_day",
      },
    });
    expect(
      matchesRuleTrigger(
        customer({ id: "1", name: "A", treatments: ["Botox"], last_visit: "2026-07-01" }),
        r,
        now,
      ),
    ).toBe(true);
    expect(
      matchesRuleTrigger(
        customer({ id: "2", name: "B", treatments: ["Botox"], last_visit: "2026-06-30" }),
        r,
        now,
      ),
    ).toBe(false);
    expect(
      matchesRuleTrigger(
        customer({ id: "3", name: "C", treatments: ["Botox"], last_visit: "2026-07-02" }),
        r,
        now,
      ),
    ).toBe(false);
  });

  it("Treatment-based requires treatment and days_after since last visit", () => {
    const r = rule({
      trigger_type: "Treatment-based",
      trigger_config: { treatment: "Botox", days_after: 14 },
    });
    const oldVisit = new Date(Date.now() - 20 * 86400000).toISOString();
    const recentVisit = new Date(Date.now() - 5 * 86400000).toISOString();
    expect(
      matchesRuleTrigger(
        customer({ id: "1", name: "A", treatments: ["Botox"], last_visit: oldVisit }),
        r,
      ),
    ).toBe(true);
    expect(
      matchesRuleTrigger(
        customer({ id: "2", name: "B", treatments: ["Botox"], last_visit: recentVisit }),
        r,
      ),
    ).toBe(false);
    expect(
      matchesRuleTrigger(
        customer({ id: "3", name: "C", treatments: ["Laser"], last_visit: oldVisit }),
        r,
      ),
    ).toBe(false);
  });

  it("Date-based activates on or after campaign date", () => {
    const r = rule({ trigger_type: "Date-based", trigger_config: { date: "2026-06-25" } });
    const before = new Date("2026-06-23T17:00:00Z");
    const onDay = new Date("2026-06-25T17:00:00Z");
    expect(matchesRuleTrigger(customer({ id: "1", name: "A" }), r, before)).toBe(false);
    expect(matchesRuleTrigger(customer({ id: "2", name: "B" }), r, onDay)).toBe(true);
  });

  it("No-show recovery requires no-show status within hours window", () => {
    const r = rule({ trigger_type: "No-show recovery", trigger_config: { hours_after: 24 } });
    const recent = new Date(Date.now() - 12 * 3600000).toISOString();
    const old = new Date(Date.now() - 48 * 3600000).toISOString();
    expect(
      matchesRuleTrigger(customer({ id: "1", name: "A", status: "Active", last_visit: recent }), r),
    ).toBe(false);
    expect(
      matchesRuleTrigger(
        customer({
          id: "2",
          name: "B",
          status: "No-show" as Customer["status"],
          last_visit: recent,
        }),
        r,
      ),
    ).toBe(true);
    expect(
      matchesRuleTrigger(
        customer({
          id: "3",
          name: "C",
          status: "No-show" as Customer["status"],
          last_visit: old,
        }),
        r,
      ),
    ).toBe(false);
  });

  it("Custom matches everyone", () => {
    const r = rule({ trigger_type: "Custom" });
    expect(matchesRuleTrigger(customer({ id: "1", name: "A" }), r)).toBe(true);
  });
});

describe("matchesExtraFilters", () => {
  it("last_visit 1 keeps yesterday only", () => {
    const now = new Date("2026-07-02T18:00:00Z");
    expect(matchesLastVisitBucket("2026-07-01", "1", now)).toBe(true);
    expect(matchesLastVisitBucket("2026-06-30", "1", now)).toBe(false);
  });

  it("last_visit 7 keeps visits within last week", () => {
    const c = customer({
      id: "1",
      name: "A",
      last_visit: new Date(Date.now() - 5 * 86400000).toISOString(),
    });
    expect(matchesExtraFilters(c, { last_visit: "7" })).toBe(true);
    expect(
      matchesExtraFilters(
        { ...c, last_visit: new Date(Date.now() - 10 * 86400000).toISOString() },
        { last_visit: "7" },
      ),
    ).toBe(false);
  });

  it("last_visit 30 keeps recent visitors", () => {
    const c = customer({
      id: "1",
      name: "A",
      last_visit: new Date(Date.now() - 5 * 86400000).toISOString(),
    });
    expect(matchesExtraFilters(c, { last_visit: "30" })).toBe(true);
  });

  it("has_email requires email", () => {
    expect(
      matchesExtraFilters(customer({ id: "1", name: "A", email: "" }), { has_email: true }),
    ).toBe(false);
  });
});

describe("sanitizeAudienceFilters", () => {
  it("accepts yesterday bucket", () => {
    expect(sanitizeAudienceFilters({ last_visit: "1" }).last_visit).toBe("1");
  });

  it("accepts 7-day bucket", () => {
    expect(sanitizeAudienceFilters({ last_visit: "7" }).last_visit).toBe("7");
  });

  it("strips invalid last_visit values", () => {
    expect(sanitizeAudienceFilters({ last_visit: "14" as never }).last_visit).toBeUndefined();
  });
});

describe("helpers", () => {
  it("isNoShowStatus", () => {
    expect(isNoShowStatus("No-show")).toBe(true);
    expect(isNoShowStatus("no_show")).toBe(true);
    expect(isNoShowStatus("Active")).toBe(false);
  });

  it("matchesLastVisitBucket 7", () => {
    const recent = new Date(Date.now() - 3 * 86400000).toISOString();
    expect(matchesLastVisitBucket(recent, "7")).toBe(true);
  });

  it("isCampaignDateReached", () => {
    expect(isCampaignDateReached("2026-06-25", new Date("2026-06-23T17:00:00Z"))).toBe(false);
    expect(isCampaignDateReached("2026-06-25", new Date("2026-06-25T17:00:00Z"))).toBe(true);
  });

  it("daysSince returns Infinity for empty date", () => {
    expect(daysSince("")).toBe(Infinity);
  });
});
