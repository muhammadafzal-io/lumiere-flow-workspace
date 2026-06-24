import type { Customer, Rule } from "@/lib/types";
import type { RuleAudienceFilters } from "@/lib/rules/audience-config";

export const LAST_VISIT_BUCKETS = ["7", "30", "30-90", "90", "any"] as const;
export type LastVisitBucket = (typeof LAST_VISIT_BUCKETS)[number];

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

export function matchesLastVisitBucket(lastVisit: string, bucket: LastVisitBucket): boolean {
  if (bucket === "any") return true;
  if (!lastVisit) return false;
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
  if (filters.visit_min != null && c.total_visits < filters.visit_min) return false;
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
      const daysAfter = Number(cfg.days_after ?? 0);
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
