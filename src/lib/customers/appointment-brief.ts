import type { Customer } from "@/lib/types";
import type { CalendarEvent, RequiredFormStatus } from "@/types";
import type { TimelineEntry } from "@/lib/customers/profile";
import { splitAppointmentField } from "@/lib/customers/visit-count";

// Pure functions only — the customer profile's client history view is derived entirely from the
// already-loaded profile response, so opening it costs no extra requests.

export type AppointmentState = "pending" | "upcoming" | "in_progress" | "completed" | "past";

export interface CancellationEntry {
  id: string;
  timestamp: string;
  details: string;
  platform: string;
}

export interface ReviewEntry {
  id: string;
  appointmentId: string;
  sentiment: string;
  status: "SENT" | "FAILED" | "SKIPPED";
  feedback: string;
  createdAt: string;
}

export interface BriefSource {
  customer: Customer;
  appointments: {
    upcoming: CalendarEvent[];
    past: CalendarEvent[];
    pendingEventIds?: string[];
    cancellations?: CancellationEntry[];
  };
  timeline: TimelineEntry[];
  reviews?: ReviewEntry[];
}

export interface BriefAppointment {
  event: CalendarEvent;
  state: AppointmentState;
}

export interface BriefTreatment {
  name: string;
  count: number;
  lastDate: string | null;
  lastPractitioner: string | null;
}

export interface BriefPractitioner {
  name: string;
  count: number;
  lastDate: string | null;
}

export interface HistoryAppointment extends BriefAppointment {
  /** Channel the booking was made through, when a matching logged booking exists. */
  bookedVia: string | null;
}

export interface HistoryForm {
  form: RequiredFormStatus;
  event: CalendarEvent;
}

export interface ClientHistorySummary {
  overview: {
    totalAppointments: number;
    visits: number;
    markedComplete: number;
    cancelled: number;
    pendingDetails: number;
    clientSince: string | null;
    lastActivity: string | null;
    nextAppointment: BriefAppointment | null;
    lastTreatment: string | null;
  };
  /** Appointments that have started, most recent first. */
  past: HistoryAppointment[];
  /** Appointments still to come, soonest first. */
  upcoming: HistoryAppointment[];
  treatments: BriefTreatment[];
  practitioners: BriefPractitioner[];
  lastPractitioner: string | null;
  /** Every required form across all appointments, newest first. */
  forms: HistoryForm[];
  pendingForms: number;
  lastFormSent: HistoryForm | null;
  reviews: ReviewEntry[];
  cancellations: CancellationEntry[];
  recentActivity: TimelineEntry[];
}

const BOOKING_LOG_WINDOW_MS = 5 * 60_000;

/** Milliseconds since epoch, or null for a missing/unparseable date. */
export function timeOf(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : t;
}

/** Newest first; unknown dates last. */
function byTimeDesc(a: string | null | undefined, b: string | null | undefined): number {
  const ta = timeOf(a);
  const tb = timeOf(b);
  if (ta === null && tb === null) return 0;
  if (ta === null) return 1;
  if (tb === null) return -1;
  return tb - ta;
}

/** "Mark complete" appends "<UTC date of start> <treatment>" to the client's Appointments field —
 * the only saved record that a visit was completed. */
export function completedVisitKeys(customer: Pick<Customer, "appointments">): Set<string> {
  return new Set(splitAppointmentField(customer.appointments).map((s) => s.trim().toLowerCase()));
}

function completedKey(event: CalendarEvent): string | null {
  const t = timeOf(event.startTime);
  if (t === null) return null;
  return `${new Date(t).toISOString().slice(0, 10)} ${event.treatment}`.trim().toLowerCase();
}

export function appointmentState(
  event: CalendarEvent,
  ctx: { now: number; pending: Set<string>; completed: Set<string> },
): AppointmentState {
  const key = completedKey(event);
  if (key && ctx.completed.has(key)) return "completed";
  if (ctx.pending.has(event.id)) return "pending";
  const start = timeOf(event.startTime);
  const end = timeOf(event.endTime) ?? start;
  if (start === null) return "past";
  if (start > ctx.now) return "upcoming";
  if (end !== null && end > ctx.now) return "in_progress";
  return "past";
}

export const APPOINTMENT_STATE_LABELS: Record<AppointmentState, string> = {
  pending: "Pending details",
  upcoming: "Upcoming",
  in_progress: "In progress",
  completed: "Marked complete",
  past: "Past",
};

function allAppointments(source: BriefSource): CalendarEvent[] {
  const seen = new Set<string>();
  const out: CalendarEvent[] = [];
  for (const e of [...source.appointments.upcoming, ...source.appointments.past]) {
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    out.push(e);
  }
  return out;
}

/** Everything the customer profile's "client history" view shows, across all of the client's
 * appointments. */
export function buildClientHistory(
  source: BriefSource,
  now: number = Date.now(),
): ClientHistorySummary {
  const events = allAppointments(source);
  const ctx = {
    now,
    pending: new Set(source.appointments.pendingEventIds ?? []),
    completed: completedVisitKeys(source.customer),
  };
  const withDetails = (e: CalendarEvent): HistoryAppointment => ({
    event: e,
    state: appointmentState(e, ctx),
    bookedVia: findBookingChannel(e, source.timeline),
  });

  const dated = events.filter((e) => timeOf(e.startTime) !== null);
  const past = dated
    .filter((e) => timeOf(e.startTime)! <= now)
    .sort((a, b) => byTimeDesc(a.startTime, b.startTime))
    .map(withDetails);
  const upcoming = dated
    .filter((e) => timeOf(e.startTime)! > now)
    .sort((a, b) => byTimeDesc(b.startTime, a.startTime))
    .map(withDetails);

  const treatmentsByName = new Map<string, BriefTreatment>();
  const practitionersByName = new Map<string, BriefPractitioner>();
  for (const { event: e } of past) {
    // `past` is newest first, so the first sighting of a name holds its latest date.
    if (e.treatment) {
      const t = treatmentsByName.get(e.treatment);
      if (t) t.count += 1;
      else
        treatmentsByName.set(e.treatment, {
          name: e.treatment,
          count: 1,
          lastDate: e.startTime,
          lastPractitioner: e.practitioner?.trim() || null,
        });
    }
    const pracName = e.practitioner?.trim();
    if (pracName) {
      const p = practitionersByName.get(pracName);
      if (p) p.count += 1;
      else practitionersByName.set(pracName, { name: pracName, count: 1, lastDate: e.startTime });
    }
  }

  const visits = events.filter((e) => {
    const end = timeOf(e.endTime) ?? timeOf(e.startTime);
    return end !== null && end <= now;
  }).length;

  const firstAppointment = past[past.length - 1]?.event;
  const clientSince =
    [source.customer.created_at, firstAppointment?.startTime]
      .filter((d): d is string => timeOf(d) !== null)
      .sort((a, b) => byTimeDesc(b, a))[0] ?? null;

  const timeline = [...source.timeline].sort((a, b) => byTimeDesc(a.timestamp, b.timestamp));

  const forms: HistoryForm[] = events
    .flatMap((e) => (e.requiredForms ?? []).map((form) => ({ form, event: e })))
    .sort(
      (a, b) =>
        byTimeDesc(a.form.sentAt, b.form.sentAt) ||
        byTimeDesc(a.event.startTime, b.event.startTime),
    );

  const all = [...past, ...upcoming];
  return {
    overview: {
      totalAppointments: events.length,
      visits,
      markedComplete: all.filter((a) => a.state === "completed").length,
      cancelled: source.appointments.cancellations?.length ?? 0,
      pendingDetails: all.filter((a) => a.state === "pending").length,
      clientSince,
      lastActivity: timeline[0]?.timestamp ?? null,
      nextAppointment: upcoming[0] ?? null,
      lastTreatment: past.find((p) => p.event.treatment)?.event.treatment ?? null,
    },
    past,
    upcoming,
    treatments: [...treatmentsByName.values()].sort((a, b) => b.count - a.count),
    practitioners: [...practitionersByName.values()].sort((a, b) => b.count - a.count),
    lastPractitioner: past.find((p) => p.event.practitioner?.trim())?.event.practitioner ?? null,
    forms,
    pendingForms: forms.filter((f) => f.form.status === "PENDING").length,
    lastFormSent: forms.find((f) => timeOf(f.form.sentAt) !== null) ?? null,
    reviews: [...(source.reviews ?? [])].sort((a, b) => byTimeDesc(a.createdAt, b.createdAt)),
    cancellations: [...(source.appointments.cancellations ?? [])].sort((a, b) =>
      byTimeDesc(a.timestamp, b.timestamp),
    ),
    recentActivity: timeline.slice(0, 10),
  };
}

/** The platform of the logged booking made within a few minutes of this event's creation —
 * the same pairing rule the activity feed uses to dedupe calendar rows against logged bookings. */
function findBookingChannel(event: CalendarEvent, timeline: TimelineEntry[]): string | null {
  const created = timeOf(event.createdAt);
  if (created === null) return null;
  const match = timeline.find((t) => {
    if (t.source !== "activity" || t.eventType !== "booking") return false;
    const at = timeOf(t.timestamp);
    return at !== null && Math.abs(at - created) <= BOOKING_LOG_WINDOW_MS;
  });
  return match?.platform || null;
}
