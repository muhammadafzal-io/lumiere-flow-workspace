import "server-only";

import { deriveLastVisit } from "@/lib/customers/last-visit";
import { getSupabase } from "@/lib/supabase";
import type { Customer, Rule } from "@/lib/types";
import type { RuleAudienceFilters, RuleAudienceRow } from "@/lib/rules/audience-config";
import { countRuleFilters } from "@/lib/rules/audience-config";
import { matchesExtraFilters, matchesRuleTrigger } from "@/lib/rules/audience-match";

function mapCustomer(row: Record<string, unknown>): Customer {
  const apptRaw = String(row["Appointments"] ?? "");
  const appts = apptRaw
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
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
    total_visits: appts.length,
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

import { daysSince, isCampaignDateReached } from "@/lib/rules/audience-match";

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
      return `${cfg.treatment ?? "Any"} · ${Math.floor(daysSince(c.last_visit))}d since visit`;
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

  const mergedFilters: RuleAudienceFilters = {
    ...(rule.trigger_config?.audience_filters as RuleAudienceFilters | undefined),
    ...extraFilters,
    ...(rule.trigger_type === "Visit count" && rule.trigger_config?.min_visits != null
      ? {
          visit_min: Math.max(
            extraFilters.visit_min ?? 0,
            rule.trigger_config.min_visits as number,
          ),
        }
      : {}),
  };

  const rows = customers
    .filter((c) => matchesRuleTrigger(c, rule))
    .filter((c) => matchesExtraFilters(c, mergedFilters))
    .map((c) => toRow(c, triggerDetail(rule, c)));

  const ruleMinVisits =
    rule.trigger_type === "Visit count"
      ? (rule.trigger_config.min_visits ?? rule.trigger_config.visit_count)
      : undefined;

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
