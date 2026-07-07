/** Detect whether the voice call is a new booking vs cancel/reschedule. */

export type VoiceBookingIntent = "new" | "cancel_reschedule" | "unknown";

const CANCEL_RE =
  /\b(cancel(?:l)?(?:ing)?|cancellation|don'?t want (?:it|the appointment)|can'?t make it|won'?t be able to make it|remove my appointment)\b/i;

const RESCHEDULE_RE =
  /\b(reschedule|re-?schedule|change my appointment|move my appointment|different time for my (?:appointment|booking)|postpone my appointment|different (?:day|time)|new date|another (?:day|time))\b/i;

const CANCEL_RESCHEDULE_RE =
  /\b(cancel(?:l)?(?:ing)?|reschedule|re-schedule|change my appointment|move my appointment|different time for my (?:appointment|booking)|postpone my appointment)\b/i;

const NEW_BOOKING_RE =
  /\b(book(?:ing)?(?:\s+(?:an?\s+)?appointment)?|new appointment|schedule(?:\s+(?:an?\s+)?appointment)?|want to come in|appointment on|i want (?:a|an|to)\s)/i;

const RESCHEDULE_ONLY_TOOLS = new Set([
  "find_upcoming_appointment",
  "check_reschedule_availability",
  "cancel_appointment",
  "reschedule_appointment",
]);

export function isRescheduleOnlyTool(toolName: string): boolean {
  return RESCHEDULE_ONLY_TOOLS.has(toolName);
}

export function detectVoiceBookingIntent(
  lines: Array<{ role: string; text: string }>,
): VoiceBookingIntent {
  const full = lines.map((l) => l.text).join(" ");
  const user = lines
    .filter((l) => l.role === "user")
    .map((l) => l.text)
    .join(" ");

  const cancelReschedule = CANCEL_RESCHEDULE_RE.test(full);
  const newBooking = NEW_BOOKING_RE.test(user) || NEW_BOOKING_RE.test(full);

  if (cancelReschedule && !/\bnot\s+(?:cancel|reschedule)\b/i.test(full)) {
    return "cancel_reschedule";
  }
  if (newBooking) return "new";
  return "unknown";
}

export function blockRescheduleToolDuringNewBooking(
  toolName: string,
  intent: VoiceBookingIntent,
): string | null {
  if (intent !== "new" || !isRescheduleOnlyTool(toolName)) return null;
  return (
    "This caller is booking a NEW appointment — do NOT use find_upcoming_appointment, " +
    "check_reschedule_availability, cancel_appointment, or reschedule_appointment. " +
    "When they pick a practitioner (e.g. Dr. Dao), call check_availability with date (YYYY-MM-DD) " +
    "and practitioner_name — then present slots and book_appointment."
  );
}

/** Caller asked to cancel (not reschedule) — block reschedule tools. */
export function userWantsCancelOnly(lines: Array<{ role: string; text: string }>): boolean {
  const user = lines
    .filter((l) => l.role === "user")
    .map((l) => l.text)
    .join(" ");
  if (!CANCEL_RE.test(user)) return false;
  return !RESCHEDULE_RE.test(user);
}

export function blockRescheduleToolDuringCancel(
  toolName: string,
  lines: Array<{ role: string; text: string }>,
): string | null {
  if (!userWantsCancelOnly(lines)) return null;
  if (toolName !== "check_reschedule_availability" && toolName !== "reschedule_appointment") {
    return null;
  }
  return (
    "The caller wants to CANCEL their appointment — do NOT call check_reschedule_availability or " +
    "reschedule_appointment. After they confirm, call cancel_appointment with phone (or client_contact) " +
    "from this call, or event_id from find_upcoming_appointment."
  );
}
