/**
 * Classifies a customer's freeform reply to a post-treatment follow-up as POSITIVE, NEUTRAL, or
 * NEGATIVE — used to decide whether to send a Google Review request (see review-request.ts).
 * No AI/sentiment service exists anywhere in this codebase (confirmed by search); this mirrors the
 * established pattern this app already uses for lightweight text classification —
 * src/lib/voice/booking-intent.ts's regex-based detectVoiceBookingIntent — rather than introducing
 * a new LLM dependency for a small, deterministic, easily-testable decision.
 */
export type FollowupSentiment = "POSITIVE" | "NEUTRAL" | "NEGATIVE";

// Checked first: negation/negative constructs always win, even if a positive word also appears
// in the same message (e.g. "It was not amazing" must not read as POSITIVE).
const NEGATIVE_RE =
  /\b(disappointed|disappointing|unhappy|dissatisfied|not\s+(?:very\s+)?(?:happy|satisfied|great|good|amazing|impressed|worth it)|was ?n['’]?t\s+(?:happy|satisfied|great|good|impressed)|did ?n['’]?t\s+(?:like|enjoy|love|care for)|do ?n['’]?t\s+(?:like|recommend)|wo(?:uld)? ?n['’]?t\s+recommend|bad|terrible|awful|horrible|poor(?:ly)?|worst|hate(?:d)?|regret(?:ted)?|complain(?:t)?|refund|waste of (?:money|time)|never again|1\s*(?:stars?|\/\s*5)|2\s*(?:stars?|\/\s*5))\b/i;

const POSITIVE_RE =
  /\b(great|excellent|amazing|awesome|wonderful|fantastic|perfect|love(?:d|ing)?|happy|satisfied|thrilled|pleased|glad|best|incredible|enjoy(?:ed|ing)?|highly recommend|exceeded (?:my )?expectations|5\s*(?:stars?|\/\s*5)|4\s*(?:stars?|\/\s*5))\b/i;

export function classifyFollowupResponse(text: string): FollowupSentiment {
  const t = text.trim();
  if (!t) return "NEUTRAL";
  if (NEGATIVE_RE.test(t)) return "NEGATIVE";
  if (POSITIVE_RE.test(t)) return "POSITIVE";
  return "NEUTRAL";
}
