import type { CalendarEvent, RequiredFormStatus } from "@/types";

/**
 * What a client is allowed to see about their own appointment.
 *
 * Pure and allow-list based: fields are copied across one by one rather than spreading the event
 * and deleting what's private, so a field added to CalendarEvent later cannot leak by default.
 */

export type CustomerAppointmentStatus =
  | "upcoming"
  | "today"
  | "past"
  | "awaiting_details"
  | "awaiting_approval"
  | "cancelled";

export interface CustomerAction {
  kind: "form" | "photo" | "details";
  label: string;
  url: string;
}

export interface CustomerAppointment {
  id: string;
  treatment: string;
  startTime: string;
  endTime: string;
  practitioner: string | null;
  room: string | null;
  status: CustomerAppointmentStatus;
  /** The client's own booking notes — never the internal override text staff append. */
  notes: string | null;
  actions: CustomerAction[];
}

/**
 * Staff record policy overrides in the same notes field the client's own note lives in, marked
 * with an "Override:" prefix (see booking-service). Everything from that marker on is internal.
 */
export function clientVisibleNotes(notes: string | null | undefined): string | null {
  if (!notes) return null;
  const [clientPart] = notes.split(/\s*\|\s*Override:/i);
  const cleaned = clientPart.replace(/^Override:.*/i, "").trim();
  return cleaned || null;
}

export function customerAppointmentStatus(
  event: Pick<CalendarEvent, "startTime" | "endTime">,
  flags: { awaitingDetails?: boolean; awaitingApproval?: boolean; cancelled?: boolean },
  now: number,
): CustomerAppointmentStatus {
  if (flags.cancelled) return "cancelled";
  if (flags.awaitingDetails) return "awaiting_details";
  if (flags.awaitingApproval) return "awaiting_approval";

  const start = new Date(event.startTime).getTime();
  const end = new Date(event.endTime).getTime();
  if (Number.isNaN(start)) return "past";
  if (!Number.isNaN(end) && end <= now) return "past";
  if (start - now < 24 * 60 * 60_000 && start >= now) return "today";
  return start > now ? "upcoming" : "past";
}

export const CUSTOMER_STATUS_LABELS: Record<CustomerAppointmentStatus, string> = {
  upcoming: "Confirmed",
  today: "Coming up",
  past: "Completed",
  awaiting_details: "Needs your details",
  awaiting_approval: "Being reviewed",
  cancelled: "Cancelled",
};

/** Outstanding things the client can act on, each pointing at the page that already handles it. */
export function customerActions(input: {
  forms: RequiredFormStatus[];
  photo: { requirement: "OPTIONAL" | "REQUIRED"; status: string; url: string } | null;
  completionUrl: string | null;
}): CustomerAction[] {
  const actions: CustomerAction[] = [];

  for (const form of input.forms) {
    if (form.status === "PENDING" && form.url) {
      actions.push({ kind: "form", label: `Complete ${form.formName}`, url: form.url });
    }
  }

  if (input.photo && input.photo.status === "PENDING") {
    actions.push({
      kind: "photo",
      label:
        input.photo.requirement === "REQUIRED" ? "Upload your photo" : "Add a photo (optional)",
      url: input.photo.url,
    });
  }

  if (input.completionUrl) {
    actions.push({
      kind: "details",
      label: "Finish your booking details",
      url: input.completionUrl,
    });
  }

  return actions;
}

export function toCustomerAppointment(
  event: CalendarEvent,
  extras: {
    status: CustomerAppointmentStatus;
    actions: CustomerAction[];
  },
): CustomerAppointment {
  return {
    id: event.id,
    treatment: event.treatment,
    startTime: event.startTime,
    endTime: event.endTime,
    practitioner: event.practitioner || null,
    room: event.room || null,
    status: extras.status,
    notes: clientVisibleNotes(event.notes),
    actions: extras.actions,
  };
}
