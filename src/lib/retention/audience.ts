import "server-only";

import {
  getAllClients,
  getDormantClients,
  getUpcomingBirthdays,
} from "@/lib/integrations/airtable";
import { getUpcomingAppointments } from "@/lib/integrations/google-calendar";
import type { Client } from "@/types";
import { getClinicTimezone } from "@/lib/clinic-config";
import {
  countActiveFilters,
  type AudienceFilters,
  type AudienceResult,
  type AudienceRow,
  type RetentionFlowKey,
} from "@/lib/retention/audience-config";
import { countCustomerVisits } from "@/lib/customers/visit-count";
import { listFollowupCandidates } from "@/lib/retention/followup-candidates";

export type {
  AudienceFilters,
  AudienceResult,
  AudienceRow,
  RetentionFlowKey,
} from "@/lib/retention/audience-config";
export {
  applyVisitRangePreset,
  defaultFiltersForFlow,
  filtersForFlow,
  parseFiltersFromSearchParams,
} from "@/lib/retention/audience-config";

function parseVisitCount(client: Client): number {
  return countCustomerVisits(client.appointments, client.lastVisit);
}

function daysSince(iso?: string): number {
  if (!iso) return Infinity;
  return (Date.now() - new Date(iso).getTime()) / 86400000;
}

function matchesLastVisit(
  lastVisit: string | undefined,
  bucket: AudienceFilters["last_visit"],
): boolean {
  if (!bucket || bucket === "any") return true;
  if (!lastVisit) return false;
  const days = daysSince(lastVisit);
  if (bucket === "30") return days <= 30;
  if (bucket === "30-90") return days > 30 && days <= 90;
  if (bucket === "90") return days > 90;
  return true;
}

function matchesClientFilters(client: Client, filters: AudienceFilters): boolean {
  if (filters.q) {
    const q = filters.q.toLowerCase();
    const hay = [client.name, client.email, client.phone, client.lastTreatment]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (!hay.includes(q)) return false;
  }

  if (filters.status?.length) {
    const s = (client.status ?? "").toLowerCase();
    if (!filters.status.some((x) => s.includes(x.toLowerCase()))) return false;
  }

  if (filters.treatment?.length) {
    const t = (client.lastTreatment ?? "").toLowerCase();
    if (!filters.treatment.some((x) => t.includes(x.toLowerCase()))) return false;
  }

  const visits = parseVisitCount(client);
  if (filters.visit_min != null && filters.visit_min > 0 && visits < filters.visit_min)
    return false;
  if (filters.visit_max != null && visits > filters.visit_max) return false;

  if (!matchesLastVisit(client.lastVisit, filters.last_visit)) return false;

  if (filters.has_email === true && !client.email) return false;
  if (filters.has_email === false && client.email) return false;

  const hasContact = !!(client.telegramId || client.phone);
  if (filters.has_contact === true && !hasContact) return false;
  if (filters.has_contact === false && hasContact) return false;

  return true;
}

function clientToRow(client: Client, detail?: string): AudienceRow {
  return {
    id: client.id ?? "",
    name: client.name,
    email: client.email,
    phone: client.phone,
    status: client.status,
    visits: parseVisitCount(client),
    lastVisit: client.lastVisit,
    treatment: client.lastTreatment,
    detail,
  };
}

function hoursUntil(isoTime: string): number {
  return (new Date(isoTime).getTime() - Date.now()) / (1000 * 60 * 60);
}

function reminderWindow(hoursAhead: number): "T-72h" | "T-24h" | "T-2h" | null {
  if (hoursAhead >= 68 && hoursAhead <= 76) return "T-72h";
  if (hoursAhead >= 20 && hoursAhead <= 28) return "T-24h";
  if (hoursAhead >= 1 && hoursAhead <= 4) return "T-2h";
  return null;
}

export async function buildAudience(
  flow: RetentionFlowKey,
  filters: AudienceFilters,
): Promise<AudienceResult> {
  switch (flow) {
    case "birthday":
      return buildBirthdayAudience(filters);
    case "reminders":
      return buildReminderAudience(filters);
    case "noshow":
      return buildNoshowAudience(filters);
    case "reactivation":
      return buildReactivationAudience(filters);
    case "followup":
      return buildFollowupAudience(filters);
  }
}

async function buildBirthdayAudience(filters: AudienceFilters): Promise<AudienceResult> {
  const daysAhead = filters.birthday_days_ahead ?? 7;
  const base = await getUpcomingBirthdays(daysAhead);
  const total = base.length;

  const rows = base
    .filter((c) => {
      if (filters.credit_not_sent && c.birthdayCreditSent) return false;
      return matchesClientFilters(c, filters);
    })
    .map((c) => clientToRow(c, `Birthday in ${daysAhead}d`));

  return {
    flow: "birthday",
    total,
    eligible: rows.length,
    rows,
    activeFilterCount: countActiveFilters(filters, "birthday"),
  };
}

async function buildReminderAudience(filters: AudienceFilters): Promise<AudienceResult> {
  const tz = await getClinicTimezone();
  const appointments = await getUpcomingAppointments(4);
  const total = appointments.length;
  const rows: AudienceRow[] = [];

  for (const appt of appointments) {
    if (!appt.clientContact && filters.has_contact === true) continue;

    const hours = hoursUntil(appt.startTime);
    const window = reminderWindow(hours);
    if (filters.reminder_window && filters.reminder_window !== "any") {
      if (window !== filters.reminder_window) continue;
    }

    if (filters.q) {
      const q = filters.q.toLowerCase();
      const hay = `${appt.clientName} ${appt.treatment} ${appt.clientContact}`.toLowerCase();
      if (!hay.includes(q)) continue;
    }

    if (filters.treatment?.length) {
      const t = appt.treatment.toLowerCase();
      if (!filters.treatment.some((x) => t.includes(x.toLowerCase()))) continue;
    }

    const displayTime = new Date(appt.startTime).toLocaleString("en-US", {
      timeZone: tz,
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });

    rows.push({
      id: appt.id ?? appt.clientContact,
      name: appt.clientName,
      phone: appt.clientContact,
      treatment: appt.treatment,
      detail: window ? `${window} · ${displayTime}` : `${Math.round(hours)}h away · ${displayTime}`,
    });
  }

  return {
    flow: "reminders",
    total,
    eligible: rows.length,
    rows,
    activeFilterCount: countActiveFilters(filters, "reminders"),
  };
}

async function buildNoshowAudience(filters: AudienceFilters): Promise<AudienceResult> {
  const tz = await getClinicTimezone();
  const today = filters.noshow_date ?? new Date().toLocaleDateString("en-CA", { timeZone: tz });
  const clients = await getAllClients();
  const noshows = clients.filter((c) => {
    if (c.status?.toLowerCase() !== "no-show") return false;
    if (!c.lastVisit) return false;
    if (/^\d{4}-\d{2}-\d{2}$/.test(c.lastVisit)) return c.lastVisit === today;
    const visitDate = new Date(c.lastVisit).toLocaleDateString("en-CA", { timeZone: tz });
    return visitDate === today;
  });

  const total = noshows.length;
  const rows = noshows
    .filter((c) => matchesClientFilters(c, filters))
    .map((c) => clientToRow(c, `No-show ${today}`));

  return {
    flow: "noshow",
    total,
    eligible: rows.length,
    rows,
    activeFilterCount: countActiveFilters(filters, "noshow"),
  };
}

async function buildReactivationAudience(filters: AudienceFilters): Promise<AudienceResult> {
  const days = filters.dormant_days ?? 90;
  const base = await getDormantClients(days);
  const total = base.length;

  const rows = base
    .filter((c) => {
      const step = c.reactivationStep ?? 0;
      if (step > 3) return false;
      if (filters.reactivation_step?.length && !filters.reactivation_step.includes(step)) {
        return false;
      }
      if (c.lastReactivationSent && daysSince(c.lastReactivationSent) < 14 && step > 0) {
        return false;
      }
      return matchesClientFilters(c, filters);
    })
    .map((c) => clientToRow(c, `Step ${(c.reactivationStep ?? 0) + 1}/3 · dormant ${days}d+`));

  return {
    flow: "reactivation",
    total,
    eligible: rows.length,
    rows,
    activeFilterCount: countActiveFilters(filters, "reactivation"),
  };
}

async function buildFollowupAudience(filters: AudienceFilters): Promise<AudienceResult> {
  const tz = await getClinicTimezone();
  const candidates = await listFollowupCandidates(filters);
  const total = candidates.length;

  const rows: AudienceRow[] = candidates.map((c) => {
    const displayDate = new Date(c.endTime).toLocaleString("en-US", {
      timeZone: tz,
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
    return {
      id: c.appointmentId,
      name: c.clientName,
      email: c.email,
      phone: c.clientContact,
      treatment: c.treatment,
      detail: `${c.daysSinceEnd}d after · ${displayDate}`,
    };
  });

  return {
    flow: "followup",
    total,
    eligible: rows.length,
    rows,
    activeFilterCount: countActiveFilters(filters, "followup"),
  };
}

/** DB-driven suggestions for type-ahead filters */
export async function getFilterSuggestions(
  field: "status" | "treatment" | "visit_range",
  q: string,
): Promise<string[]> {
  const clients = await getAllClients();
  const query = q.trim().toLowerCase();

  if (field === "status") {
    const values = [...new Set(clients.map((c) => c.status).filter(Boolean))] as string[];
    return values.filter((v) => !query || v.toLowerCase().includes(query)).slice(0, 12);
  }

  if (field === "treatment") {
    const values = new Set<string>();
    for (const c of clients) {
      if (c.lastTreatment) {
        c.lastTreatment.split(/[;,]/).forEach((t) => {
          const trimmed = t.trim();
          if (trimmed) values.add(trimmed);
        });
      }
    }
    return [...values].filter((v) => !query || v.toLowerCase().includes(query)).slice(0, 12);
  }

  if (field === "visit_range") {
    const presets = ["1-4 visits", "5-9 visits", "10-14 visits", "15+ visits"];
    return presets.filter((v) => !query || v.includes(query));
  }

  return [];
}
