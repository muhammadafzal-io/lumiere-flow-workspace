import { extractPhoneForLookup, phoneDigits } from "@/lib/phone";

const SPOKEN_DIGIT_WORDS: Record<string, string> = {
  zero: "0",
  oh: "0",
  one: "1",
  two: "2",
  three: "3",
  four: "4",
  five: "5",
  six: "6",
  seven: "7",
  eight: "8",
  nine: "9",
};

function collapseSpokenDigitRun(text: string): string {
  const parts = text.toLowerCase().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.every((p) => SPOKEN_DIGIT_WORDS[p] || /^\d+$/.test(p))) {
    return parts
      .map((p) => (SPOKEN_DIGIT_WORDS[p] ? SPOKEN_DIGIT_WORDS[p] : p.replace(/\D/g, "")))
      .join("");
  }
  return phoneDigits(text);
}

/** Best phone from caller speech (digit words and spaced digits). */
export function findVoicePhone(lines: Array<{ role: string; text: string }>): string | undefined {
  const candidates: string[] = [];

  for (const line of lines) {
    if (line.role !== "user") continue;
    const lower = line.text.toLowerCase();
    if (!/(phone|number|call me|reach me|\+\d|plus\s+\d|\d{3})/i.test(lower) && !/\d/.test(lower)) {
      continue;
    }

    const collapsed = collapseSpokenDigitRun(lower.replace(/plus/gi, "+"));
    if (collapsed.length >= 7) candidates.push(collapsed);

    const embedded = [...lower.matchAll(/\+?[\d\s().-]{10,}/g)].map((m) => phoneDigits(m[0]));
    candidates.push(...embedded.filter((d) => d.length >= 7));
  }

  const normalized = candidates
    .map((c) => extractPhoneForLookup(c))
    .filter((p) => phoneDigits(p).length >= 10);

  if (normalized.length === 0) return undefined;
  return normalized[normalized.length - 1];
}

export const VOICE_PHONE_TOOLS = new Set([
  "book_appointment",
  "upsert_client",
  "lookup_client",
  "find_upcoming_appointment",
  "cancel_appointment",
  "check_reschedule_availability",
  "reschedule_appointment",
  "validate_credit_code",
  "escalate_to_human",
]);

export function applyVoicePhoneToInput(
  input: Record<string, unknown>,
  phone: string | undefined,
  opts?: { force?: boolean },
): void {
  if (!phone) return;
  if (opts?.force || "client_contact" in input || "phone" in input) {
    input.client_contact = phone;
    input.phone = phone;
  }
}
