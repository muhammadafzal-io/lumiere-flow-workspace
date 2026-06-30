/** Detect when the model spoke a tool cue but may not have invoked the tool. */
const CUE_PATTERNS: Array<{ pattern: RegExp; instruction: string }> = [
  {
    pattern: /pull up the calendar|check the calendar|look up the calendar|open the calendar/i,
    instruction:
      "You said you would check the calendar but check_availability was not called. Call check_availability NOW with the confirmed YYYY-MM-DD date and practitioner. Do not repeat the cue phrase — call the tool immediately, then read the available times aloud.",
  },
  {
    pattern: /look up who'?s available|look up practitioners|checking practitioners/i,
    instruction:
      "You said you would look up practitioners but get_practitioners was not called. Call get_practitioners NOW, then continue the booking flow. Do not repeat the cue phrase.",
  },
  {
    pattern: /locking in your appointment/i,
    instruction:
      "You said you would lock in the appointment but book_appointment was not called. Call book_appointment NOW with all collected fields. Do not repeat the cue phrase.",
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
