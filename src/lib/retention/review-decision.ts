import type { FollowupSentiment } from "@/lib/retention/sentiment";

export type ReviewRequestSkipReason =
  | "negative response"
  | "neutral response"
  | "missing google review url"
  | "duplicate request";

export interface ReviewDecisionInput {
  sentiment: FollowupSentiment;
  hasReviewUrl: boolean;
  alreadyRequested: boolean;
}

export type ReviewDecision =
  | { action: "send" }
  | { action: "skip"; reason: ReviewRequestSkipReason };

/**
 * Pure decision: given a classified sentiment and the two preconditions ("is a review URL
 * configured" / "was one already requested for this booking"), decide whether to send — no I/O,
 * fully unit-testable, same pure/impure split convention as computePostBookingOffers in
 * offer-events.ts. Kept in its own file (no imports of anything DB-backed) so it stays importable
 * from tests regardless of what review-request.ts's other imports pull in transitively.
 * Order: duplicate check first (cheapest, avoids re-deciding something already settled), then
 * sentiment, then the URL precondition.
 */
export function decideReviewRequestOutcome(input: ReviewDecisionInput): ReviewDecision {
  if (input.alreadyRequested) return { action: "skip", reason: "duplicate request" };
  if (input.sentiment === "NEGATIVE") return { action: "skip", reason: "negative response" };
  if (input.sentiment === "NEUTRAL") return { action: "skip", reason: "neutral response" };
  if (!input.hasReviewUrl) return { action: "skip", reason: "missing google review url" };
  return { action: "send" };
}
