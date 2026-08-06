import type { Customer } from "@/lib/types";
import type { CalendarEvent, EventType, OpsLogEntry } from "@/types";
import type { AppointmentHistoryResult } from "@/lib/integrations/google-calendar";
import type { EmailSendLogEntry } from "@/lib/integrations/email-send-log-types";
import type { FollowupSendEntry } from "@/lib/retention/followup-sends";
import {
  calEventToLogRow,
  dedupeCalendarAgainstLog,
  type LogRow,
} from "@/lib/activity/merge-timeline";

// Pure functions only — no I/O — so this module can be unit-tested with hand-built fixtures
// instead of a live Supabase/Calendar connection.

export interface CustomerStatistics {
  totalVisits: number;
  firstVisit: string | null;
  lastVisit: string | null;
  upcomingCount: number;
  noShowCount: number;
  primaryPractitioner: string | null;
  primaryTreatment: string | null;
  /** No pricing data exists anywhere in this app today (Services have no price field, no
   * appointment write path ever sets one) — always `{ tracked: false }`, never a fabricated
   * number. See src/app/(admin)/customers/[id]/page-client.tsx for the matching UI treatment. */
  spend: { tracked: false };
}

export function computeCustomerStatistics(
  customer: Customer,
  history: AppointmentHistoryResult,
  activityRows: (OpsLogEntry & { id: string })[],
): CustomerStatistics {
  const hasCalendarData = history.matchedBy !== "unmatched";

  const totalVisits = hasCalendarData ? history.past.length : customer.total_visits;
  const firstVisit = hasCalendarData
    ? (history.past[history.past.length - 1]?.startTime ?? null)
    : null;
  const lastVisit = hasCalendarData
    ? (history.past[0]?.startTime ?? null)
    : customer.last_visit || null;

  const noShowCount = activityRows.filter(
    (a) => a.eventType === "no-show" || a.eventType === "noshow-recovery",
  ).length;

  const practitionerFreq = frequencyCount(history.past.map((e) => e.practitioner).filter(Boolean));
  const treatmentFreq = frequencyCount(history.past.map((e) => e.treatment).filter(Boolean));

  return {
    totalVisits,
    firstVisit,
    lastVisit,
    upcomingCount: history.upcoming.length,
    noShowCount,
    primaryPractitioner: topEntry(practitionerFreq),
    primaryTreatment: topEntry(treatmentFreq),
    spend: { tracked: false },
  };
}

export interface TreatmentSummary {
  name: string;
  visitCount: number;
  lastDate: string | null;
  source: "history" | "interest";
}

export function groupTreatments(
  history: AppointmentHistoryResult,
  treatmentInterest: string[],
): TreatmentSummary[] {
  const byName = new Map<string, TreatmentSummary>();

  for (const event of history.past) {
    if (!event.treatment) continue;
    const existing = byName.get(event.treatment);
    if (existing) {
      existing.visitCount += 1;
      if (!existing.lastDate || event.startTime > existing.lastDate) {
        existing.lastDate = event.startTime;
      }
    } else {
      byName.set(event.treatment, {
        name: event.treatment,
        visitCount: 1,
        lastDate: event.startTime,
        source: "history",
      });
    }
  }

  for (const name of treatmentInterest) {
    if (!byName.has(name)) {
      byName.set(name, { name, visitCount: 0, lastDate: null, source: "interest" });
    }
  }

  return Array.from(byName.values()).sort((a, b) => b.visitCount - a.visitCount);
}

export interface PractitionerSummary {
  name: string;
  visitCount: number;
  lastDate: string | null;
}

export function groupPractitioners(history: AppointmentHistoryResult): PractitionerSummary[] {
  const byName = new Map<string, PractitionerSummary>();

  for (const event of history.past) {
    if (!event.practitioner) continue;
    const existing = byName.get(event.practitioner);
    if (existing) {
      existing.visitCount += 1;
      if (!existing.lastDate || event.startTime > existing.lastDate) {
        existing.lastDate = event.startTime;
      }
    } else {
      byName.set(event.practitioner, {
        name: event.practitioner,
        visitCount: 1,
        lastDate: event.startTime,
      });
    }
  }

  return Array.from(byName.values()).sort((a, b) => b.visitCount - a.visitCount);
}

export interface TimelineEntry {
  id: string;
  timestamp: string;
  eventType: EventType;
  details: string;
  status: "success" | "pending" | "failed" | "sent" | "skipped";
  platform: string;
  source: "activity" | "calendar" | "email" | "followup";
}

const EMAIL_CATEGORY_TO_EVENT_TYPE: Record<string, EventType> = {
  rule: "campaign",
  campaign: "campaign",
  reminder: "reminder",
  birthday: "birthday",
  noshow: "no-show",
  reactivation: "reactivation",
  booking: "booking",
  cancellation: "cancellation",
  reschedule: "reschedule",
  general: "inquiry",
};

function emailRowToTimelineEntry(e: EmailSendLogEntry): TimelineEntry {
  return {
    id: `email_${e.id}`,
    timestamp: e.createdAt,
    eventType: EMAIL_CATEGORY_TO_EVENT_TYPE[e.category] ?? "inquiry",
    details: e.subject ? `Email: ${e.subject}` : `Email sent (${e.category})`,
    status: e.status,
    platform: "email",
    source: "email",
  };
}

function followupRowToTimelineEntry(f: FollowupSendEntry): TimelineEntry {
  return {
    id: `followup_${f.id}`,
    timestamp: f.sentAt,
    eventType: "followup",
    details: `Follow-up: ${f.treatment || "treatment"}`,
    status: f.status,
    platform: "email",
    source: "followup",
  };
}

function logRowToTimelineEntry(row: LogRow, source: TimelineEntry["source"]): TimelineEntry {
  return {
    id: row.id,
    timestamp: row.timestamp,
    eventType: row.eventType,
    details: row.details,
    status: row.status,
    platform: row.platform,
    source,
  };
}

/** Merges every source of a customer's history into one chronological feed. Calendar bookings
 * that already have a matching logged "booking" row are deduped (same rule /api/activity uses),
 * so a single appointment doesn't appear twice. */
export function mergeTimeline(
  activityRows: (OpsLogEntry & { id: string })[],
  history: AppointmentHistoryResult,
  emailRows: EmailSendLogEntry[],
  followupRows: FollowupSendEntry[],
  tz: string,
  limit = 200,
): TimelineEntry[] {
  const calendarEvents: CalendarEvent[] = [...history.past, ...history.upcoming];
  const calLogRows = calendarEvents.map((e) => calEventToLogRow(e, tz));
  const uniqueCalRows = dedupeCalendarAgainstLog(activityRows, calLogRows);

  const entries: TimelineEntry[] = [
    ...activityRows.map((r) => logRowToTimelineEntry(r, "activity")),
    ...uniqueCalRows.map((r) => logRowToTimelineEntry(r, "calendar")),
    ...emailRows.map(emailRowToTimelineEntry),
    ...followupRows.map(followupRowToTimelineEntry),
  ];

  return entries
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, limit);
}

function frequencyCount(values: string[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const v of values) map.set(v, (map.get(v) ?? 0) + 1);
  return map;
}

function topEntry(freq: Map<string, number>): string | null {
  let best: string | null = null;
  let bestCount = 0;
  for (const [name, count] of freq) {
    if (count > bestCount) {
      best = name;
      bestCount = count;
    }
  }
  return best;
}
