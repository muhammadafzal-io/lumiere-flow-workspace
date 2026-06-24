/** Client-safe filter types for rule audience builder (shared with retention pattern). */
export interface RuleAudienceFilters {
  q?: string;
  status?: string[];
  treatment?: string[];
  visit_min?: number;
  visit_max?: number;
  last_visit?: "7" | "30" | "30-90" | "90" | "any";
  has_email?: boolean;
}

export interface RuleAudienceRow {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  status?: string;
  visits?: number;
  lastVisit?: string;
  treatment?: string;
  detail?: string;
  skipped?: boolean;
}

export function defaultRuleAudienceFilters(): RuleAudienceFilters {
  return { last_visit: "any", has_email: true };
}

export function applyVisitRangePreset(
  filters: RuleAudienceFilters,
  preset: string,
): RuleAudienceFilters {
  if (preset.startsWith("1-4")) return { ...filters, visit_min: 1, visit_max: 4 };
  if (preset.startsWith("5-9")) return { ...filters, visit_min: 5, visit_max: 9 };
  if (preset.startsWith("10-14")) return { ...filters, visit_min: 10, visit_max: 14 };
  if (preset.includes("15+")) return { ...filters, visit_min: 15, visit_max: undefined };
  return filters;
}

export function countRuleFilters(filters: RuleAudienceFilters, ruleMinVisits?: number): number {
  let n = 0;
  if (filters.q?.trim()) n++;
  if (filters.status?.length) n++;
  if (filters.treatment?.length) n++;
  if (filters.visit_min != null && filters.visit_min !== ruleMinVisits) n++;
  if (filters.visit_max != null) n++;
  if (filters.last_visit && filters.last_visit !== "any") n++;
  if (filters.has_email === false) n++;
  return n;
}

export function parseRuleAudienceParams(params: URLSearchParams): RuleAudienceFilters {
  return {
    q: params.get("q") ?? undefined,
    status: params.getAll("status").filter(Boolean),
    treatment: params.getAll("treatment").filter(Boolean),
    visit_min: params.has("visit_min") ? Number(params.get("visit_min")) : undefined,
    visit_max: params.has("visit_max") ? Number(params.get("visit_max")) : undefined,
    last_visit: (params.get("last_visit") as RuleAudienceFilters["last_visit"]) ?? "any",
    has_email:
      params.get("has_email") === "yes" ? true : params.get("has_email") === "no" ? false : true,
  };
}
