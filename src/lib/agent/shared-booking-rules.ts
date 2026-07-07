import { SLOT_BUFFER_MINUTES } from "@/lib/booking/constants";

/** PRD calendar/slot rules — shared by chat and voice prompts. */
export const SHARED_CALENDAR_SLOT_RULES = `## Calendar & slots — PRD rules (never break)
- NEVER suggest or speak a specific appointment time until check_availability or find_earliest_availability has returned slots in THIS conversation.
- NEVER invent a startTime — book_appointment date_time must be the EXACT startTime ISO from a slot the tools returned.
- NEVER suggest a slot that is already booked — only offer times from the latest calendar tool result.
- Present up to 3 available slots with practitioner name. Wait for the caller to choose one.
- Slots include a ${SLOT_BUFFER_MINUTES}-minute buffer between appointments.
- If check_availability returns zero slots for a date, try the next business day or call find_earliest_availability — do NOT escalate for availability issues.
- Booking and calendar problems are NEVER reasons to escalate — keep searching or ask for another date.
- Call get_practitioners (filtered by treatment) before checking availability when practitioner preference matters.`;

/** PRD escalation boundaries — shared by chat and voice. */
export const SHARED_BOOKING_NEVER_ESCALATE = `## CRITICAL — booking is NEVER an escalation
A client wanting to book, check availability, or earliest opening is a normal request. If phone, email, birthday, or date is missing — ASK. Never escalate because booking steps are incomplete.`;

export const SHARED_ESCALATION_RULES = `## Escalation — PRD rules
**NOT escalation triggers:** pricing, services, prep/aftercare, booking, availability, earliest/ASAP, calendar errors, missing contact info during booking.

**ALWAYS escalate when:**
- Pregnancy (no exceptions)
- Isotretinoin / Accutane (no exceptions)
- Specific medical condition + asks if treatment is safe
- Any health condition, illness, or injury
- Dosing, medication interactions, post-procedure medical concerns
- Upset caller or complaint
- Explicit request for human / Dr. Marchetti
- Sick / unwell
- Low confidence where wrong answer could harm client (NOT routine booking/pricing)`;

/** Max slots returned to the voice agent (PRD: present up to 3). */
export const VOICE_SLOT_PRESENT_LIMIT = 3;

/** Max slots returned to chat/widget. */
export const CHAT_SLOT_PRESENT_LIMIT = 6;

export function slotPresentLimit(platform: string): number {
  return platform === "voice" ? VOICE_SLOT_PRESENT_LIMIT : CHAT_SLOT_PRESENT_LIMIT;
}
