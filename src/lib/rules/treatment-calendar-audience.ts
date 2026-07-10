import "server-only";

import { lookupClient } from "@/lib/integrations/airtable";
import { getEventsByRange } from "@/lib/integrations/google-calendar";
import type { Client } from "@/types";
import type { Customer, Rule } from "@/lib/types";
import type { RuleAudienceFilters, RuleAudienceRow } from "@/lib/rules/audience-config";
import {
  chicagoDateDaysAgo,
  chicagoDateString,
  daysSince,
  eventTreatmentMatches,
  isCompletedCalendarEvent,
  lastVisitOnCalendarDaysAgo,
  matchesExtraFilters,
  normalizeTreatmentRuleConfig,
  treatmentTimingMode,
  treatmentTriggerLabel,
} from "@/lib/rules/audience-match";
import { getClinicTimezone } from "@/lib/clinic-config";

function phoneKey(phone: string): string {
  return phone.replace(/\D/g, "");
}

function customerFromEvent(
  event: { id: string; clientName: string; treatment: string; clientContact: string },
  client: Client | null,
  existing: Customer | undefined,
  targetDate: string,
): Customer {
  if (existing) return existing;

  const treatments = [event.treatment] as Customer["treatments"];
  if (client) {
    return {
      id: client.id ?? event.id,
      name: client.name?.trim() || event.clientName,
      phone: client.phone ?? event.clientContact,
      email: client.email ?? "",
      birthday: "",
      last_visit: targetDate,
      total_visits: 1,
      lifetime_value: 0,
      treatments,
      status: (client.status as Customer["status"]) ?? "Active",
      notes: "",
      visits: [],
      payments: [],
    };
  }

  return {
    id: event.id,
    name: event.clientName,
    phone: event.clientContact,
    email: "",
    birthday: "",
    last_visit: targetDate,
    total_visits: 1,
    lifetime_value: 0,
    treatments,
    status: "Active",
    notes: "",
    visits: [],
    payments: [],
  };
}

function appendClientRecordFallback(
  cfg: Record<string, unknown>,
  mode: ReturnType<typeof treatmentTimingMode>,
  ruleTreatment: string,
  customers: Customer[],
  extraFilters: RuleAudienceFilters,
  seen: Set<string>,
  rows: RuleAudienceRow[],
  triggerLabel: string,
  now: Date,
): void {
  const window =
    mode === "within_last_days"
      ? Math.max(1, Number(cfg.within_last_days ?? cfg.days_after ?? 7))
      : null;
  const exactDaysAgo = mode === "exact_day" ? Math.max(0, Number(cfg.days_after ?? 1)) : null;

  for (const c of customers) {
    if (seen.has(c.id)) continue;

    if (mode === "within_last_days") {
      if (!c.last_visit || daysSince(c.last_visit) > window!) continue;
    } else if (mode === "exact_day") {
      if (!lastVisitOnCalendarDaysAgo(c.last_visit, exactDaysAgo!, now)) continue;
    } else {
      continue;
    }

    if (ruleTreatment !== "Any") {
      const ts = c.treatments.join(" ").toLowerCase();
      if (!ts.includes(ruleTreatment.toLowerCase())) continue;
    }
    if (!matchesExtraFilters(c, extraFilters)) continue;

    seen.add(c.id);
    rows.push({
      id: c.id,
      name: c.name,
      email: c.email || undefined,
      phone: c.phone,
      status: c.status,
      visits: c.total_visits,
      lastVisit: c.last_visit,
      treatment: c.treatments[0],
      detail: `${triggerLabel} · ${Math.floor(daysSince(c.last_visit))}d ago (client record)`,
    });
  }
}

/** Audience from Google Calendar completed appointments on a specific clinic day or window. */
export async function buildTreatmentCalendarRuleAudience(
  rule: Rule,
  extraFilters: RuleAudienceFilters,
  customers: Customer[],
  now = new Date(),
): Promise<RuleAudienceRow[]> {
  const tz = await getClinicTimezone();
  const cfg = normalizeTreatmentRuleConfig(rule.trigger_config ?? {}, rule.name);
  const mode = treatmentTimingMode(cfg);
  const ruleTreatment = String(cfg.treatment ?? "Any");
  const triggerLabel = treatmentTriggerLabel(cfg);

  const byPhone = new Map<string, Customer>();
  const byId = new Map<string, Customer>();
  for (const c of customers) {
    byId.set(c.id, c);
    if (c.phone) byPhone.set(phoneKey(c.phone), c);
  }

  const seen = new Set<string>();
  const rows: RuleAudienceRow[] = [];

  let fromDate: string;
  let toDate: string;
  if (mode === "within_last_days") {
    const window = Math.max(1, Number(cfg.within_last_days ?? cfg.days_after ?? 7));
    fromDate = chicagoDateDaysAgo(window, now, tz);
    toDate = chicagoDateString(now, tz);
  } else {
    const daysAfter = Math.max(0, Number(cfg.days_after ?? 1));
    fromDate = chicagoDateDaysAgo(daysAfter, now, tz);
    toDate = fromDate;
  }

  let events: Awaited<ReturnType<typeof getEventsByRange>> = [];
  try {
    events = await getEventsByRange(fromDate, toDate);
  } catch (err) {
    console.warn("[rules] Calendar lookup failed, using client records:", err);
  }

  for (const event of events) {
    if (!isCompletedCalendarEvent(event.endTime, now)) continue;
    if (!eventTreatmentMatches(ruleTreatment, event.treatment)) continue;

    const client = event.clientContact
      ? await lookupClient({ phone: event.clientContact }).catch(() => null)
      : null;

    const phone = event.clientContact || client?.phone || "";
    const dedupeKey = client?.id ?? (phone ? phoneKey(phone) : event.id);
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const existing =
      (client?.id ? byId.get(client.id) : undefined) ??
      (phone ? byPhone.get(phoneKey(phone)) : undefined);

    const visitDate = new Date(event.endTime).toLocaleDateString("en-CA", { timeZone: tz });
    const customer = customerFromEvent(event, client, existing, visitDate);
    const email = customer.email || client?.email;

    if (!matchesExtraFilters({ ...customer, email: email ?? customer.email }, extraFilters)) {
      continue;
    }

    const displayDate = new Date(event.endTime).toLocaleString("en-US", {
      timeZone: tz,
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });

    rows.push({
      id: customer.id,
      name: customer.name,
      email: email || undefined,
      phone: customer.phone,
      status: customer.status,
      visits: customer.total_visits,
      lastVisit: visitDate,
      treatment: event.treatment,
      detail: `${triggerLabel} · ${displayDate} (calendar)`,
    });
  }

  appendClientRecordFallback(
    cfg,
    mode,
    ruleTreatment,
    customers,
    extraFilters,
    seen,
    rows,
    triggerLabel,
    now,
  );

  return rows.sort((a, b) => a.name.localeCompare(b.name));
}
