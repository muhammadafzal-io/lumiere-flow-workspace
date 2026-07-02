import type { Customer, Rule } from "@/lib/types";
import type { RuleAudienceFilters } from "@/lib/rules/audience-config";

export const LAST_VISIT_BUCKETS = ["0", "1", "7", "30", "30-90", "90", "any"] as const;
export type LastVisitBucket = (typeof LAST_VISIT_BUCKETS)[number];

/** Chicago calendar date (YYYY-MM-DD) parsed from a last-visit value. */
export function lastVisitChicagoDate(lastVisit: string): string | null {
  if (!lastVisit?.trim()) return null;
  const trimmed = lastVisit.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed.slice(0, 10);
  const d = new Date(trimmed);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
}

/** Chicago calendar date N days before today (0 = today, 1 = yesterday). */
export function chicagoDateDaysAgo(daysAgo: number, now = new Date()): string {
  const today = chicagoDateString(now);
  const [y, m, d] = today.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d - daysAgo));
  const yy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

export function lastVisitOnCalendarDaysAgo(
  lastVisit: string,
  daysAgo: number,
  now = new Date(),
): boolean {
  const visitDate = lastVisitChicagoDate(lastVisit);
  if (!visitDate) return false;
  return visitDate === chicagoDateDaysAgo(daysAgo, now);
}

export function normalizeTreatmentRuleConfig(
  cfg: Record<string, unknown>,
  ruleName?: string,
): Record<string, unknown> {
  const out = { ...cfg };
  const audienceFilters = out.audience_filters as RuleAudienceFilters | undefined;
  let mode = treatmentTimingMode(out);
  const name = (ruleName ?? "").toLowerCase();

  // Conflicting: "at least 30 days" trigger + "within 30 days" filter → ~exactly 30 days ago
  if (
    mode === "minimum_days" &&
    Number(out.days_after) === 30 &&
    audienceFilters?.last_visit === "30"
  ) {
    out.treatment_timing = "exact_day";
    out.exact_calendar_day = true;
    out.days_after = 30;
    out.audience_filters = { ...audienceFilters, last_visit: "any" };
    mode = "exact_day";
  }

  // "Last month" / one month since visit → treatment ~30 calendar days ago
  if (
    mode === "minimum_days" &&
    /\b(last month|a month since|month since)\b/.test(name) &&
    Number(out.days_after) >= 28
  ) {
    out.treatment_timing = "exact_day";
    out.exact_calendar_day = true;
    out.days_after = Number(out.days_after) || 30;
    if (audienceFilters?.last_visit === "30") {
      out.audience_filters = { ...audienceFilters, last_visit: "any" };
    }
    mode = "exact_day";
  }

  const withinMatch = name.match(/\b(?:last|within|past|in)\s+(\d+)\s+days?\b/);
  if (withinMatch && mode !== "within_last_days" && !name.includes("month")) {
    out.treatment_timing = "within_last_days";
    out.within_last_days = parseInt(withinMatch[1], 10);
    out.exact_calendar_day = false;
    mode = "within_last_days";
  }

  return out;
}

export function normalizeRuleForAudience(rule: Rule): Rule {
  if (rule.trigger_type !== "Treatment-based") return rule;
  return {
    ...rule,
    trigger_config: normalizeTreatmentRuleConfig(rule.trigger_config ?? {}, rule.name),
  };
}

export function usesTreatmentCalendarSource(rule: Rule): boolean {
  if (rule.trigger_type !== "Treatment-based") return false;
  const cfg = rule.trigger_config ?? {};
  if (cfg.treatment_timing === "within_last_days" || cfg.treatment_timing === "exact_day") {
    return true;
  }
  return cfg.exact_calendar_day === true;
}

export function treatmentTimingMode(
  cfg: Record<string, unknown>,
): "exact_day" | "within_last_days" | "minimum_days" {
  if (cfg.treatment_timing === "within_last_days") return "within_last_days";
  if (cfg.treatment_timing === "minimum_days") return "minimum_days";
  if (cfg.treatment_timing === "exact_day" || cfg.exact_calendar_day === true) {
    return "exact_day";
  }
  return "minimum_days";
}

export function isCompletedCalendarEvent(endTime: string, now = new Date()): boolean {
  return new Date(endTime).getTime() <= now.getTime();
}

export function eventTreatmentMatches(ruleTreatment: string, eventTreatment: string): boolean {
  if (!ruleTreatment || ruleTreatment === "Any") return true;
  return eventTreatment.toLowerCase().includes(ruleTreatment.toLowerCase());
}

export function treatmentTriggerLabel(cfg: Record<string, unknown>): string {
  const treatment = String(cfg.treatment ?? "Any");
  const mode = treatmentTimingMode(cfg);
  if (mode === "within_last_days") {
    const window = Number(cfg.within_last_days ?? cfg.days_after ?? 7);
    return `${treatment} · treatment within last ${window} days (calendar)`;
  }
  if (mode === "exact_day") {
    const days = Number(cfg.days_after ?? 1);
    if (days === 0) return `${treatment} · visit today (calendar)`;
    if (days === 1) return `${treatment} · visit yesterday (calendar)`;
    return `${treatment} · visit ${days} calendar days ago (calendar)`;
  }
  return `${cfg.days_after ?? "?"} days after ${treatment}`;
}

export function daysSince(iso: string): number {
  if (!iso) return Infinity;
  return (Date.now() - new Date(iso).getTime()) / 86400000;
}

export function chicagoDateString(now = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
}

export function isCampaignDateReached(dateStr: string | undefined, now = new Date()): boolean {
  if (!dateStr?.trim()) return true;
  const normalized = dateStr.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return true;
  return chicagoDateString(now) >= normalized;
}

export function birthdayWithinDays(birthday: string, daysAhead: number, now = new Date()): boolean {
  if (!birthday) return false;
  const todayStr = chicagoDateString(now);
  const [y, m, d] = todayStr.split("-").map(Number);
  const parts = birthday.split("-").map(Number);
  let month: number, day: number;
  if (parts.length === 3) [, month, day] = parts;
  else if (parts.length === 2) [month, day] = parts;
  else return false;
  let bday = new Date(y, month - 1, day);
  const today = new Date(y, m - 1, d);
  if (bday < today) bday = new Date(y + 1, month - 1, day);
  const until = (bday.getTime() - today.getTime()) / 86400000;
  return until >= 0 && until <= daysAhead;
}

export function isNoShowStatus(status: string): boolean {
  return status.toLowerCase().replace(/_/g, "-").includes("no-show");
}

export function matchesLastVisitBucket(
  lastVisit: string,
  bucket: LastVisitBucket,
  now = new Date(),
): boolean {
  if (bucket === "any") return true;
  if (!lastVisit) return false;
  if (bucket === "0") return lastVisitOnCalendarDaysAgo(lastVisit, 0, now);
  if (bucket === "1") return lastVisitOnCalendarDaysAgo(lastVisit, 1, now);
  const days = daysSince(lastVisit);
  if (bucket === "7") return days <= 7;
  if (bucket === "30") return days <= 30;
  if (bucket === "30-90") return days > 30 && days <= 90;
  if (bucket === "90") return days > 90;
  return true;
}

export function matchesExtraFilters(c: Customer, filters: RuleAudienceFilters): boolean {
  if (filters.q) {
    const q = filters.q.toLowerCase();
    const hay = [c.name, c.email, c.phone, c.treatments.join(" ")].join(" ").toLowerCase();
    if (!hay.includes(q)) return false;
  }
  if (filters.status?.length) {
    const s = c.status.toLowerCase();
    if (!filters.status.some((x) => s.includes(x.toLowerCase()))) return false;
  }
  if (filters.treatment?.length) {
    const ts = c.treatments.join(" ").toLowerCase();
    if (!filters.treatment.some((x) => ts.includes(x.toLowerCase()))) return false;
  }
  if (filters.visit_min != null && filters.visit_min > 0 && c.total_visits < filters.visit_min) {
    return false;
  }
  if (filters.visit_max != null && c.total_visits > filters.visit_max) return false;
  if (filters.last_visit && filters.last_visit !== "any") {
    if (!matchesLastVisitBucket(c.last_visit, filters.last_visit)) return false;
  }
  if (filters.has_email === true && !c.email) return false;
  if (filters.has_email === false && c.email) return false;
  return true;
}

export function matchesRuleTrigger(c: Customer, rule: Rule, now = new Date()): boolean {
  const cfg = rule.trigger_config ?? {};
  switch (rule.trigger_type) {
    case "Visit count":
      return c.total_visits >= (cfg.min_visits ?? cfg.visit_count ?? 1);
    case "Inactivity":
      return daysSince(c.last_visit) >= (cfg.days ?? 90);
    case "Birthday":
      return birthdayWithinDays(c.birthday, cfg.days_before ?? 7, now);
    case "Treatment-based": {
      const t = cfg.treatment as string;
      if (t && t !== "Any" && !c.treatments.includes(t as Customer["treatments"][0])) {
        return false;
      }
      const mode = treatmentTimingMode(cfg);
      if (mode === "within_last_days") {
        const window = Math.max(1, Number(cfg.within_last_days ?? cfg.days_after ?? 7));
        if (!c.last_visit) return false;
        return daysSince(c.last_visit) <= window;
      }
      const daysAfter = Number(cfg.days_after ?? 0);
      if (mode === "exact_day") {
        if (daysAfter < 0) return false;
        return lastVisitOnCalendarDaysAgo(c.last_visit, daysAfter, now);
      }
      if (daysAfter > 0 && daysSince(c.last_visit) < daysAfter) return false;
      return true;
    }
    case "Date-based":
      return isCampaignDateReached(cfg.date as string | undefined, now);
    case "No-show recovery": {
      if (!isNoShowStatus(c.status)) return false;
      const hoursAfter = Number(cfg.hours_after ?? 24);
      const hoursSinceVisit = daysSince(c.last_visit) * 24;
      if (!Number.isFinite(hoursSinceVisit)) return false;
      return hoursSinceVisit <= hoursAfter;
    }
    case "Custom":
      return true;
    default:
      return true;
  }
}

export function sanitizeAudienceFilters(raw: Partial<RuleAudienceFilters>): RuleAudienceFilters {
  const out: RuleAudienceFilters = {};
  if (raw.q?.trim()) out.q = raw.q.trim();
  if (Array.isArray(raw.status)) out.status = raw.status.filter(Boolean).slice(0, 8);
  if (Array.isArray(raw.treatment)) out.treatment = raw.treatment.filter(Boolean).slice(0, 8);
  if (typeof raw.visit_min === "number" && raw.visit_min >= 0) out.visit_min = raw.visit_min;
  if (typeof raw.visit_max === "number" && raw.visit_max >= 0) out.visit_max = raw.visit_max;
  if (
    raw.last_visit === "0" ||
    raw.last_visit === "1" ||
    raw.last_visit === "7" ||
    raw.last_visit === "30" ||
    raw.last_visit === "30-90" ||
    raw.last_visit === "90" ||
    raw.last_visit === "any"
  ) {
    out.last_visit = raw.last_visit;
  }
  if (typeof raw.has_email === "boolean") out.has_email = raw.has_email;
  return out;
}
