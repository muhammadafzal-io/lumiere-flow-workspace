import { logFlowStep } from "@/lib/voice/flow-context";
import { lookupClientByPhone } from "@/lib/integrations/airtable";
import { isValidBirthdayInput, normalizeBirthdayForStorage } from "@/lib/birthday";
import { normalizeEmail } from "@/lib/email";
import { phoneSearchVariants, extractPhoneForLookup, phoneDigits, phonesMatch } from "@/lib/phone";
import { fullNameValidationError, isFullName } from "@/lib/agent/client-name";
import { isAppointmentPast } from "@/lib/appointment-lock";
import { getClinicConfig } from "@/lib/clinic-config";

export { normalizeEmail };

async function formatPastAppointmentTime(iso: string): Promise<string> {
  const { timezone } = await getClinicConfig();
  return new Date(iso).toLocaleString("en-US", {
    timeZone: timezone,
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/** Normalize email on booking payloads (strips spaces from speech/typing, e.g. "talha azeem@gmail.com"). */
export function sanitizeBookingEmails(input: Record<string, unknown>): void {
  const normalized = normalizeEmail(input.client_email);
  if (normalized) input.client_email = normalized;
  const portal = normalizeEmail(input.clientEmail);
  if (portal) input.clientEmail = portal;
}

export function hasValidBirthday(input: Record<string, unknown>): boolean {
  const bday = input.birthday;
  return typeof bday === "string" && isValidBirthdayInput(bday);
}

function normalizeNamePart(part: string): string {
  return part.toLowerCase().replace(/[^a-z]/g, "");
}

function areNamesLikelySame(a: string, b: string): boolean {
  const aParts = a.trim().split(/\s+/).map(normalizeNamePart).filter(Boolean);
  const bParts = b.trim().split(/\s+/).map(normalizeNamePart).filter(Boolean);

  if (!aParts.length || !bParts.length) return false;
  if (aParts.join("") === bParts.join("")) return true;

  const aFirst = aParts[0];
  const aLast = aParts[aParts.length - 1];
  const bFirst = bParts[0];
  const bLast = bParts[bParts.length - 1];

  if (aFirst === bFirst && aLast === bLast) return true;
  if (aFirst === bLast && aLast === bFirst) return true;
  return false;
}

/** @deprecated Use hasValidBirthday — birthday cannot be skipped. */
export function hasBirthdayCollected(input: Record<string, unknown>): boolean {
  return hasValidBirthday(input);
}

/** Fill client_email / birthday from Supabase when upsert_client ran earlier in the session. */
export async function enrichBookingInput(input: Record<string, unknown>): Promise<void> {
  logFlowStep("book:enrichBookingInput:start", {
    phone: input.client_contact,
    hasEmail: Boolean(input.client_email),
    hasBirthday: hasValidBirthday(input),
  });
  sanitizeBookingEmails(input);
  if (!input.client_contact) {
    logFlowStep("book:enrichBookingInput:skip", { reason: "no phone" });
    return;
  }

  const client = await lookupClientByPhone(String(input.client_contact)).catch(() => null);
  if (!client) {
    logFlowStep("book:enrichBookingInput:crm miss");
    return;
  }

  logFlowStep("book:enrichBookingInput:crm found", {
    clientId: client.id,
    name: client.name,
    email: client.email,
  });

  if (!normalizeEmail(input.client_email) && client.email) {
    input.client_email = client.email;
  }
  if (!hasValidBirthday(input) && client.birthday && isValidBirthdayInput(client.birthday)) {
    input.birthday = normalizeBirthdayForStorage(client.birthday);
  }
  logFlowStep("book:enrichBookingInput:end", {
    client_email: input.client_email,
    birthday: input.birthday,
  });
}

/**
 * Booking gate — behavior depends on the calling channel:
 *
 * - **Chat (default)**: full name, treatment, phone, time, a valid email, and a valid birthday
 *   are all required inline, same as before the voice-only completion-link redesign. Chat has
 *   no speech-recognition risk, so there's no reason to defer these fields.
 * - **Voice** (`requireFullProfile: false`): only treatment, phone, and time are required — name,
 *   email, and birthday are collected afterward via the booking-completion link
 *   (`src/lib/booking/completion-link.ts`), since phone-call speech recognition is exactly the
 *   hallucination risk that redesign exists to avoid. If the caller volunteers a name anyway it's
 *   still accepted (validated as a full name if present), just never required.
 *
 * `enrichBookingInput` still opportunistically backfills email/birthday from an existing CRM
 * record when a *returning* client already has them on file, for both channels.
 */
export async function validateBookAppointment(
  input: Record<string, unknown>,
  opts?: { requireFullProfile?: boolean },
): Promise<string | null> {
  logFlowStep("book:validateBookAppointment:start", {
    client_name: input.client_name,
    treatment: input.treatment,
    date_time: input.date_time,
  });
  await enrichBookingInput(input);
  const requireFullProfile = opts?.requireFullProfile !== false;

  const missing: string[] = [];
  const clientName = String(input.client_name ?? "").trim();
  if (requireFullProfile) {
    if (!clientName) missing.push("client_name");
    else if (!isFullName(clientName)) missing.push("client_name (full first and last name)");
  }
  // Voice (!requireFullProfile): any non-empty name is accepted as-is — a casual first name
  // is what's asked for on this channel, full legal name is collected later via the form.
  if (!String(input.treatment ?? "").trim()) missing.push("treatment");
  if (!String(input.client_contact ?? "").trim()) missing.push("client_contact (phone)");
  if (!String(input.date_time ?? "").trim()) missing.push("date_time");

  if (requireFullProfile) {
    if (!normalizeEmail(input.client_email)) missing.push("client_email");
    if (input.birthday_skipped === true || input.birthdaySkipped === true) {
      const error =
        "Birthday is required to book. Ask for the client's full date of birth (month, day, and year), save it via upsert_client, then pass birthday as YYYY-MM-DD in book_appointment.";
      logFlowStep("book:validateBookAppointment:failed", { error });
      return error;
    }
    if (!hasValidBirthday(input)) {
      missing.push("birthday (required — YYYY-MM-DD, e.g. 1990-03-15)");
    }
  }

  // Data-integrity check, independent of requireFullProfile — catches a phone number already
  // on file under a different person's name, for both the full-profile (chat) and relaxed
  // (voice) gates.
  const phone = String(input.client_contact ?? "").trim();
  if (phone && clientName && isFullName(clientName)) {
    const existing = await lookupClientByPhone(phone).catch(() => null);
    if (existing?.name && !areNamesLikelySame(existing.name, clientName)) {
      const error = `This phone number is already linked to ${existing.name}. Use the same client name for this phone, or confirm a different phone number before booking.`;
      logFlowStep("book:validateBookAppointment:failed", { error, existingName: existing.name });
      return error;
    }
  }

  if (missing.length === 0) {
    logFlowStep("book:validateBookAppointment:passed");
    return null;
  }
  const suffix = requireFullProfile
    ? `Collect full name, phone, email, and birthday BEFORE saying "Locking in your appointment now!"`
    : `Collect phone and treatment BEFORE booking — name, email, and birthday are collected afterward via the completion link.`;
  const error =
    requireFullProfile && clientName && !isFullName(clientName)
      ? `${fullNameValidationError("client_name")} ${missing.length > 1 ? `Also missing: ${missing.filter((m) => !m.startsWith("client_name")).join(", ")}.` : ""}`
      : `Cannot book: missing required fields: ${missing.join(", ")}. ${suffix}`;
  logFlowStep("book:validateBookAppointment:failed", { error, missing });
  return error;
}

/**
 * Waitlist gate — deliberately lighter than validateBookAppointment: a waitlist entry never
 * creates a real commitment (no calendar write, no client-facing confirmation), so it only needs
 * enough to be contactable and matchable later — treatment, the date they wanted, and a phone
 * number. Name/email are accepted if given but never required.
 */
export function validateWaitlistEntry(input: Record<string, unknown>): string | null {
  logFlowStep("waitlist:validateWaitlistEntry:start", {
    treatment: input.treatment,
    preferred_date: input.preferred_date,
  });
  const missing: string[] = [];
  if (!String(input.treatment ?? "").trim()) missing.push("treatment");
  if (!String(input.preferred_date ?? "").trim()) missing.push("preferred_date");
  if (!String(input.client_contact ?? "").trim()) missing.push("client_contact (phone)");

  if (missing.length === 0) {
    logFlowStep("waitlist:validateWaitlistEntry:passed");
    return null;
  }
  const error = `Cannot add to waitlist: missing required fields: ${missing.join(", ")}.`;
  logFlowStep("waitlist:validateWaitlistEntry:failed", { error, missing });
  return error;
}

export function validatePortalBooking(input: {
  clientName?: string;
  clientContact?: string;
  clientEmail?: string;
  treatment?: string;
  startTime?: string;
  endTime?: string;
  practitionerName?: string;
  room?: string;
  birthday?: string;
}): string | null {
  const missing: string[] = [];
  const clientName = String(input.clientName ?? "").trim();
  if (!clientName) missing.push("client name");
  else if (!isFullName(clientName)) missing.push("client full name (first and last)");
  if (!String(input.treatment ?? "").trim()) missing.push("treatment");
  if (!String(input.clientContact ?? "").trim()) missing.push("phone");
  if (!normalizeEmail(input.clientEmail)) missing.push("email");
  if (!String(input.startTime ?? "").trim()) missing.push("appointment time");
  if (!String(input.endTime ?? "").trim()) missing.push("appointment end time");
  if (!String(input.practitionerName ?? "").trim()) missing.push("practitioner");
  if (!String(input.room ?? "").trim()) missing.push("room");
  if (!isValidBirthdayInput(input.birthday)) {
    missing.push("birthday (required)");
  }

  if (missing.length === 0) return null;
  return `Missing required booking fields: ${missing.join(", ")}. Same requirements as the chatbot booking flow.`;
}

/** Fill client_name / client_email from CRM using phone (cancel, reschedule, find). */
export async function enrichClientFromPhone(input: Record<string, unknown>): Promise<void> {
  const rawPhone = extractPhoneForLookup(String(input.phone ?? input.client_contact ?? ""));
  if (!rawPhone) return;
  if (!input.phone) input.phone = rawPhone;

  logFlowStep("fetch:crm lookup", { phone: rawPhone });

  let client = null as Awaited<ReturnType<typeof lookupClientByPhone>>;
  for (const variant of phoneSearchVariants(rawPhone)) {
    client = await lookupClientByPhone(variant).catch(() => null);
    if (client) break;
  }

  if (!client) {
    logFlowStep("fetch:crm not found", { phone: rawPhone });
    return;
  }

  logFlowStep("fetch:crm found", {
    clientId: client.id,
    name: client.name,
    email: client.email,
    phone: client.phone,
  });

  if (!normalizeEmail(input.client_email) && client.email) {
    input.client_email = client.email;
  }
  if (!String(input.client_name ?? "").trim() && client.name) {
    input.client_name = client.name;
  }
  if (!input.phone) input.phone = rawPhone;
  if (client.phone) input.crm_record_phone = client.phone;
}

export function validateUpsertClientName(name: unknown): string | null {
  const trimmed = String(name ?? "").trim();
  if (!trimmed) return "name is required";
  if (!isFullName(trimmed)) return fullNameValidationError("name");
  return null;
}

export async function enrichCancelRescheduleInput(input: Record<string, unknown>): Promise<void> {
  await enrichClientFromPhone(input);
}

/** Resolve upcoming appointment + client email from phone only (cancel / reschedule). */
export async function prepareCancelRescheduleInput(
  input: Record<string, unknown>,
): Promise<string | null> {
  logFlowStep("cancel-reschedule:prepare start", {
    phone: input.phone ?? input.client_contact,
    event_id: input.event_id,
  });

  const rawPhone = String(input.phone ?? input.client_contact ?? "").trim();
  if (!rawPhone) {
    logFlowStep("cancel-reschedule:prepare failed", { reason: "missing phone" });
    return "Phone number is required. Ask only for the client's phone — the system looks up their appointment and email automatically.";
  }

  const normalized = extractPhoneForLookup(rawPhone);
  if (phoneDigits(normalized).length < 7) {
    logFlowStep("cancel-reschedule:prepare failed", { reason: "invalid phone", rawPhone });
    return "Please provide a valid phone number so we can find the appointment.";
  }

  input.phone = normalized;
  if (!input.client_contact) input.client_contact = normalized;
  logFlowStep("cancel-reschedule:phone normalized", { phone: normalized });

  await enrichClientFromPhone(input);

  const lookupPhones = [normalized, rawPhone, input.crm_record_phone as string | undefined].filter(
    (p): p is string => Boolean(p?.trim()),
  );

  // A model-supplied event_id (e.g. reused from an earlier find_upcoming_appointment call in
  // the same session, or from book_appointment) is only trusted once verified to actually
  // belong to THIS phone number. Without this check, phone isn't really the identifier at all —
  // a stale, hallucinated, or manipulated event_id would let the caller act on any appointment
  // regardless of whose phone they gave. If it doesn't match, fall through to a fresh phone-only
  // lookup instead of trusting it.
  if (input.event_id) {
    const { getCalendarBookingDetails } = await import("@/lib/integrations/google-calendar");
    const booking = await getCalendarBookingDetails(String(input.event_id)).catch(() => null);
    const belongsToCaller =
      !!booking?.clientContact && lookupPhones.some((p) => phonesMatch(booking.clientContact, p));

    if (booking && belongsToCaller) {
      if (!String(input.client_name ?? "").trim()) input.client_name = booking.clientName;
      if (!normalizeEmail(input.client_email)) input.client_email = booking.clientEmail;
      input.appointment_treatment = input.appointment_treatment ?? booking.treatment;
      input.appointment_start_time = input.appointment_start_time ?? booking.startTime;
      input.appointment_end_time = input.appointment_end_time ?? booking.endTime;
      if (!input.duration_minutes) {
        const { durationMinutesForAppointment } =
          await import("@/lib/booking/appointment-duration");
        input.duration_minutes = durationMinutesForAppointment(booking);
      }

      if (isAppointmentPast(input.appointment_end_time as string)) {
        logFlowStep("cancel-reschedule:appointment already past", {
          event_id: input.event_id,
          end_time: input.appointment_end_time,
        });
        const when = await formatPastAppointmentTime(input.appointment_start_time as string);
        const treatment = String(input.appointment_treatment ?? "appointment");
        return `Tell the client exactly this: their ${treatment} appointment on ${when} has already passed, so it can no longer be cancelled or rescheduled. If they need a new appointment, use book_appointment instead.`;
      }

      logFlowStep("cancel-reschedule:using verified event_id", {
        event_id: input.event_id,
        client_email: input.client_email,
      });
      logFlowStep("cancel-reschedule:prepare complete", {
        event_id: input.event_id,
        client_name: input.client_name,
        treatment: input.appointment_treatment,
        start_time: input.appointment_start_time,
      });
      return null;
    }

    logFlowStep("cancel-reschedule:event_id does not match phone, ignoring", {
      event_id: input.event_id,
      phone: normalized,
    });
    delete input.event_id;
  }

  logFlowStep("cancel-reschedule:lookup appointment", { phones: lookupPhones });
  const { findUpcomingAppointmentByPhone } = await import("@/lib/booking/appointment-by-phone");
  let appt = null as Awaited<ReturnType<typeof findUpcomingAppointmentByPhone>>;
  for (const phoneCandidate of lookupPhones) {
    appt = await findUpcomingAppointmentByPhone(phoneCandidate);
    if (appt) break;
  }
  if (!appt) {
    const { findRecentPastAppointmentByPhone } = await import("@/lib/booking/appointment-by-phone");
    let pastAppt = null as Awaited<ReturnType<typeof findRecentPastAppointmentByPhone>>;
    for (const phoneCandidate of lookupPhones) {
      pastAppt = await findRecentPastAppointmentByPhone(phoneCandidate);
      if (pastAppt) break;
    }
    if (pastAppt) {
      logFlowStep("cancel-reschedule:only a past appointment found", {
        phones: lookupPhones,
        event_id: pastAppt.eventId,
        end_time: pastAppt.endTime,
      });
      const when = await formatPastAppointmentTime(pastAppt.startTime);
      return `Tell the client exactly this: their ${pastAppt.treatment} appointment on ${when} has already passed, so it can no longer be cancelled or rescheduled. If they need a new appointment, use book_appointment instead.`;
    }

    logFlowStep("cancel-reschedule:appointment not found", { phones: lookupPhones });
    return "No upcoming appointment found for this phone number. Confirm the number is correct.";
  }
  input.event_id = appt.eventId;
  if (!String(input.client_name ?? "").trim()) input.client_name = appt.clientName;
  if (!normalizeEmail(input.client_email)) input.client_email = appt.clientEmail;
  input.appointment_treatment = appt.treatment;
  input.appointment_start_time = appt.startTime;
  input.appointment_end_time = appt.endTime;
  if (!input.duration_minutes) {
    const { durationMinutesForAppointment } = await import("@/lib/booking/appointment-duration");
    input.duration_minutes = durationMinutesForAppointment(appt);
  }
  logFlowStep("cancel-reschedule:appointment resolved", {
    event_id: appt.eventId,
    client_name: appt.clientName,
    treatment: appt.treatment,
    start_time: appt.startTime,
    end_time: appt.endTime,
    client_email: appt.clientEmail,
    practitioner_name: appt.practitionerName,
    room: appt.room,
  });

  logFlowStep("cancel-reschedule:prepare complete", {
    event_id: input.event_id,
    client_name: input.client_name,
    treatment: input.appointment_treatment,
    start_time: input.appointment_start_time,
  });
  return null;
}

export async function validateCancelAppointment(
  input: Record<string, unknown>,
): Promise<string | null> {
  return prepareCancelRescheduleInput(input);
}

export async function validateRescheduleAppointment(
  input: Record<string, unknown>,
): Promise<string | null> {
  const base = await prepareCancelRescheduleInput(input);
  if (base) return base;
  if (!String(input.new_date_time ?? "").trim()) {
    logFlowStep("reschedule:validation failed", { reason: "missing new_date_time" });
    return "new_date_time is required — use the exact startTime from check_availability for the new slot.";
  }
  logFlowStep("reschedule:validation passed", { new_date_time: input.new_date_time });
  return null;
}

/** Fill escalation contact fields from CRM when phone is known. */
export async function enrichEscalationInput(input: Record<string, unknown>): Promise<void> {
  sanitizeBookingEmails(input);
  const phone = String(input.phone ?? input.client_contact ?? "").trim();
  if (phone && !input.phone) input.phone = phone;

  if (!phone) return;

  const client = await lookupClientByPhone(phone).catch(() => null);
  if (!client) return;

  if (!String(input.client_name ?? "").trim() && client.name) {
    input.client_name = client.name;
  }
  if (!normalizeEmail(input.client_email ?? input.email) && client.email) {
    input.client_email = client.email;
  }
  if (!input.phone && client.phone) input.phone = client.phone;
}

export async function validateEscalation(input: Record<string, unknown>): Promise<string | null> {
  await enrichEscalationInput(input);

  const missing: string[] = [];
  const clientName = String(input.client_name ?? "").trim();
  const phone = String(input.phone ?? input.client_contact ?? "").trim();
  const email = normalizeEmail(input.client_email ?? input.email);

  if (!clientName) missing.push("client_name (full first and last name)");
  else if (!isFullName(clientName)) missing.push("client_name (full first and last name)");
  if (!phone) missing.push("phone");
  if (!email) missing.push("client_email");

  if (missing.length === 0) return null;

  return `Cannot escalate yet — collect ${missing.join(", ")} before calling escalate_to_human. Ask: "Before I connect you with our team, may I have your full name, phone number, and email so they can reach you?" Then call upsert_client, then escalate.`;
}
