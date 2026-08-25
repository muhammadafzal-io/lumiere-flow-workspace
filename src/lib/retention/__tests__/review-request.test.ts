import { describe, expect, it } from "vitest";
import { decideReviewRequestOutcome } from "@/lib/retention/review-decision";

function decision(overrides: Partial<Parameters<typeof decideReviewRequestOutcome>[0]> = {}) {
  return decideReviewRequestOutcome({
    sentiment: "POSITIVE",
    hasReviewUrl: true,
    alreadyRequested: false,
    ...overrides,
  });
}

describe("decideReviewRequestOutcome", () => {
  it("sends when the response is positive, a review URL is configured, and none was sent yet", () => {
    expect(decision()).toEqual({ action: "send" });
  });

  it("skips a negative response and never sends", () => {
    expect(decision({ sentiment: "NEGATIVE" })).toEqual({
      action: "skip",
      reason: "negative response",
    });
  });

  it("skips a neutral response", () => {
    expect(decision({ sentiment: "NEUTRAL" })).toEqual({
      action: "skip",
      reason: "neutral response",
    });
  });

  it("skips a positive response when no Google Review URL is configured", () => {
    expect(decision({ hasReviewUrl: false })).toEqual({
      action: "skip",
      reason: "missing google review url",
    });
  });

  it("skips a duplicate request even when the response is positive and a URL is configured", () => {
    expect(decision({ alreadyRequested: true })).toEqual({
      action: "skip",
      reason: "duplicate request",
    });
  });

  it("duplicate check wins over every other reason", () => {
    expect(
      decision({ alreadyRequested: true, sentiment: "NEGATIVE", hasReviewUrl: false }),
    ).toEqual({ action: "skip", reason: "duplicate request" });
  });
});
