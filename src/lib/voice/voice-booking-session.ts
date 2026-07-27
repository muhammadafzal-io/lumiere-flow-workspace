import { isFullName } from "@/lib/agent/client-name";
import { resolveVoiceBookingEmail } from "@/lib/voice/confirmed-email";
import { findVoicePhone } from "@/lib/voice/confirmed-phone";

export interface VoiceSlotMemory {
  startTime: string;
  displayTime?: string;
  availablePractitioners?: string[];
  availableRooms?: string[];
}

export interface VoiceUpcomingAppointment {
  eventId: string;
  phone?: string;
  clientName?: string;
  treatment?: string;
}

export interface VoiceBookingSession {
  treatment?: string;
  date?: string;
  durationMinutes?: number;
  lastSlots?: VoiceSlotMemory[];
  practitionerNames?: string[];
  lastUpcoming?: VoiceUpcomingAppointment;
}

export const VOICE_CANCEL_RESCHEDULE_TOOLS = new Set([
  "find_upcoming_appointment",
  "cancel_appointment",
  "check_reschedule_availability",
  "reschedule_appointment",
]);

const CANCEL_RESCHEDULE_TOOLS = VOICE_CANCEL_RESCHEDULE_TOOLS;

type TranscriptLine = { role: string; text: string };

function norm(s: string): string {
  return s.trim().toLowerCase();
}

function sameLabel(a: string, b: string): boolean {
  const x = norm(a);
  const y = norm(b);
  return x === y || x.includes(y) || y.includes(x);
}

/** Drop practitioner_name when the model passed the treatment name instead of a person. */
export function stripTreatmentAsPractitioner(
  input: Record<string, unknown>,
  treatment?: string,
): void {
  const pn = String(input.practitioner_name ?? input.preferred_practitioner ?? "").trim();
  const tx = String(input.treatment ?? treatment ?? "").trim();
  if (!pn || !tx || !sameLabel(pn, tx)) return;
  delete input.practitioner_name;
  delete input.preferred_practitioner;
}

function extractNameFromTranscript(lines: TranscriptLine[]): string | undefined {
  for (const line of lines) {
    if (line.role !== "user") continue;
    const m = line.text.match(
      /(?:i'?m|i am|my name is|this is|call me)\s+([A-Za-z][A-Za-z'-]*(?:\s+[A-Za-z][A-Za-z'-]*)+)/i,
    );
    if (m && isFullName(m[1])) return m[1].trim();
  }
  return undefined;
}

function extractTreatmentFromTranscript(lines: TranscriptLine[]): string | undefined {
  const joined = lines
    .filter((l) => l.role === "user")
    .map((l) => l.text)
    .join(" ")
    .toLowerCase();

  const patterns: Array<{ re: RegExp; label: string }> = [
    { re: /\blaser hair removal\b/, label: "Laser Hair Removal" },
    { re: /\bbotox\b/, label: "Botox" },
    { re: /\bdermal fillers?\b/, label: "Dermal Fillers" },
    { re: /\bhydrafacial\b/, label: "HydraFacial" },
    { re: /\bmicroneedling\b/, label: "Microneedling" },
    { re: /\biv vitamin\b/, label: "IV Vitamin Therapy" },
    { re: /\bnad\+\b/, label: "NAD+" },
    { re: /\bconsultation\b/, label: "Consultation" },
  ];

  for (const { re, label } of patterns) {
    if (re.test(joined)) return label;
  }
  return undefined;
}

export function enrichVoiceToolInput(
  toolName: string,
  input: Record<string, unknown>,
  transcript: TranscriptLine[],
  session: VoiceBookingSession,
): void {
  const transcriptTreatment = extractTreatmentFromTranscript(transcript);
  const treatment = String(
    input.treatment ?? session.treatment ?? transcriptTreatment ?? "",
  ).trim();

  if (treatment && !input.treatment) input.treatment = treatment;

  if (toolName === "check_availability" || toolName === "find_earliest_availability") {
    stripTreatmentAsPractitioner(input, treatment);
    if (!input.duration_minutes && session.durationMinutes) {
      input.duration_minutes = session.durationMinutes;
    }
    if (toolName === "check_availability" && !input.date && session.date) {
      input.date = session.date;
    }
    if (treatment && !session.treatment) session.treatment = treatment;
  }

  if (CANCEL_RESCHEDULE_TOOLS.has(toolName)) {
    const phone =
      findVoicePhone(transcript) ||
      session.lastUpcoming?.phone ||
      String(input.phone ?? input.client_contact ?? "").trim() ||
      undefined;
    if (phone) {
      input.phone = phone;
      input.client_contact = phone;
    }
    if (session.lastUpcoming?.eventId && !input.event_id) {
      input.event_id = session.lastUpcoming.eventId;
    }
  }

  if (toolName === "upsert_client") {
    const resolved = resolveVoiceBookingEmail(transcript, input.email);
    if (resolved) input.email = resolved;
  }

  if (toolName === "book_appointment") {
    const name = String(input.client_name ?? "").trim() || extractNameFromTranscript(transcript);
    if (name && !input.client_name) input.client_name = name;

    const phone = findVoicePhone(transcript);
    if (phone && !input.client_contact) input.client_contact = phone;

    const resolved = resolveVoiceBookingEmail(transcript, input.client_email);
    if (resolved) input.client_email = resolved;

    if (!input.treatment && session.treatment) input.treatment = session.treatment;
    if (!input.date && session.date) input.date = session.date;
    if (!input.duration_minutes && session.durationMinutes) {
      input.duration_minutes = session.durationMinutes;
    }

    stripTreatmentAsPractitioner(input, treatment);

    const dateTime = String(input.date_time ?? "").trim();
    if (dateTime && session.lastSlots?.length) {
      const slot = session.lastSlots.find((s) => s.startTime === dateTime);
      if (slot) {
        if (!input.practitioner_name && slot.availablePractitioners?.[0]) {
          input.practitioner_name = slot.availablePractitioners[0];
        }
        if (!input.room && slot.availableRooms?.[0]) {
          input.room = slot.availableRooms[0];
        }
      }
    }
  }
}

/** Fields voice actually requires: treatment, phone, and a chosen slot. Name is asked for but never blocks; email/birthday are never collected on this channel. */
export function missingVoiceBookingFields(
  input: Record<string, unknown>,
  transcript: TranscriptLine[],
): string[] {
  const missing: string[] = [];
  if (!String(input.treatment ?? extractTreatmentFromTranscript(transcript) ?? "").trim()) {
    missing.push("treatment");
  }
  if (!String(input.client_contact ?? "").trim() && !findVoicePhone(transcript)) {
    missing.push("phone");
  }
  if (!String(input.date_time ?? "").trim())
    missing.push("chosen slot (date_time from check_availability)");
  return missing;
}

/** Block empty or nearly-empty book_appointment before the API round-trip. */
export function getPrematureBookBlockReason(
  input: Record<string, unknown>,
  transcript: TranscriptLine[],
): string | null {
  const hasPayload = Boolean(
    input.client_name ||
    input.treatment ||
    input.date_time ||
    input.client_contact ||
    input.client_email,
  );
  if (!hasPayload) {
    const still = missingVoiceBookingFields(input, transcript);
    const hint =
      still.length > 0
        ? ` Still need: ${still.join(", ")}.`
        : " Collect all booking fields before calling this tool.";
    return `Do not call book_appointment with an empty payload.${hint} Ask for any missing items one at a time — never re-ask for info the caller already gave. When everything is ready, say "Locking in your appointment now!" and call book_appointment once with ALL fields.`;
  }

  const missing = missingVoiceBookingFields(input, transcript);
  if (missing.length > 0) {
    return `book_appointment is missing required fields (${missing.join(", ")}). Collect those before calling this tool again.`;
  }
  return null;
}

/** Block cancel_appointment when phone and event_id are still missing after enrichment. */
export function getPrematureCancelBlockReason(
  input: Record<string, unknown>,
  transcript: TranscriptLine[],
  session: VoiceBookingSession,
): string | null {
  const phone =
    String(input.phone ?? input.client_contact ?? "").trim() ||
    findVoicePhone(transcript) ||
    session.lastUpcoming?.phone ||
    "";
  const eventId = String(input.event_id ?? session.lastUpcoming?.eventId ?? "").trim();
  if (phone || eventId) return null;
  return (
    "cancel_appointment needs the caller's phone (or client_contact) or event_id from " +
    "find_upcoming_appointment. Ask for their phone number, call find_upcoming_appointment, " +
    "then call cancel_appointment after they confirm cancellation."
  );
}

export function updateVoiceBookingSession(
  toolName: string,
  input: Record<string, unknown>,
  output: unknown,
  session: VoiceBookingSession,
): void {
  const treatment = String(input.treatment ?? "").trim();
  if (treatment) session.treatment = treatment;
  if (input.duration_minutes) session.durationMinutes = Number(input.duration_minutes);
  if (input.date) session.date = String(input.date);

  if (
    toolName === "find_upcoming_appointment" &&
    output &&
    typeof output === "object" &&
    (output as Record<string, unknown>).found === true
  ) {
    const r = output as Record<string, unknown>;
    const eventId = String(r.event_id ?? "").trim();
    if (eventId) {
      session.lastUpcoming = {
        eventId,
        phone:
          String(input.phone ?? input.client_contact ?? "").trim() || session.lastUpcoming?.phone,
        clientName: String(r.client_name ?? "").trim() || undefined,
        treatment: String(r.treatment ?? "").trim() || undefined,
      };
    }
  }

  if (
    (toolName === "check_availability" || toolName === "find_earliest_availability") &&
    output &&
    typeof output === "object" &&
    !("error" in (output as Record<string, unknown>))
  ) {
    const r = output as Record<string, unknown>;
    if (r.date) session.date = String(r.date);
    if (r.durationMinutes) session.durationMinutes = Number(r.durationMinutes);
    if (Array.isArray(r.slots)) session.lastSlots = r.slots as VoiceSlotMemory[];
    if (Array.isArray(r.availablePractitioners)) {
      session.practitionerNames = r.availablePractitioners as string[];
    }
  }

  if (
    toolName === "book_appointment" &&
    output &&
    typeof output === "object" &&
    !("error" in (output as Record<string, unknown>))
  ) {
    const r = output as Record<string, unknown>;
    const eventId = String(r.event_id ?? r.id ?? "").trim();
    if (eventId) {
      session.lastUpcoming = {
        eventId,
        phone: String(input.client_contact ?? input.phone ?? "").trim() || undefined,
        clientName: String(r.clientName ?? input.client_name ?? "").trim() || undefined,
        treatment: String(r.treatment ?? input.treatment ?? "").trim() || undefined,
      };
    }
  }
}
