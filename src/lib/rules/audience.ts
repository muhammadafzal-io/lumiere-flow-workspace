import "server-only";

import { deriveLastVisit } from "@/lib/customers/last-visit";
import { countCustomerVisits, splitAppointmentField } from "@/lib/customers/visit-count";
import { getSupabase } from "@/lib/supabase";
import type { Customer, Rule } from "@/lib/types";
import type { RuleAudienceFilters, RuleAudienceRow } from "@/lib/rules/audience-config";
import { countRuleFilters } from "@/lib/rules/audience-config";
import {
  daysSince,
  isCampaignDateReached,
  matchesExtraFilters,
  matchesRuleTrigger,
  normalizeRuleForAudience,
  treatmentTriggerLabel,
} from "@/lib/rules/audience-match";
import { buildTreatmentCalendarRuleAudience } from "@/lib/rules/treatment-calendar-audience";
import { usesTreatmentCalendarSource } from "@/lib/rules/audience-match";

function mapCustomer(row: Record<string, unknown>): Customer {
  const apptRaw = String(row["Appointments"] ?? "");
  const appts = splitAppointmentField(apptRaw);
  const treatmentsRaw = String(row["Treatment Interest"] ?? "");
  const treatments = treatmentsRaw
    .split(/[;,]/)
    .map((s) => s.trim())
    .filter(Boolean) as Customer["treatments"];

  return {
    id: String(row.id),
    name: String(row["Name"] ?? "Unknown"),
    phone: String(row["Phone"] ?? ""),
    email: String(row["Email"] ?? ""),
    birthday: String(row["Birthday"] ?? ""),
    last_visit: deriveLastVisit(String(row["Last Visit"] ?? ""), appts),
    total_visits: countCustomerVisits(apptRaw || null, String(row["Last Visit"] ?? "") || null),
    lifetime_value: 0,
    treatments,
    status: (row["Status"] as Customer["status"]) ?? "Active",
    notes: String(row["Notes"] ?? ""),
    visits: [],
    payments: [],
  };
}

async function fetchAllCustomers(): Promise<Customer[]> {
  const sb = getSupabase();
  const PAGE = 500;
  const all: Customer[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await sb
      .from("Clients")
      .select("*")
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    all.push(...data.map(mapCustomer));
    if (data.length < PAGE) break;
    offset += PAGE;
  }
  return all;
}

function toRow(c: Customer, detail: string): RuleAudienceRow {
  return {
    id: c.id,
    name: c.name,
    email: c.email,
    phone: c.phone,
    status: c.status,
    visits: c.total_visits,
    lastVisit: c.last_visit,
    treatment: c.treatments[0],
    detail,
  };
}

function triggerDetail(rule: Rule, c: Customer): string {
  const cfg = rule.trigger_config ?? {};
  switch (rule.trigger_type) {
    case "Visit count":
      return `${c.total_visits} visits (min ${cfg.min_visits ?? cfg.visit_count ?? "?"})`;
    case "Inactivity":
      return `${Math.floor(daysSince(c.last_visit))}d since last visit`;
    case "Birthday":
      return `Birthday ${c.birthday}`;
    case "Treatment-based":
      return treatmentTriggerLabel(cfg);
    case "Date-based": {
      const date = cfg.date as string | undefined;
      const active = isCampaignDateReached(date);
      return active ? `Campaign active (${date ?? "?"})` : `Starts ${date ?? "?"}`;
    }
    case "No-show recovery":
      return `No-show · ${Math.floor(daysSince(c.last_visit) * 24)}h ago`;
    default:
      return rule.trigger_type;
  }
}

export async function buildRuleAudience(
  rule: Rule,
  extraFilters: RuleAudienceFilters = {},
): Promise<{
  total: number;
  eligible: number;
  rows: RuleAudienceRow[];
  activeFilterCount: number;
}> {
  const customers = await fetchAllCustomers();
  const total = customers.length;
  const normalizedRule = normalizeRuleForAudience(rule);

  const mergedFilters: RuleAudienceFilters = {
    ...(normalizedRule.trigger_config?.audience_filters as RuleAudienceFilters | undefined),
    ...extraFilters,
    ...(normalizedRule.trigger_type === "Visit count" &&
    normalizedRule.trigger_config?.min_visits != null
      ? {
          visit_min: Math.max(
            extraFilters.visit_min ?? 0,
            normalizedRule.trigger_config.min_visits as number,
          ),
        }
      : {}),
  };

  const ruleMinVisits =
    normalizedRule.trigger_type === "Visit count"
      ? (normalizedRule.trigger_config.min_visits ?? normalizedRule.trigger_config.visit_count)
      : undefined;

  if (usesTreatmentCalendarSource(normalizedRule)) {
    const rows = await buildTreatmentCalendarRuleAudience(normalizedRule, mergedFilters, customers);
    return {
      total: customers.length,
      eligible: rows.length,
      rows,
      activeFilterCount: countRuleFilters(mergedFilters, ruleMinVisits as number | undefined),
    };
  }

  const rows = customers
    .filter((c) => matchesRuleTrigger(c, normalizedRule))
    .filter((c) => matchesExtraFilters(c, mergedFilters))
    .map((c) => toRow(c, triggerDetail(normalizedRule, c)));

  return {
    total,
    eligible: rows.length,
    rows,
    activeFilterCount: countRuleFilters(mergedFilters, ruleMinVisits as number | undefined),
  };
}

export async function getRuleFilterSuggestions(
  field: "status" | "treatment" | "visit_range",
  q: string,
): Promise<string[]> {
  const customers = await fetchAllCustomers();
  const query = q.trim().toLowerCase();

  if (field === "status") {
    return [...new Set(customers.map((c) => c.status))]
      .filter((v) => !query || v.toLowerCase().includes(query))
      .slice(0, 12);
  }
  if (field === "treatment") {
    const values = new Set<string>();
    customers.forEach((c) => c.treatments.forEach((t) => values.add(t)));
    return [...values].filter((v) => !query || v.toLowerCase().includes(query)).slice(0, 12);
  }
  if (field === "visit_range") {
    return ["1-4 visits", "5-9 visits", "10-14 visits", "15+ visits"].filter(
      (v) => !query || v.includes(query),
    );
  }
  return [];
}
