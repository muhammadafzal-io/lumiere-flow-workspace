/**
 * Secure, single-use "finish your booking" link. The AI collects only name + phone + service
 * during a call/chat and books immediately; this link is how the customer later fills in the
 * fields most prone to speech-recognition errors (email, birthday) themselves, on a real form.
 */
import crypto from "crypto";
import { getSupabase } from "@/lib/supabase";
import { getAppBaseUrl } from "@/lib/client-channels";
import {
  patchCalendarBookingFields,
  getCalendarBookingDetails,
  type CalendarBookingDetails,
} from "@/lib/integrations/google-calendar";
import { upsertClient, lookupClient } from "@/lib/integrations/airtable";
import { sendBookingConfirmationEmail } from "@/lib/booking/confirmation-email";
import { normalizeBirthdayForStorage, isValidBirthdayInput } from "@/lib/birthday";
import { isFullName } from "@/lib/agent/client-name";

/** Grace period always ends at least this long before the appointment itself, never after. */
const LEAD_BUFFER_MS = 60 * 60_000;
const MIN_WINDOW_MS = 30 * 60_000;
const MAX_WINDOW_MS = 24 * 60 * 60_000;
export const TABLE = "BookingCompletions";

/** Calendar-event placeholder when voice books without a name (name is now deferred to the completion form too). Never shown to the client — filtered back out to blank wherever it'd otherwise be displayed or pre-filled. */
export const PENDING_NAME_PLACEHOLDER = "New Client (name pending)";

export type DeliveryChannel = "email" | "sms" | "chat_reply" | "none";

export interface BookingCompletionRecord {
  token: string;
  eventId: string;
  phone: string;
  clientName: string | null;
  treatment: string | null;
  status: "pending" | "completed" | "expired";
  expiresAt: string;
  createdAt: string;
  deliveryChannel: DeliveryChannel | null;
  remindedAt: string | null;
  deliveryError: string | null;
}

export function mapCompletionRow(r: any): BookingCompletionRecord {
  const expired = r.status === "pending" && new Date(r.expires_at).getTime() < Date.now();
  return {
    token: r.token,
    eventId: r.event_id,
    phone: r.phone,
    clientName: r.client_name,
    treatment: r.treatment,
    status: expired ? "expired" : r.status,
    expiresAt: r.expires_at,
    createdAt: r.created_at,
    deliveryChannel: r["DeliveryChannel"] ?? null,
    remindedAt: r["RemindedAt"] ?? null,
    deliveryError: r["DeliveryError"] ?? null,
  };
}

/** Never outlives the appointment: ends 1h before it, capped to [30min, 24h] from now. */
function computeExpiry(appointmentStartIso: string): string {
  const now = Date.now();
  const untilAppointment = new Date(appointmentStartIso).getTime() - now - LEAD_BUFFER_MS;
  const windowMs = Math.min(MAX_WINDOW_MS, Math.max(MIN_WINDOW_MS, untilAppointment));
  return new Date(now + windowMs).toISOString();
}

export async function createCompletionLink(opts: {
  eventId: string;
  phone: string;
  clientName?: string;
  treatment?: string;
  appointmentStartTime: string;
  deliveryChannel: DeliveryChannel;
}): Promise<{ token: string; url: string }> {
  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = computeExpiry(opts.appointmentStartTime);

  const sb = getSupabase();
  const { error } = await sb.from(TABLE).insert({
    token,
    event_id: opts.eventId,
    phone: opts.phone,
    client_name: opts.clientName ?? null,
    treatment: opts.treatment ?? null,
    expires_at: expiresAt,
    DeliveryChannel: opts.deliveryChannel,
  });
  if (error) throw new Error(`createCompletionLink: ${error.message}`);

  return { token, url: `${getAppBaseUrl()}/booking/complete/${token}` };
}

/** Records a background delivery failure (Item 1's fire-and-forget send) so it surfaces on the Pending Bookings staff page instead of only a server log. */
export async function markCompletionDeliveryError(token: string, message: string): Promise<void> {
  const sb = getSupabase();
  await sb
    .from(TABLE)
    .update({ DeliveryError: message.slice(0, 500) })
    .eq("token", token);
}

/** Fetches the link's status plus the underlying booking details, or null if the token doesn't exist. */
export async function getCompletionLink(
  token: string,
): Promise<{ link: BookingCompletionRecord; booking: CalendarBookingDetails } | null> {
  const sb = getSupabase();
  const { data } = await sb.from(TABLE).select("*").eq("token", token).maybeSingle();
  if (!data) return null;

  const link = mapCompletionRow(data);
  const booking = await getCalendarBookingDetails(link.eventId).catch(() => null);
  if (!booking) return null;

  return { link, booking };
}

export interface CompleteBookingInput {
  fullName: string;
  email: string;
  birthday: string;
}

/** Validates the submitted form fields server-side. Returns field-level errors, or null if all valid. */
export function validateCompletionInput(
  input: Partial<CompleteBookingInput>,
): Record<string, string> | null {
  const errors: Record<string, string> = {};

  const fullName = (input.fullName ?? "").trim();
  if (!fullName) errors.fullName = "Full name is required.";
  else if (!isFullName(fullName)) errors.fullName = "Please enter your first and last name.";

  const email = (input.email ?? "").trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = "Please enter a valid email address.";
  }

  if (!isValidBirthdayInput(input.birthday)) {
    errors.birthday = "Please enter a valid date of birth.";
  }

  return Object.keys(errors).length > 0 ? errors : null;
}

export type CompleteBookingResult =
  | { ok: true }
  | { ok: false; error: string; errors?: Record<string, string> };

/** Re-validates, patches the SAME calendar event (no duplicate booking), upserts the Client record, marks the link consumed, and triggers the existing confirmation email. */
export async function completeBookingLink(
  token: string,
  input: Partial<CompleteBookingInput>,
): Promise<CompleteBookingResult> {
  const found = await getCompletionLink(token);
  if (!found) return { ok: false, error: "This link is invalid." };
  const { link, booking } = found;

  if (link.status === "completed") {
    return { ok: false, error: "This booking has already been completed." };
  }
  if (link.status === "expired") {
    return { ok: false, error: "This link has expired. Please contact the clinic directly." };
  }

  const errors = validateCompletionInput(input);
  if (errors) return { ok: false, error: "Please fix the highlighted fields.", errors };

  const fullName = input.fullName!.trim();
  const email = input.email!.trim().toLowerCase();
  const birthday = normalizeBirthdayForStorage(input.birthday)!;

  await patchCalendarBookingFields(link.eventId, { clientName: fullName, email });

  await upsertClient({
    name: fullName,
    phone: link.phone,
    email,
    birthday,
  });

  const sb = getSupabase();
  await sb
    .from(TABLE)
    .update({ status: "completed", consumed_at: new Date().toISOString() })
    .eq("token", token);

  const clientRecord = await lookupClient({ phone: link.phone }).catch(() => null);
  await sendBookingConfirmationEmail({
    to: email,
    clientName: fullName,
    treatment: booking.treatment,
    startTime: booking.startTime,
    practitionerName: booking.practitionerName,
    clientId: clientRecord?.id,
    phone: link.phone,
  }).catch((err) => console.error("[completion-link] confirmation email failed:", err));

  return { ok: true };
}
