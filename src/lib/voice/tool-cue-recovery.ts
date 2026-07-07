/** Detect when the model spoke a tool cue but may not have invoked the tool. */
const CUE_PATTERNS: Array<{ pattern: RegExp; instruction: string }> = [
  {
    pattern: /pull up the calendar|check the calendar|look up the calendar|open the calendar/i,
    instruction:
      "You said you would check the calendar but check_availability was not called. Call check_availability NOW with the confirmed YYYY-MM-DD date and practitioner. Do not repeat the cue phrase — call the tool immediately, then read the available times aloud.",
  },
  {
    pattern:
      /find the soonest|soonest opening|earliest (?:opening|appointment|slot|availability)|first available/i,
    instruction:
      "You said you would find the soonest opening but find_earliest_availability was not called. Call find_earliest_availability NOW, then read up to 3 slots from the result — do not invent times.",
  },
  {
    pattern: /look up who'?s available|look up practitioners|checking practitioners/i,
    instruction:
      "You said you would look up practitioners but get_practitioners was not called. Call get_practitioners NOW, then continue the booking flow. Do not repeat the cue phrase.",
  },
  {
    pattern: /locking in your appointment/i,
    instruction:
      "You said you would lock in the appointment but book_appointment was not called. Call book_appointment NOW with all collected fields and the EXACT startTime from check_availability. Do not repeat the cue phrase.",
  },
  {
    pattern:
      /cancel(?:l)?ing your appointment|go ahead and cancel|process(?:ing)? (?:the|your) cancellation|i'?ll cancel that/i,
    instruction:
      "You said you would cancel the appointment but cancel_appointment was not called. Call cancel_appointment NOW with phone (or client_contact) from this call, or event_id from find_upcoming_appointment. Do NOT call check_reschedule_availability or reschedule_appointment when the caller wants to cancel.",
  },
  {
    pattern: /check openings for|openings for dr\.?|availability for dr\.?/i,
    instruction:
      "You are checking availability for a NEW booking. Call check_availability NOW with the confirmed YYYY-MM-DD date and practitioner_name (e.g. Dr. Dao). Do NOT call find_upcoming_appointment or check_reschedule_availability — those are only for cancel/reschedule.",
  },
];

export function getToolCueRecoveryInstruction(assistantText: string): string | null {
  const text = assistantText.trim();
  if (!text) return null;
  for (const { pattern, instruction } of CUE_PATTERNS) {
    if (pattern.test(text)) return instruction;
  }
  return null;
}
